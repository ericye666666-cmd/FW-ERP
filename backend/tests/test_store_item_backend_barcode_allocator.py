import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings
from app.core.state import InMemoryState
from app.schemas.transfers import StoreDeliveryPackageStoreItemGenerateRequest


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


def _ensure_store_clerk(state: InMemoryState, username: str, store_code: str) -> None:
    if any(row.get("username") == username for row in state.users.values()):
        return
    user_id = max(state.users.keys(), default=0) + 1
    state.users[user_id] = {
        "id": user_id,
        "username": username,
        "full_name": username,
        "role_code": "store_clerk",
        "store_code": store_code,
        "warehouse_code": None,
        "area_code": "",
        "managed_store_codes": [],
        "is_active": True,
        "password_hash": "",
        "created_at": "2026-05-04T08:00:00+03:00",
    }


def _seed_assigned_sdp_package(
    state: InMemoryState,
    *,
    index: int,
    store_code: str,
    assigned_clerk: str,
) -> dict:
    _ensure_store_clerk(state, assigned_clerk, store_code)
    transfer_no = f"TO-20260504-{index:03d}"
    sdb_code = f"SDB26124{index:03d}"
    sdo_code = f"SDO26124{index:03d}"
    sdp_code = f"SDP26124{index:03d}"
    state.transfer_orders[transfer_no] = {
        "transfer_no": transfer_no,
        "from_warehouse_code": "WH1",
        "to_store_code": store_code,
        "created_by": "store_manager_1",
        "approval_required": True,
        "status": "approved",
        "approval_status": "approved",
        "created_at": "2026-05-04T08:00:00+03:00",
        "submitted_at": "2026-05-04T08:00:00+03:00",
        "approved_at": "2026-05-04T08:01:00+03:00",
        "approved_by": "warehouse_supervisor_1",
        "received_at": None,
        "received_by": None,
        "closed_at": None,
        "store_receipt_status": "not_started",
        "demand_lines": [],
        "items": [],
    }
    state.store_dispatch_bales[sdb_code] = {
        "bale_no": sdb_code,
        "machine_code": f"226124{index:04d}",
        "transfer_no": transfer_no,
        "source_type": "SDB",
        "source_code": sdb_code,
        "source_bales": [sdb_code],
        "status": "ready_dispatch",
        "store_code": store_code,
        "item_count": 1,
        "category_summary": "tops / lady tops / P",
        "category_name": "tops / lady tops",
        "token_nos": [],
    }
    order = state._normalize_store_delivery_execution_order(
        {
            "execution_order_no": sdo_code,
            "machine_code": f"426124{index:04d}",
            "source_transfer_no": transfer_no,
            "from_warehouse_code": "WH1",
            "to_store_code": store_code,
            "package_count": 1,
            "packages": [],
            "status": "pending_print",
            "created_by": "warehouse_clerk_1",
            "created_at": "2026-05-04T08:02:00+03:00",
        }
    )
    state.store_delivery_execution_orders[order["execution_order_no"]] = order
    return state._save_store_delivery_package(
        {
            "id": 331000 + index,
            "display_code": sdp_code,
            "package_id": sdp_code,
            "machine_code": f"626124{index:04d}",
            "barcode_value": f"626124{index:04d}",
            "parent_sdo_display_code": order["execution_order_no"],
            "parent_sdo_machine_code": order["machine_code"],
            "transfer_no": transfer_no,
            "store_code": store_code,
            "package_no": 1,
            "package_total": 1,
            "source_type": "SDB",
            "source_code": sdb_code,
            "source_machine_code": f"226124{index:04d}",
            "item_count": 1,
            "category_summary": "tops / lady tops / P",
            "category_name": "tops / lady tops",
            "received_status": "received",
            "exception_status": "normal",
            "assigned_clerk": assigned_clerk,
            "assignment_status": "assigned",
            "status": "assigned",
            "received_at": "2026-05-04T09:00:00+03:00",
            "received_by": "store_manager_1",
            "assigned_at": "2026-05-04T09:05:00+03:00",
            "assigned_by": "store_manager_1",
        }
    )


def _pricing_payload(package: dict, *, pricing_batch_id: str, assigned_clerk: str) -> dict:
    return {
        "source_sdp_display_code": package["display_code"],
        "source_sdp_machine_code": package["machine_code"],
        "pricing_batch_id": pricing_batch_id,
        "store_code": package["store_code"],
        "category_main": "tops",
        "category_sub": "lady tops",
        "category_short": "TOP",
        "grade": "P",
        "pricing_type": "P",
        "sale_price_kes": 450,
        "rack_code": "A-01",
        "quantity": 1,
        "assigned_clerk": assigned_clerk,
        "created_by": assigned_clerk,
    }


def test_store_item_ean13_check_digit_uses_backend_format(state):
    assert state._ean13_check_digit("526124000001") == "3"
    assert state._store_item_barcode_v2_value("2026-05-04T08:00:00+03:00", 1) == "5261240000013"
    assert state._is_valid_store_item_v2_barcode("5261240000013") is True
    assert state._is_valid_store_item_v2_barcode("5261240000010") is False


