import sys
import tempfile
from pathlib import Path

import pytest

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


def _seed_pricing_batch_package(state: InMemoryState) -> dict:
    transfer_no = "TO-20260510-SDP"
    state.transfer_orders[transfer_no] = {
        "transfer_no": transfer_no,
        "from_warehouse_code": "WH1",
        "to_store_code": "UTAWALA",
        "created_by": "store_manager_1",
        "approval_required": True,
        "status": "approved",
        "approval_status": "approved",
        "created_at": "2026-05-10T08:00:00+03:00",
        "submitted_at": "2026-05-10T08:00:00+03:00",
        "approved_at": "2026-05-10T08:01:00+03:00",
        "approved_by": "warehouse_supervisor_1",
        "received_at": None,
        "received_by": None,
        "closed_at": None,
        "store_receipt_status": "not_started",
        "demand_lines": [],
        "items": [],
    }
    state.bale_barcodes["RB260510001"] = {
        "id": 1,
        "bale_barcode": "RB260510001",
        "scan_token": "RB260510001",
        "machine_code": "1260510001",
        "status": "ready_for_sorting",
        "created_at": "2026-05-10T08:00:00+03:00",
        "updated_at": "2026-05-10T08:00:00+03:00",
    }
    state.store_dispatch_bales["SDB260510001"] = {
        "bale_no": "SDB260510001",
        "bale_barcode": "SDB260510001",
        "scan_token": "SDB260510001",
        "machine_code": "2260510001",
        "transfer_no": transfer_no,
        "source_bales": ["SDB260510001"],
        "source_type": "SDB",
        "source_code": "SDB260510001",
        "status": "ready_dispatch",
        "store_code": "UTAWALA",
        "item_count": 5,
        "category_summary": "tops / lady tops / P",
        "category_name": "tops / lady tops",
        "token_nos": [],
    }
    order = state._normalize_store_delivery_execution_order(
        {
            "execution_order_no": "SDO260510001",
            "official_delivery_barcode": "SDO260510001",
            "machine_code": "4260510001",
            "source_transfer_no": transfer_no,
            "from_warehouse_code": "WH1",
            "to_store_code": "UTAWALA",
            "package_count": 1,
            "packages": [],
            "status": "pending_print",
            "created_by": "warehouse_clerk_1",
            "created_at": "2026-05-10T08:02:00+03:00",
        }
    )
    state.store_delivery_execution_orders[order["execution_order_no"]] = order
    return state._save_store_delivery_package(
        {
            "id": 901,
            "display_code": "SDP260510001",
            "package_id": "SDP260510001",
            "machine_code": "6260510001",
            "barcode_value": "6260510001",
            "parent_sdo_display_code": order["execution_order_no"],
            "parent_sdo_machine_code": order["machine_code"],
            "transfer_no": transfer_no,
            "store_code": "UTAWALA",
            "package_no": 1,
            "package_total": 1,
            "source_type": "SDB",
            "source_code": "SDB260510001",
            "source_machine_code": "2260510001",
            "item_count": 5,
            "category_summary": "tops / lady tops / P",
            "category_name": "tops / lady tops",
            "received_status": "received",
            "exception_status": "normal",
            "assigned_clerk": "Austin",
            "assignment_status": "assigned",
            "status": "assigned",
            "received_at": "2026-05-10T09:00:00+03:00",
            "received_by": "store_manager_1",
            "assigned_at": "2026-05-10T09:05:00+03:00",
            "assigned_by": "store_manager_1",
        }
    )


def _pricing_payload(package: dict, pricing_batch_id: str = "PB-SDP260510001-P") -> dict:
    return {
        "source_sdp_display_code": package["display_code"],
        "pricing_batch_id": pricing_batch_id,
        "store_code": "UTAWALA",
        "category_main": "tops",
        "category_sub": "lady tops",
        "category_short": "TOP",
        "grade": "P",
        "pricing_type": "P",
        "sale_price_kes": 450,
        "quantity": 3,
        "assigned_clerk": "Austin",
        "created_by": "Austin",
    }


