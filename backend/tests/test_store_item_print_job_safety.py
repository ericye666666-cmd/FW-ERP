import sys
import tempfile
from pathlib import Path

import pytest
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings
from app.core.state import InMemoryState


@pytest.fixture()
def state():
    temp_dir = tempfile.TemporaryDirectory()
    original_state_file = settings.state_file
    settings.state_file = Path(temp_dir.name) / "runtime_state.json"
    test_state = InMemoryState()
    try:
        yield test_state
    finally:
        settings.state_file = original_state_file
        temp_dir.cleanup()


def _store_item_machine_code(state: InMemoryState, sequence: int = 1) -> str:
    return state._store_item_barcode_v2_value("2026-05-10T09:00:00+03:00", sequence)


def _seed_store_item(
    state: InMemoryState,
    *,
    token_no: str = "STOREITEM260510001",
    machine_code: str = "",
    display_code: str = "",
    token_status: str = "pending_print",
    stock_in_confirmed: bool = False,
) -> dict:
    display = (display_code or token_no).strip().upper()
    machine = str(machine_code or "").strip().upper()
    row = {
        "token_id": token_no,
        "token_no": token_no,
        "identity_no": token_no,
        "identity_id": token_no,
        "entity_id": display,
        "store_item_id": display,
        "item_id": display,
        "display_code": display,
        "entity_type": "STORE_ITEM",
        "store_code": "UTAWALA",
        "assigned_employee": "Austin",
        "assigned_clerk": "Austin",
        "status": token_status,
        "store_item_status": "active",
        "sale_status": "active",
        "print_status": "pending_print",
        "machine_code": machine,
        "barcode_value": machine,
        "selling_price_kes": 450,
        "sale_price_kes": 450,
        "selected_price": 450,
        "store_rack_code": "A-01",
        "rack_code": "A-01",
        "category_name": "tops / lady tops",
        "category_main": "tops",
        "category_sub": "lady tops",
        "grade": "P",
        "task_no": "SDO260510001",
        "qty_index": 1,
        "created_at": "2026-05-10T09:00:00+03:00",
        "allowed_contexts": ["store_item_label", "store_pda", "identity_ledger", "pos"],
        "pos_allowed": True,
        "stock_in_confirmed": stock_in_confirmed,
    }
    state.item_barcode_tokens[token_no] = dict(row)
    state.store_items[display] = {
        **row,
        "status": "active",
        "print_status": "pending_print",
        "stock_in_confirmed": stock_in_confirmed,
    }
    return state.item_barcode_tokens[token_no]


def _queue_print_job(state: InMemoryState, token_no: str) -> dict:
    jobs = state.queue_item_barcode_token_print_jobs(
        {
            "requested_by": "Austin",
            "token_nos": [token_no],
            "copies": 1,
            "printer_name": "Deli DL-720C",
            "template_code": "apparel_60x40",
        }
    )
    assert len(jobs) == 1
    return jobs[0]


def test_store_item_print_job_uses_existing_machine_code_and_not_display_code(state):
    machine_code = _store_item_machine_code(state)
    token = _seed_store_item(state, machine_code=machine_code)

    job = _queue_print_job(state, token["token_no"])

    assert job["barcode"] == machine_code
    assert job["print_job_status"] == "queued"
    assert job["print_payload"]["machine_code"] == machine_code
    assert job["print_payload"]["barcode_value"] == machine_code
    assert job["print_payload"]["display_code"] == token["display_code"]
    assert job["print_payload"]["display_code"] != job["print_payload"]["barcode_value"]


def test_store_item_print_job_rejects_missing_or_display_barcode(state):
    missing = _seed_store_item(state, token_no="STOREITEM260510002", display_code="STOREITEM260510002")
    display_encoded = _seed_store_item(
        state,
        token_no="STOREITEM260510003",
        machine_code="STOREITEM260510003",
        display_code="STOREITEM260510003",
    )

    for token in (missing, display_encoded):
        with pytest.raises(HTTPException) as exc:
            _queue_print_job(state, token["token_no"])
        assert exc.value.status_code == 400
        assert "machine_code" in str(exc.value.detail)


def test_failed_store_item_print_can_reprint_same_machine_code_without_new_store_item(state):
    machine_code = _store_item_machine_code(state, 2)
    token = _seed_store_item(state, token_no="STOREITEM260510004", machine_code=machine_code)
    initial_store_item_count = len(state.store_items)

    first_job = _queue_print_job(state, token["token_no"])
    failed = state.mark_print_job_failed(first_job["id"], "Austin", "printer offline")
    second_job = _queue_print_job(state, token["token_no"])

    assert failed["print_job_status"] == "failed"
    assert first_job["print_payload"]["barcode_value"] == machine_code
    assert second_job["print_payload"]["barcode_value"] == machine_code
    assert second_job["id"] != first_job["id"]
    assert len(state.store_items) == initial_store_item_count
    assert len({row["machine_code"] for row in state.store_items.values() if row.get("machine_code")}) == initial_store_item_count


def test_store_item_print_success_does_not_confirm_stock_in_or_make_pos_saleable(state):
    machine_code = _store_item_machine_code(state, 3)
    token = _seed_store_item(state, token_no="STOREITEM260510005", machine_code=machine_code)
    job = _queue_print_job(state, token["token_no"])

    printed = state.mark_print_job_printed(job["id"], "Austin")

    token_after = state.item_barcode_tokens[token["token_no"]]
    item_after = state.store_items[token["display_code"]]
    assert printed["print_job_status"] == "success"
    assert token_after.get("stock_in_confirmed") is not True
    assert item_after.get("stock_in_confirmed") is not True
    assert token_after.get("sale_status") != "sold"
    assert item_after.get("sale_status") != "sold"
    with pytest.raises(HTTPException) as exc:
        state._validate_pos_sale_item("UTAWALA", {"machine_code": machine_code, "final_price": 450}, 1)
    assert "库存确认" in str(exc.value.detail)
