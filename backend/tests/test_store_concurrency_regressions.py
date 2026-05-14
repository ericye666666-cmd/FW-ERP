import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest
from fastapi import HTTPException


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings
from app.core.seed_data import STORE_RACK_TEMPLATE
from app.core.state import InMemoryState
from test_pos_sale_write_flow import _add_store_item, _sale_payload, _store_item


STORE_CODES = ["UTAWALA", "PAIPLINE", "KINNO"]


@pytest.fixture()
def state():
    temp_dir = tempfile.TemporaryDirectory()
    original_state_file = settings.state_file
    settings.state_file = Path(temp_dir.name) / "runtime_state.json"
    test_state = InMemoryState()
    for store_code in STORE_CODES:
        test_state.initialize_store_racks(store_code, STORE_RACK_TEMPLATE, initialized_by="area_supervisor_1")
        test_state.upsert_store_location(
            store_code,
            {
                "location_code": "PT-CR",
                "location_name": "CARGO PANT shelf",
                "location_type": "SHELF",
                "category_name": "CARGO PANT",
                "active": True,
                "updated_by": "area_supervisor_1",
            },
        )
    try:
        yield test_state
    finally:
        settings.state_file = original_state_file
        temp_dir.cleanup()


def _seed_store_clerk(state: InMemoryState, username: str, store_code: str) -> None:
    for user in state.users.values():
        if user["username"] == username:
            user["store_code"] = store_code
            user["role_code"] = "store_clerk"
            user["is_active"] = True
            return
    user_id = max(state.users.keys(), default=0) + 1
    state.users[user_id] = {
        "id": user_id,
        "username": username,
        "full_name": username,
        "role_code": "store_clerk",
        "store_code": store_code,
        "is_active": True,
        "created_at": "2026-05-12T08:00:00+03:00",
    }


def _seed_sdp_package(
    state: InMemoryState,
    *,
    store_code: str = "UTAWALA",
    sequence: int = 1,
    assigned_clerk: str = "Austin",
    item_count: int = 5,
) -> dict:
    transfer_no = f"TO-260512-{sequence:03d}"
    raw_code = f"RB260512{sequence:03d}"
    sdb_code = f"SDB260512{sequence:03d}"
    sdo_code = f"SDO260512{sequence:03d}"
    sdp_code = f"SDP260512{sequence:03d}"
    state.transfer_orders[transfer_no] = {
        "transfer_no": transfer_no,
        "from_warehouse_code": "WH1",
        "to_store_code": store_code,
        "created_by": "store_manager_1",
        "approval_required": True,
        "status": "approved",
        "approval_status": "approved",
        "created_at": "2026-05-12T08:00:00+03:00",
        "submitted_at": "2026-05-12T08:00:00+03:00",
        "approved_at": "2026-05-12T08:01:00+03:00",
        "approved_by": "warehouse_supervisor_1",
        "store_receipt_status": "not_started",
        "demand_lines": [],
        "items": [],
    }
    state.bale_barcodes[raw_code] = {
        "id": sequence,
        "bale_barcode": raw_code,
        "scan_token": raw_code,
        "machine_code": f"1260512{sequence:03d}",
        "status": "ready_for_sorting",
        "created_at": "2026-05-12T08:00:00+03:00",
        "updated_at": "2026-05-12T08:00:00+03:00",
    }
    state.store_dispatch_bales[sdb_code] = {
        "bale_no": sdb_code,
        "bale_barcode": sdb_code,
        "scan_token": sdb_code,
        "machine_code": f"2260512{sequence:03d}",
        "transfer_no": transfer_no,
        "source_bales": [raw_code],
        "source_type": "SDB",
        "source_code": sdb_code,
        "status": "ready_dispatch",
        "store_code": store_code,
        "item_count": item_count,
        "category_summary": "pants / cargo pant / P",
        "category_name": "pants / cargo pant",
        "token_nos": [],
    }
    order = state._normalize_store_delivery_execution_order(
        {
            "execution_order_no": sdo_code,
            "official_delivery_barcode": sdo_code,
            "machine_code": f"4260512{sequence:03d}",
            "source_transfer_no": transfer_no,
            "from_warehouse_code": "WH1",
            "to_store_code": store_code,
            "package_count": 1,
            "packages": [],
            "status": "pending_print",
            "created_by": "warehouse_clerk_1",
            "created_at": "2026-05-12T08:02:00+03:00",
        }
    )
    state.store_delivery_execution_orders[order["execution_order_no"]] = order
    return state._save_store_delivery_package(
        {
            "id": 1000 + sequence,
            "display_code": sdp_code,
            "package_id": sdp_code,
            "machine_code": f"6260512{sequence:03d}",
            "barcode_value": f"6260512{sequence:03d}",
            "parent_sdo_display_code": order["execution_order_no"],
            "parent_sdo_machine_code": order["machine_code"],
            "transfer_no": transfer_no,
            "store_code": store_code,
            "package_no": 1,
            "package_total": 1,
            "source_type": "SDB",
            "source_code": sdb_code,
            "source_machine_code": f"2260512{sequence:03d}",
            "item_count": item_count,
            "category_summary": "pants / cargo pant / P",
            "category_name": "pants / cargo pant",
            "received_status": "received",
            "exception_status": "normal",
            "assigned_clerk": assigned_clerk,
            "assignment_status": "assigned",
            "status": "assigned",
            "received_at": "2026-05-12T09:00:00+03:00",
            "received_by": "store_manager_1",
            "assigned_at": "2026-05-12T09:05:00+03:00",
            "assigned_by": "store_manager_1",
        }
    )


