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
from app.schemas.sales import PosSaleResponse


@pytest.fixture()
def state():
    temp_dir = tempfile.TemporaryDirectory()
    original_state_file = settings.state_file
    settings.state_file = Path(temp_dir.name) / "runtime_state.json"
    test_state = InMemoryState()
    test_state.initialize_store_racks("UTAWALA", STORE_RACK_TEMPLATE, initialized_by="store_manager_1")
    test_state.upsert_store_location(
        "UTAWALA",
        {
            "location_code": "PT-CR",
            "location_name": "CARGO PANT shelf",
            "location_type": "SHELF",
            "category_name": "CARGO PANT",
            "active": True,
            "updated_by": "store_manager_1",
        },
    )
    try:
        yield test_state
    finally:
        settings.state_file = original_state_file
        temp_dir.cleanup()


def _store_item(
    *,
    store_item_id="STOREITEM-POS-001",
    machine_code="5261240000013",
    store_code="UTAWALA",
    location_code="PT-CR",
    price=250,
    stock_in_confirmed=True,
    status="printed_in_store",
    sale_status="ready_for_sale",
):
    return {
        "store_item_id": store_item_id,
        "item_id": store_item_id,
        "display_code": store_item_id,
        "machine_code": machine_code,
        "barcode_value": machine_code,
        "entity_type": "STORE_ITEM",
        "store_code": store_code,
        "category_short": "CARGO PANT",
        "category_name": "CARGO PANT",
        "category_sub": "CARGO PANT",
        "grade": "P",
        "pricing_type": "P",
        "sale_price_kes": price,
        "selling_price_kes": price,
        "selected_price": price,
        "current_location_code": location_code,
        "store_rack_code": location_code,
        "rack_code": location_code,
        "print_status": "printed_in_store",
        "store_item_status": status,
        "stock_in_confirmed": stock_in_confirmed,
        "stock_in_confirmed_by": "Austin",
        "stock_in_confirmed_at": "2026-05-11T08:30:00+03:00",
        "status": status,
        "sale_status": sale_status,
        "created_at": "2026-05-11T08:00:00+03:00",
        "updated_at": "2026-05-11T08:00:00+03:00",
    }


def _add_store_item(state, row):
    token_id = row["display_code"]
    state.store_items[row["store_item_id"]] = dict(row, token_id=token_id, token_no=token_id)
    state.item_barcode_tokens[token_id] = dict(
        row,
        token_id=token_id,
        token_no=token_id,
        identity_no=token_id,
        identity_id=token_id,
        entity_id=row["store_item_id"],
        store_item_id=row["store_item_id"],
        pos_allowed=True,
        allowed_contexts=["pos", "store_item_label", "inventory_lookup", "identity_ledger"],
        final_item_barcode={"barcode_value": row["machine_code"], "identity_id": token_id},
    )


def _open_shift(state, *, store_code="UTAWALA", cashier_id="Clerk A", terminal_id="POS-UTW-01"):
    return state.open_pos_shift(
        store_code,
        {
            "cashier_id": cashier_id,
            "terminal_id": terminal_id,
            "opening_float": 2000,
            "note": "test shift",
        },
        opened_by="store_manager_1",
    )


def _sale_payload(
    *machine_codes,
    payment_method="cash",
    cash_amount=1000,
    mpesa_amount=0,
    mpesa_reference="",
    final_price=250,
    shift_id="",
    terminal_id="POS-UTW-01",
    idempotency_key="",
):
    payload = {
        "cashier_id": "Clerk A",
        "shift_id": shift_id,
        "terminal_id": terminal_id,
        "payment_method": payment_method,
        "cash_amount": cash_amount,
        "mpesa_amount": mpesa_amount,
        "mpesa_reference": mpesa_reference,
        "discount_amount": 0,
        "items": [
            {
                "machine_code": machine_code,
                "display_code": f"DISPLAY-{index + 1}",
                "final_price": final_price,
                "discount_amount": 0,
            }
            for index, machine_code in enumerate(machine_codes)
        ],
    }
    if idempotency_key:
        payload["idempotency_key"] = idempotency_key
    return payload