def test_pricing_batch_generation_creates_store_items_tokens_and_pos_resolver(state):
    package = _seed_pricing_batch_package(state)

    result = state.generate_store_items_from_pricing_batch(_pricing_payload(package))

    assert result["pricing_batch_id"] == "PB-SDP260510001-P"
    assert result["generated_count"] == 3
    assert result["pending_print_count"] == 3
    assert len(result["store_items"]) == 3
    assert len(result["tokens"]) == 3

    machine_codes = [row["machine_code"] for row in result["store_items"]]
    assert len(machine_codes) == len(set(machine_codes))
    assert all(code.isdigit() and code.startswith("5") for code in machine_codes)
    assert all(row["barcode_value"] == row["machine_code"] for row in result["store_items"])

    for store_item, token in zip(result["store_items"], result["tokens"]):
        assert store_item["entity_type"] == "STORE_ITEM"
        assert store_item["store_item_id"]
        assert store_item["display_code"]
        assert store_item["source_sdp_display_code"] == package["display_code"]
        assert store_item["source_sdp_machine_code"] == package["machine_code"]
        assert store_item["parent_sdo_display_code"] == package["parent_sdo_display_code"]
        assert store_item["transfer_no"] == package["transfer_no"]
        assert store_item["pricing_batch_id"] == "PB-SDP260510001-P"
        assert store_item["category_main"] == "tops"
        assert store_item["category_sub"] == "lady tops"
        assert store_item["category_short"] == "TOP"
        assert store_item["grade"] == "P"
        assert store_item["pricing_type"] == "P"
        assert store_item["sale_price_kes"] == 450
        assert store_item["status"] == "pending_print"
        assert store_item["print_status"] == "pending_print"
        assert store_item["sticker_status"] == "pending"
        assert store_item["assigned_clerk"] == "Austin"
        assert store_item["created_by"] == "Austin"
        assert store_item["created_at"]
        assert store_item["updated_at"]

        assert token["token_id"]
        assert token["entity_type"] == "STORE_ITEM"
        assert token["entity_id"] == store_item["store_item_id"]
        assert token["store_item_id"] == store_item["store_item_id"]
        assert token["display_code"] == store_item["display_code"]
        assert token["machine_code"] == store_item["machine_code"]
        assert token["barcode_value"] == store_item["machine_code"]
        assert token["store_code"] == "UTAWALA"
        assert token["source_sdp_display_code"] == package["display_code"]
        assert token["pricing_batch_id"] == "PB-SDP260510001-P"
        assert token["pos_allowed"] is True
        assert {"pos", "store_item_label", "inventory_lookup"}.issubset(set(token["allowed_contexts"]))
        assert token["status"] == "active"

        resolved = state.resolve_barcode(store_item["machine_code"], context="pos")
        assert resolved["barcode_type"] == "STORE_ITEM"
        assert resolved["object_id"] == store_item["store_item_id"]
        assert resolved["pos_allowed"] is True
        assert "pos" in resolved["allowed_contexts"]
        assert resolved["reject_reason"] == ""


def test_pricing_batch_generation_is_idempotent_by_pricing_batch_id(state):
    package = _seed_pricing_batch_package(state)
    payload = _pricing_payload(package, pricing_batch_id="PB-IDEMPOTENT")

    first = state.generate_store_items_from_pricing_batch(payload)
    second = state.generate_store_items_from_pricing_batch({**payload, "quantity": 99})

    assert second["generated_count"] == first["generated_count"] == 3
    assert [row["machine_code"] for row in second["store_items"]] == [row["machine_code"] for row in first["store_items"]]
    assert [row["token_id"] for row in second["tokens"]] == [row["token_id"] for row in first["tokens"]]
    assert len([row for row in state.item_barcode_tokens.values() if row.get("pricing_batch_id") == "PB-IDEMPOTENT"]) == 3


def test_pricing_batch_generation_keeps_non_store_item_pos_guardrails(state):
    package = _seed_pricing_batch_package(state)
    result = state.generate_store_items_from_pricing_batch(_pricing_payload(package))

    assert state.resolve_barcode(result["store_items"][0]["machine_code"], context="pos")["pos_allowed"] is True
    assert state.resolve_barcode("1260510001", context="pos")["pos_allowed"] is False
    assert state.resolve_barcode("2260510001", context="pos")["pos_allowed"] is False
    assert state.resolve_barcode("3260510001", context="pos")["pos_allowed"] is False
    assert state.resolve_barcode("4260510001", context="pos")["pos_allowed"] is False
    assert state.resolve_barcode(package["machine_code"], context="pos")["pos_allowed"] is False