def _pricing_payload(
    package: dict,
    *,
    assigned_clerk: str,
    pricing_batch_id: str,
    quantity: int = 2,
) -> dict:
    return {
        "source_sdp_display_code": package["display_code"],
        "pricing_batch_id": pricing_batch_id,
        "store_code": package["store_code"],
        "category_main": "pants",
        "category_sub": "cargo pant",
        "category_short": "PT",
        "grade": "P",
        "pricing_type": "P",
        "sale_price_kes": 450,
        "quantity": quantity,
        "rack_code": "PT-CR",
        "assigned_clerk": assigned_clerk,
        "created_by": assigned_clerk,
    }


def _open_shift(state: InMemoryState, *, terminal_id: str = "POS-UTW-01") -> dict:
    return state.open_pos_shift(
        "UTAWALA",
        {
            "cashier_id": "Clerk A",
            "terminal_id": terminal_id,
            "opening_float": 2000,
            "note": "concurrency regression shift",
        },
        opened_by="store_manager_1",
    )


def test_nine_pda_devices_allocate_unique_valid_store_item_ean13_codes(state):
    tasks = []
    for store_index, store_code in enumerate(STORE_CODES):
        for device_index in range(3):
            sequence = store_index * 3 + device_index + 1
            clerk = f"{store_code.lower()}_pda_clerk_{device_index + 1}"
            _seed_store_clerk(state, clerk, store_code)
            package = _seed_sdp_package(
                state,
                store_code=store_code,
                sequence=sequence,
                assigned_clerk=clerk,
                item_count=3,
            )
            tasks.append(
                _pricing_payload(
                    package,
                    assigned_clerk=clerk,
                    pricing_batch_id=f"PB-CONCURRENCY-{sequence:03d}",
                    quantity=2,
                )
            )

    with ThreadPoolExecutor(max_workers=9) as executor:
        results = list(executor.map(state.generate_store_items_from_pricing_batch, tasks))

    machine_codes = [
        row["machine_code"]
        for result in results
        for row in result["store_items"]
    ]
    assert len(machine_codes) == 18
    assert len(machine_codes) == len(set(machine_codes))
    assert all(code.startswith("5") for code in machine_codes)
    assert all(state._is_valid_store_item_v2_barcode(code) for code in machine_codes)
    for result in results:
        package = result["package"]
        for row in result["store_items"]:
            assert row["source_sdp_display_code"] == package["display_code"]
            assert row["source_sdp_machine_code"] == package["machine_code"]
            assert row["parent_sdo_display_code"] == package["parent_sdo_display_code"]
            assert row["store_code"] == package["store_code"]
            assert row["assigned_clerk"] == package["assigned_clerk"]


def test_assigned_clerk_can_process_sdp_but_unassigned_clerk_is_rejected(state):
    _seed_store_clerk(state, "utawala_assigned", "UTAWALA")
    _seed_store_clerk(state, "utawala_unassigned", "UTAWALA")
    package = _seed_sdp_package(state, sequence=31, assigned_clerk="utawala_assigned", item_count=2)

    def attempt(payload):
        try:
            return state.generate_store_items_from_pricing_batch(payload)
        except HTTPException as exc:
            return exc

    assigned_payload = _pricing_payload(
        package,
        assigned_clerk="utawala_assigned",
        pricing_batch_id="PB-SDP-ASSIGNED",
        quantity=1,
    )
    unassigned_payload = {
        **_pricing_payload(
            package,
            assigned_clerk="utawala_unassigned",
            pricing_batch_id="PB-SDP-UNASSIGNED",
            quantity=1,
        ),
        "created_by": "utawala_unassigned",
    }

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(attempt, [assigned_payload, unassigned_payload]))

    successes = [row for row in results if isinstance(row, dict)]
    failures = [row for row in results if isinstance(row, HTTPException)]
    assert len(successes) == 1
    assert successes[0]["generated_count"] == 1
    assert len(failures) == 1
    assert failures[0].status_code == 403
    assert len(state._store_items_for_sdo_package(package)) == 1