def _manual_item_payload(
    *,
    category="Accessories",
    description="Loose item without barcode",
    qty=2,
    unit_price=125,
    manual_reason="Label damaged",
    discount_amount=0,
    final_price=None,
):
    item = {
        "line_type": "manual_unbarcoded",
        "barcode_type": "NONE",
        "display_code": "MANUAL",
        "machine_code": "",
        "category": category,
        "description": description,
        "qty": qty,
        "unit_price": unit_price,
        "discount_amount": discount_amount,
        "manual_reason": manual_reason,
        "requires_audit": True,
        "inventory_tracked": False,
    }
    if final_price is not None:
        item["final_price"] = final_price
    else:
        item["final_price"] = max(qty * unit_price - discount_amount, 0)
    return item


def test_pos_sale_success_single_store_item(state):
    _add_store_item(state, _store_item())
    shift = _open_shift(state)

    sale = state.create_pos_sale("UTAWALA", _sale_payload("5261240000013", shift_id=shift["shift_id"]), created_by="store_manager_1")

    assert sale["sale_id"] == sale["sale_no"]
    assert sale["store_code"] == "UTAWALA"
    assert sale["cashier_id"] == "Clerk A"
    assert sale["subtotal"] == 250
    assert sale["total_amount"] == 250
    assert sale["change_amount"] == 750
    assert len(sale["items"]) == 1
    assert sale["items"][0]["machine_code"] == "5261240000013"
    assert state.sales_transactions[0]["sale_id"] == sale["sale_id"]
    assert state.sales_transactions[0]["sale_items"][0]["machine_code"] == "5261240000013"
    assert state.store_items["STOREITEM-POS-001"]["status"] == "sold"
    assert state.item_barcode_tokens["STOREITEM-POS-001"]["sale_status"] == "sold"
    assert state.item_barcode_tokens["STOREITEM-POS-001"]["sale_id"] == sale["sale_id"]
    movements = state.list_inventory_movements(movement_type="POS_SALE_OUT")
    assert len(movements) == 1
    assert movements[0]["details"]["reference_sale_id"] == sale["sale_id"]


def test_same_pos_idempotency_key_replays_existing_sale_without_second_sale_out(state):
    _add_store_item(state, _store_item())
    shift = _open_shift(state)
    payload = _sale_payload(
        "5261240000013",
        shift_id=shift["shift_id"],
        idempotency_key="pos-sale-retry-001",
    )

    first = state.create_pos_sale("UTAWALA", payload, created_by="store_manager_1")
    second = state.create_pos_sale("UTAWALA", payload, created_by="store_manager_1")

    assert second["sale_no"] == first["sale_no"]
    assert second["idempotency_key"] == "pos-sale-retry-001"
    assert len(state.sales_transactions) == 1
    assert len(state.list_inventory_movements(movement_type="POS_SALE_OUT")) == 1


def test_same_pos_idempotency_key_with_different_payload_conflicts(state):
    _add_store_item(state, _store_item(store_item_id="STOREITEM-POS-001", machine_code="5261240000013", price=250))
    _add_store_item(state, _store_item(store_item_id="STOREITEM-POS-002", machine_code="5261240000020", price=300))
    shift = _open_shift(state)
    first_payload = _sale_payload("5261240000013", shift_id=shift["shift_id"], idempotency_key="pos-sale-conflict-001")
    changed_payload = _sale_payload(
        "5261240000020",
        cash_amount=1000,
        final_price=300,
        shift_id=shift["shift_id"],
        idempotency_key="pos-sale-conflict-001",
    )

    state.create_pos_sale("UTAWALA", first_payload, created_by="store_manager_1")
    with pytest.raises(HTTPException) as exc:
        state.create_pos_sale("UTAWALA", changed_payload, created_by="store_manager_1")

    assert exc.value.status_code == 409
    assert "idempotency" in str(exc.value.detail).lower()
    assert len(state.sales_transactions) == 1
    assert len(state.list_inventory_movements(movement_type="POS_SALE_OUT")) == 1