def test_allocator_refreshes_existing_codes_before_issuing_next_store_item(state):
    first = state._allocate_store_item_barcode("2026-05-04T08:00:00+03:00")
    externally_reserved = state._store_item_barcode_v2_value("2026-05-04T08:00:00+03:00", 2)
    state.store_items["EXTERNAL-STOREITEM"] = {
        "store_item_id": "EXTERNAL-STOREITEM",
        "entity_type": "STORE_ITEM",
        "store_code": "KINNO",
        "machine_code": externally_reserved,
        "barcode_value": externally_reserved,
    }

    second = state._allocate_store_item_barcode("2026-05-04T08:00:00+03:00")

    assert first == "5261240000013"
    assert second != externally_reserved
    assert second == state._store_item_barcode_v2_value("2026-05-04T08:00:00+03:00", 3)


def test_three_stores_nine_pdas_concurrent_generation_gets_unique_backend_barcodes(state):
    store_codes = ["UTAWALA", "PAIPLINE", "KINNO"]
    work = []
    for index in range(1, 10):
        store_code = store_codes[(index - 1) % len(store_codes)]
        clerk = f"{store_code.lower()}_clerk_{index}"
        package = _seed_assigned_sdp_package(state, index=index, store_code=store_code, assigned_clerk=clerk)
        work.append((index, package, clerk))

    def generate(row: tuple[int, dict, str]) -> dict:
        index, package, clerk = row
        result = state.generate_store_items_from_pricing_batch(
            _pricing_payload(package, pricing_batch_id=f"PB-SDP-331-{index:03d}", assigned_clerk=clerk)
        )
        return result["store_items"][0]

    with ThreadPoolExecutor(max_workers=9) as executor:
        store_items = list(executor.map(generate, work))

    machine_codes = [row["machine_code"] for row in store_items]
    serials = sorted(int(code[6:12]) for code in machine_codes)

    assert len(machine_codes) == 9
    assert len(set(machine_codes)) == 9
    assert serials == list(range(1, 10))
    assert all(code.startswith("5") and len(code) == 13 and state._is_valid_store_item_v2_barcode(code) for code in machine_codes)
    assert {row["store_code"] for row in store_items} == set(store_codes)
    assert all(row["barcode_value"] == row["machine_code"] for row in store_items)


def test_generate_request_schema_rejects_client_machine_code_fields():
    with pytest.raises(ValidationError):
        StoreDeliveryPackageStoreItemGenerateRequest(
            source_sdp_display_code="SDP261240001",
            store_code="UTAWALA",
            clerk="Austin",
            rack_code="A-01",
            selected_price=450,
            quantity=1,
            machine_code="5999999999999",
        )


def test_backend_rejects_client_supplied_store_item_machine_code(state):
    package = _seed_assigned_sdp_package(state, index=11, store_code="UTAWALA", assigned_clerk="Austin")
    payload = _pricing_payload(package, pricing_batch_id="PB-SDP-331-CLIENT-CODE", assigned_clerk="Austin")
    payload["machine_code"] = "5999999999999"
    payload["barcode_value"] = "5999999999999"

    with pytest.raises(HTTPException) as exc:
        state.generate_store_items_from_pricing_batch(payload)

    assert exc.value.status_code == 400
    assert "后端统一发号" in str(exc.value.detail)


def test_generated_store_item_defaults_are_pending_stock_in_and_unsold(state):
    package = _seed_assigned_sdp_package(state, index=10, store_code="UTAWALA", assigned_clerk="Austin")

    result = state.generate_store_items_from_pricing_batch(
        _pricing_payload(package, pricing_batch_id="PB-SDP-331-DEFAULTS", assigned_clerk="Austin")
    )
    store_item = result["store_items"][0]
    token = result["tokens"][0]

    assert store_item["display_code"].startswith("STOREITEM")
    assert store_item["machine_code"] == store_item["barcode_value"]
    assert store_item["source_sdp_display_code"] == package["display_code"]
    assert store_item["source_sdp_machine_code"] == package["machine_code"]
    assert store_item["parent_sdo_display_code"] == package["parent_sdo_display_code"]
    assert store_item["store_code"] == "UTAWALA"
    assert store_item["assigned_clerk"] == "Austin"
    assert store_item["sale_price_kes"] == 450
    assert store_item["rack_code"] == "A-01"
    assert store_item["store_rack_code"] == "A-01"
    assert store_item["print_status"] == "pending_print"
    assert store_item["stock_in_confirmed"] is False
    assert store_item["sale_status"] == "unsold"
    assert token["stock_in_confirmed"] is False
    assert token["sale_status"] == "unsold"


def test_pos_scope_still_rejects_non_store_item_and_store_location_codes(state):
    state.bale_barcodes["RB261240099"] = {
        "id": 99,
        "bale_barcode": "RB261240099",
        "scan_token": "RB261240099",
        "machine_code": "1261240099",
        "status": "ready_for_sorting",
    }
    package = _seed_assigned_sdp_package(state, index=12, store_code="UTAWALA", assigned_clerk="Austin")
    state.upsert_store_location(
        "UTAWALA",
        {
            "location_code": "PT-CR",
            "location_name": "Cargo pants shelf",
            "location_type": "SHELF",
            "category_name": "pants / cargo pant",
            "updated_by": "store_manager_1",
        },
    )

    rejected_codes = [
        "1261240099",
        package["source_machine_code"],
        "3261240012",
        package["parent_sdo_machine_code"],
        package["machine_code"],
        "PT-CR",
    ]

    for code in rejected_codes:
        result = state.resolve_barcode(code, context="pos")
        assert result["pos_allowed"] is False
        assert result["reject_reason"]