def test_same_clerk_generate_retry_returns_existing_store_item_batch(state):
    _seed_store_clerk(state, "utawala_retry_clerk", "UTAWALA")
    package = _seed_sdp_package(state, sequence=41, assigned_clerk="utawala_retry_clerk", item_count=5)
    payload = _pricing_payload(
        package,
        assigned_clerk="utawala_retry_clerk",
        pricing_batch_id="PB-SAME-CLICK",
        quantity=3,
    )
    payload["idempotency_key"] = "same-clerk-double-click"

    first = state.generate_store_items_from_pricing_batch(payload)
    second = state.generate_store_items_from_pricing_batch(dict(payload))

    assert second["generated_count"] == first["generated_count"] == 3
    assert [row["machine_code"] for row in second["store_items"]] == [row["machine_code"] for row in first["store_items"]]
    assert len([row for row in state.store_items.values() if row.get("pricing_batch_id") == "PB-SAME-CLICK"]) == 3


def test_same_store_item_generation_idempotency_key_changed_payload_conflicts(state):
    _seed_store_clerk(state, "utawala_conflict_clerk", "UTAWALA")
    package = _seed_sdp_package(state, sequence=42, assigned_clerk="utawala_conflict_clerk", item_count=5)
    payload = _pricing_payload(
        package,
        assigned_clerk="utawala_conflict_clerk",
        pricing_batch_id="PB-IDEMPOTENCY-CONFLICT",
        quantity=2,
    )
    payload["idempotency_key"] = "same-key-different-payload"

    first = state.generate_store_items_from_pricing_batch(payload)
    with pytest.raises(HTTPException) as exc:
        state.generate_store_items_from_pricing_batch({**payload, "quantity": 3})

    assert exc.value.status_code == 409
    assert first["generated_count"] == 2
    assert len([row for row in state.store_items.values() if row.get("pricing_batch_id") == "PB-IDEMPOTENCY-CONFLICT"]) == 2


def test_failed_store_item_print_can_reprint_same_barcode_without_new_store_item(state):
    _seed_store_clerk(state, "utawala_print_clerk", "UTAWALA")
    package = _seed_sdp_package(state, sequence=51, assigned_clerk="utawala_print_clerk", item_count=2)
    generated = state.generate_store_items_from_pricing_batch(
        _pricing_payload(
            package,
            assigned_clerk="utawala_print_clerk",
            pricing_batch_id="PB-PRINT-FAILURE",
            quantity=1,
        )
    )
    token_no = generated["tokens"][0]["token_no"]
    machine_code = generated["store_items"][0]["machine_code"]
    item_count_before = len(state.store_items)

    first_job = state.queue_item_barcode_token_print_jobs(
        {"token_nos": [token_no], "copies": 1, "printer_name": "K300", "requested_by": "utawala_print_clerk"}
    )[0]
    state.mark_print_job_failed(first_job["id"], failed_by="utawala_print_clerk", note="paper out")
    retry_job = state.queue_item_barcode_token_print_jobs(
        {"token_nos": [token_no], "copies": 1, "printer_name": "K300", "requested_by": "utawala_print_clerk"}
    )[0]

    assert first_job["print_payload"]["barcode_value"] == machine_code
    assert retry_job["print_payload"]["barcode_value"] == machine_code
    assert first_job["print_payload"]["display_code"] != first_job["print_payload"]["barcode_value"]
    assert len(state.store_items) == item_count_before
    assert state.item_barcode_tokens[token_no]["machine_code"] == machine_code


def test_duplicate_stock_in_confirm_counts_inventory_once(state):
    _add_store_item(
        state,
        _store_item(
            store_item_id="STOREITEM-STOCK-IN-001",
            machine_code="5261240001010",
            stock_in_confirmed=False,
            status="pending_print",
            sale_status="pending_print",
        ),
    )
    state.upsert_store_location(
        "UTAWALA",
        {
            "location_code": "UT-BACKROOM",
            "location_name": "CARGO PANT backroom",
            "location_type": "BACKROOM",
            "category_name": "CARGO PANT",
            "active": True,
            "updated_by": "area_supervisor_1",
        },
    )

    first = state.confirm_store_item_stock_in(
        "UTAWALA",
        "5261240001010",
        {"location_code": "PT-CR", "confirmed_by": "Austin"},
    )
    second = state.confirm_store_item_stock_in(
        "UTAWALA",
        "5261240001010",
        {"location_code": "PT-CR", "confirmed_by": "Austin"},
    )
    overview = state.get_store_inventory_overview("UTAWALA")

    assert first["status"] == "confirmed"
    assert second["status"] == "already_confirmed"
    assert overview["total_items"] == 1
    assert overview["shelf_items"] == 1
    assert overview["unconfirmed_items"] == 0
    with pytest.raises(HTTPException) as exc:
        state.confirm_store_item_stock_in(
            "UTAWALA",
            "5261240001010",
            {"location_code": "UT-BACKROOM", "confirmed_by": "Austin"},
        )
    assert exc.value.status_code == 409