def test_completed_pos_sale_line_blocks_second_sale_even_if_item_status_is_stale(state):
    _add_store_item(state, _store_item())
    shift = _open_shift(state)
    first = state.create_pos_sale(
        "UTAWALA",
        _sale_payload("5261240000013", shift_id=shift["shift_id"], idempotency_key="pos-sale-stale-001"),
        created_by="store_manager_1",
    )
    for row in (state.store_items["STOREITEM-POS-001"], state.item_barcode_tokens["STOREITEM-POS-001"]):
        row["status"] = "printed_in_store"
        row["sale_status"] = "ready_for_sale"
        row["store_item_status"] = "printed_in_store"
        row["sold"] = False
        row["sale_id"] = ""
        row["sale_no"] = ""

    with pytest.raises(HTTPException) as exc:
        state.create_pos_sale(
            "UTAWALA",
            _sale_payload("5261240000013", shift_id=shift["shift_id"], idempotency_key="pos-sale-stale-002"),
            created_by="store_manager_1",
        )

    assert exc.value.status_code == 409
    assert first["sale_no"] in str(exc.value.detail)
    assert len(state.sales_transactions) == 1
    assert len(state.list_inventory_movements(movement_type="POS_SALE_OUT")) == 1


def test_concurrent_pos_sale_same_store_item_only_completes_once(state):
    _add_store_item(state, _store_item())
    shift = _open_shift(state)

    def attempt_sale(index):
        try:
            return state.create_pos_sale(
                "UTAWALA",
                _sale_payload(
                    "5261240000013",
                    shift_id=shift["shift_id"],
                    idempotency_key=f"pos-sale-concurrent-{index}",
                ),
                created_by="store_manager_1",
            )
        except HTTPException as exc:
            return exc

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(attempt_sale, [1, 2]))

    successes = [row for row in results if isinstance(row, dict)]
    failures = [row for row in results if isinstance(row, HTTPException)]
    assert len(successes) == 1
    assert len(failures) == 1
    assert failures[0].status_code in {400, 409}
    assert len(state.sales_transactions) == 1
    assert len(state.list_inventory_movements(movement_type="POS_SALE_OUT")) == 1


def test_manual_unbarcoded_sale_remains_separate_from_store_item_inventory(state):
    _add_store_item(state, _store_item(store_item_id="STOREITEM-MANUAL-CONTROL", machine_code="5261240000990"))
    before_store_item = dict(state.store_items["STOREITEM-MANUAL-CONTROL"])
    shift = _open_shift(state)

    sale = state.create_pos_sale(
        "UTAWALA",
        {
            "cashier_id": "Clerk A",
            "shift_id": shift["shift_id"],
            "terminal_id": "POS-UTW-01",
            "payment_method": "cash",
            "cash_amount": 500,
            "discount_amount": 0,
            "idempotency_key": "manual-unbarcoded-001",
            "items": [_manual_item_payload()],
        },
        created_by="store_manager_1",
    )
    response = PosSaleResponse(**sale)
    report = state.get_pos_shift_x_report("UTAWALA", shift["shift_id"])
    item = sale["items"][0]

    assert sale["sale_no"]
    assert item["line_type"] == "manual_unbarcoded"
    assert item["barcode_type"] == "NONE"
    assert item["display_code"] == "MANUAL"
    assert item["machine_code"] == ""
    assert item["barcode"] == ""
    assert item["store_item_id"] == ""
    assert item["category"] == "Accessories"
    assert item["description"] == "Loose item without barcode"
    assert item["qty"] == 2
    assert item["unit_price"] == 125
    assert item["subtotal"] == 250
    assert item["final_price"] == 250
    assert item["manual_reason"] == "Label damaged"
    assert item["requires_audit"] is True
    assert item["inventory_tracked"] is False
    assert item["created_by"] == "Clerk A"
    assert response.items[0].line_type == "manual_unbarcoded"
    assert response.items[0].barcode_type == "NONE"
    assert response.items[0].description == "Loose item without barcode"
    assert response.items[0].manual_reason == "Label damaged"
    assert response.items[0].requires_audit is True
    assert state.store_items["STOREITEM-MANUAL-CONTROL"] == before_store_item
    assert not state.list_inventory_movements(movement_type="POS_SALE_OUT")
    assert state.sales_transactions[0]["sale_items"][0]["line_type"] == "manual_unbarcoded"
    assert report["manual_item_count"] == 2
    assert report["manual_sales_amount"] == 250
    assert report["category_breakdown"][0]["manual_qty"] == 2
    assert report["category_breakdown"][0]["store_item_qty"] == 0