def test_concurrent_pos_sale_same_store_item_same_key_returns_one_idempotent_sale(state):
    _add_store_item(state, _store_item(store_item_id="STOREITEM-POS-CONCURRENT", machine_code="5261240001027"))
    shift = _open_shift(state)
    payload = _sale_payload(
        "5261240001027",
        shift_id=shift["shift_id"],
        idempotency_key="pos-concurrent-same-key",
    )

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: state.create_pos_sale("UTAWALA", payload, created_by="store_manager_1"), range(2)))

    assert results[0]["sale_no"] == results[1]["sale_no"]
    assert len(state.sales_transactions) == 1
    assert len(state.list_inventory_movements(movement_type="POS_SALE_OUT")) == 1
    with pytest.raises(HTTPException) as exc:
        state.create_pos_sale(
            "UTAWALA",
            _sale_payload(
                "5261240001027",
                shift_id=shift["shift_id"],
                idempotency_key="pos-concurrent-different-sale",
            ),
            created_by="store_manager_1",
        )
    assert exc.value.status_code in {400, 409}
    assert len(state.sales_transactions) == 1
    assert len(state.list_inventory_movements(movement_type="POS_SALE_OUT")) == 1


def test_manual_unbarcoded_sale_does_not_generate_store_item_or_standard_inventory_movement(state):
    shift = _open_shift(state)

    sale = state.create_pos_sale(
        "UTAWALA",
        {
            "cashier_id": "Clerk A",
            "shift_id": shift["shift_id"],
            "terminal_id": "POS-UTW-01",
            "payment_method": "cash",
            "cash_amount": 500,
            "idempotency_key": "manual-concurrency-regression",
            "items": [
                {
                    "line_type": "manual_unbarcoded",
                    "category": "MANUAL",
                    "description": "Loose item without barcode",
                    "qty": 1,
                    "unit_price": 125,
                    "final_price": 125,
                    "manual_reason": "Label damaged",
                }
            ],
        },
        created_by="store_manager_1",
    )
    report = state.get_pos_shift_x_report("UTAWALA", shift["shift_id"])

    assert sale["items"][0]["line_type"] == "manual_unbarcoded"
    assert sale["items"][0]["manual_reason"] == "Label damaged"
    assert sale["items"][0]["requires_audit"] is True
    assert sale["items"][0]["inventory_tracked"] is False
    assert state.store_items == {}
    assert state.item_barcode_tokens == {}
    assert state.list_inventory_movements(movement_type="POS_SALE_OUT") == []
    assert report["manual_item_count"] == 1
    assert report["manual_sales_amount"] == 125
    assert report["category_breakdown"][0]["manual_qty"] == 1
    assert report["category_breakdown"][0]["store_item_qty"] == 0


def test_pos_barcode_scope_stays_store_item_only(state):
    _add_store_item(state, _store_item(store_item_id="STOREITEM-POS-SCOPE", machine_code="5261240001034"))
    state.bale_barcodes["RB260512999"] = {"bale_barcode": "RB260512999", "machine_code": "1260512999"}
    state.store_dispatch_bales["SDB260512999"] = {"bale_no": "SDB260512999", "machine_code": "2260512999", "store_code": "UTAWALA", "source_bales": []}
    state.store_delivery_execution_orders["SDO260512999"] = state._normalize_store_delivery_execution_order(
        {"execution_order_no": "SDO260512999", "machine_code": "4260512999", "to_store_code": "UTAWALA"}
    )
    state.store_delivery_packages["SDP260512999"] = state._normalize_store_delivery_package(
        {"display_code": "SDP260512999", "package_id": "SDP260512999", "machine_code": "6260512999", "store_code": "UTAWALA"}
    )
    shift = _open_shift(state)

    sale = state.create_pos_sale(
        "UTAWALA",
        _sale_payload("5261240001034", shift_id=shift["shift_id"], idempotency_key="pos-scope-store-item"),
        created_by="store_manager_1",
    )
    assert sale["items"][0]["machine_code"] == "5261240001034"

    for barcode in ["1260512999", "2260512999", "3260512999", "4260512999", "6260512999", "PT-CR"]:
        with pytest.raises(HTTPException):
            state.create_pos_sale(
                "UTAWALA",
                _sale_payload(barcode, shift_id=shift["shift_id"], idempotency_key=f"pos-scope-{barcode}"),
                created_by="store_manager_1",
            )