@pytest.mark.parametrize(
    ("field_name", "bad_value"),
    [
        ("category", ""),
        ("description", ""),
        ("unit_price", 0),
        ("qty", 0),
        ("manual_reason", ""),
    ],
)
def test_manual_unbarcoded_sale_requires_audit_fields(state, field_name, bad_value):
    shift = _open_shift(state)
    item = _manual_item_payload()
    item[field_name] = bad_value
    if field_name in {"qty", "unit_price"}:
        item["final_price"] = 0

    with pytest.raises(HTTPException) as exc:
        state.create_pos_sale(
            "UTAWALA",
            {
                "cashier_id": "Clerk A",
                "shift_id": shift["shift_id"],
                "terminal_id": "POS-UTW-01",
                "payment_method": "cash",
                "cash_amount": 500,
                "idempotency_key": f"manual-required-{field_name}",
                "items": [item],
            },
            created_by="store_manager_1",
        )

    assert exc.value.status_code == 400
    assert field_name in str(exc.value.detail)


def test_mixed_store_item_and_manual_unbarcoded_sale_only_mutates_store_item(state):
    _add_store_item(state, _store_item())
    shift = _open_shift(state)

    sale = state.create_pos_sale(
        "UTAWALA",
        {
            "cashier_id": "Clerk A",
            "shift_id": shift["shift_id"],
            "terminal_id": "POS-UTW-01",
            "payment_method": "cash",
            "cash_amount": 600,
            "idempotency_key": "mixed-store-item-manual-001",
            "items": [
                {
                    "machine_code": "5261240000013",
                    "display_code": "STOREITEM-POS-001",
                    "final_price": 250,
                    "discount_amount": 0,
                },
                _manual_item_payload(qty=1, unit_price=125, final_price=125),
            ],
        },
        created_by="store_manager_1",
    )

    assert sale["total_amount"] == 375
    assert sum(item["qty"] for item in sale["items"]) == 2
    store_line, manual_line = sale["items"]
    assert store_line["line_type"] == "STORE_ITEM"
    assert store_line["machine_code"] == "5261240000013"
    assert manual_line["line_type"] == "manual_unbarcoded"
    assert manual_line["machine_code"] == ""
    assert manual_line["inventory_tracked"] is False
    assert state.store_items["STOREITEM-POS-001"]["status"] == "sold"
    assert state.item_barcode_tokens["STOREITEM-POS-001"]["sale_status"] == "sold"
    assert len(state.list_inventory_movements(movement_type="POS_SALE_OUT")) == 1


def test_pos_sale_success_multiple_items_reduces_inventory_overview(state):
    _add_store_item(state, _store_item(store_item_id="STOREITEM-POS-001", machine_code="5261240000013", location_code="PT-CR", price=250))
    _add_store_item(state, _store_item(store_item_id="STOREITEM-POS-002", machine_code="5261240000020", location_code="UT-BACKROOM", price=800))
    shift = _open_shift(state)
    before = state.get_store_inventory_overview("UTAWALA")

    sale = state.create_pos_sale(
        "UTAWALA",
        _sale_payload("5261240000013", "5261240000020", cash_amount=1200, final_price=250, shift_id=shift["shift_id"]),
        created_by="store_manager_1",
    )
    after = state.get_store_inventory_overview("UTAWALA")

    assert len(sale["items"]) == 2
    assert before["total_items"] == 2
    assert before["shelf_items"] == 1
    assert before["backroom_items"] == 1
    assert after["total_items"] == 0
    assert after["shelf_items"] == 0
    assert after["backroom_items"] == 0
    assert len(state.list_inventory_movements(movement_type="POS_SALE_OUT")) == 2


def test_sold_store_item_cannot_be_sold_again(state):
    _add_store_item(state, _store_item(status="sold", sale_status="sold"))
    shift = _open_shift(state)

    with pytest.raises(HTTPException) as exc:
        state.create_pos_sale("UTAWALA", _sale_payload("5261240000013", shift_id=shift["shift_id"]), created_by="store_manager_1")

    assert exc.value.status_code == 400
    assert "已售" in str(exc.value.detail) or "sold" in str(exc.value.detail).lower()
    assert not state.sales_transactions


def test_pos_sale_rejects_non_store_item_barcodes(state):
    state.bale_barcodes["RB260511001"] = {"bale_barcode": "RB260511001", "machine_code": "1260511001"}
    state.store_dispatch_bales["SDB260511001"] = {"bale_no": "SDB260511001", "machine_code": "2260511001", "store_code": "UTAWALA", "source_bales": []}
    state.store_delivery_execution_orders["SDO260511001"] = state._normalize_store_delivery_execution_order(
        {"execution_order_no": "SDO260511001", "machine_code": "4260511001", "to_store_code": "UTAWALA"}
    )
    state.store_delivery_packages["SDP260511001"] = state._normalize_store_delivery_package(
        {"display_code": "SDP260511001", "package_id": "SDP260511001", "machine_code": "6260511001", "store_code": "UTAWALA"}
    )
    shift = _open_shift(state)

    for barcode in ["1260511001", "2260511001", "3260428001", "4260511001", "6260511001"]:
        with pytest.raises(HTTPException):
            state.create_pos_sale("UTAWALA", _sale_payload(barcode, shift_id=shift["shift_id"]), created_by="store_manager_1")
    assert not state.sales_transactions


def test_pos_sale_rejects_other_store_and_unconfirmed_items(state):
    _add_store_item(state, _store_item(store_item_id="STOREITEM-OTHER", machine_code="5261240000037", store_code="KINNO"))
    _add_store_item(state, _store_item(store_item_id="STOREITEM-UNCONFIRMED", machine_code="5261240000044", stock_in_confirmed=False))
    shift = _open_shift(state)

    with pytest.raises(HTTPException):
        state.create_pos_sale("UTAWALA", _sale_payload("5261240000037", shift_id=shift["shift_id"]), created_by="store_manager_1")
    with pytest.raises(HTTPException):
        state.create_pos_sale("UTAWALA", _sale_payload("5261240000044", shift_id=shift["shift_id"]), created_by="store_manager_1")
    assert not state.sales_transactions


def test_pos_sale_rejects_pending_print_and_pending_stock_in_items(state):
    _add_store_item(
        state,
        _store_item(
            store_item_id="STOREITEM-PENDING-PRINT",
            machine_code="5261240000068",
            status="pending_print",
            sale_status="pending_print",
            stock_in_confirmed=False,
        ),
    )
    _add_store_item(
        state,
        _store_item(
            store_item_id="STOREITEM-PENDING-STOCK-IN",
            machine_code="5261240000075",
            status="pending_stock_in",
            sale_status="pending_stock_in",
            stock_in_confirmed=False,
        ),
    )
    shift = _open_shift(state)

    for barcode in ["5261240000068", "5261240000075"]:
        with pytest.raises(HTTPException) as exc:
            state.create_pos_sale("UTAWALA", _sale_payload(barcode, shift_id=shift["shift_id"]), created_by="store_manager_1")
        assert exc.value.status_code == 400
    assert not state.sales_transactions


def test_pos_sale_payment_validation(state):
    _add_store_item(state, _store_item())
    shift = _open_shift(state)

    with pytest.raises(HTTPException):
        state.create_pos_sale("UTAWALA", _sale_payload("5261240000013", payment_method="mpesa", cash_amount=0, mpesa_amount=250, shift_id=shift["shift_id"]), created_by="store_manager_1")
    with pytest.raises(HTTPException):
        state.create_pos_sale(
            "UTAWALA",
            _sale_payload("5261240000013", payment_method="mixed", cash_amount=50, mpesa_amount=50, mpesa_reference="MPESA123", shift_id=shift["shift_id"]),
            created_by="store_manager_1",
        )


def test_pos_sale_is_atomic_when_any_item_fails(state):
    _add_store_item(state, _store_item(store_item_id="STOREITEM-VALID", machine_code="5261240000013"))
    _add_store_item(state, _store_item(store_item_id="STOREITEM-SOLD", machine_code="5261240000051", status="sold", sale_status="sold"))
    shift = _open_shift(state)

    with pytest.raises(HTTPException):
        state.create_pos_sale("UTAWALA", _sale_payload("5261240000013", "5261240000051", cash_amount=1000, shift_id=shift["shift_id"]), created_by="store_manager_1")

    assert state.store_items["STOREITEM-VALID"]["status"] == "printed_in_store"
    assert state.item_barcode_tokens["STOREITEM-VALID"]["status"] == "printed_in_store"
    assert not state.sales_transactions
    assert not state.inventory_movements
