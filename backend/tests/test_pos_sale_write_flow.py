import sys
import tempfile
from pathlib import Path

import pytest
from fastapi import HTTPException


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import settings
from app.core.seed_data import STORE_RACK_TEMPLATE
from app.core.state import InMemoryState


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


def _sale_payload(*machine_codes, payment_method="cash", cash_amount=1000, mpesa_amount=0, mpesa_reference="", final_price=250):
    return {
        "cashier_id": "Clerk A",
        "shift_id": "SHIFT-UTW-250511-A",
        "terminal_id": "POS-UTW-01",
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


def test_pos_sale_success_single_store_item(state):
    _add_store_item(state, _store_item())

    sale = state.create_pos_sale("UTAWALA", _sale_payload("5261240000013"), created_by="store_manager_1")

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


def test_pos_sale_success_multiple_items_reduces_inventory_overview(state):
    _add_store_item(state, _store_item(store_item_id="STOREITEM-POS-001", machine_code="5261240000013", location_code="PT-CR", price=250))
    _add_store_item(state, _store_item(store_item_id="STOREITEM-POS-002", machine_code="5261240000020", location_code="UT-BACKROOM", price=800))
    before = state.get_store_inventory_overview("UTAWALA")

    sale = state.create_pos_sale(
        "UTAWALA",
        _sale_payload("5261240000013", "5261240000020", cash_amount=1200, final_price=250),
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

    with pytest.raises(HTTPException) as exc:
        state.create_pos_sale("UTAWALA", _sale_payload("5261240000013"), created_by="store_manager_1")

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

    for barcode in ["1260511001", "2260511001", "3260428001", "4260511001", "6260511001"]:
        with pytest.raises(HTTPException):
            state.create_pos_sale("UTAWALA", _sale_payload(barcode), created_by="store_manager_1")
    assert not state.sales_transactions


def test_pos_sale_rejects_other_store_and_unconfirmed_items(state):
    _add_store_item(state, _store_item(store_item_id="STOREITEM-OTHER", machine_code="5261240000037", store_code="KINNO"))
    _add_store_item(state, _store_item(store_item_id="STOREITEM-UNCONFIRMED", machine_code="5261240000044", stock_in_confirmed=False))

    with pytest.raises(HTTPException):
        state.create_pos_sale("UTAWALA", _sale_payload("5261240000037"), created_by="store_manager_1")
    with pytest.raises(HTTPException):
        state.create_pos_sale("UTAWALA", _sale_payload("5261240000044"), created_by="store_manager_1")
    assert not state.sales_transactions


def test_pos_sale_payment_validation(state):
    _add_store_item(state, _store_item())

    with pytest.raises(HTTPException):
        state.create_pos_sale("UTAWALA", _sale_payload("5261240000013", payment_method="mpesa", cash_amount=0, mpesa_amount=250), created_by="store_manager_1")
    with pytest.raises(HTTPException):
        state.create_pos_sale(
            "UTAWALA",
            _sale_payload("5261240000013", payment_method="mixed", cash_amount=50, mpesa_amount=50, mpesa_reference="MPESA123"),
            created_by="store_manager_1",
        )


def test_pos_sale_is_atomic_when_any_item_fails(state):
    _add_store_item(state, _store_item(store_item_id="STOREITEM-VALID", machine_code="5261240000013"))
    _add_store_item(state, _store_item(store_item_id="STOREITEM-SOLD", machine_code="5261240000051", status="sold", sale_status="sold"))

    with pytest.raises(HTTPException):
        state.create_pos_sale("UTAWALA", _sale_payload("5261240000013", "5261240000051", cash_amount=1000), created_by="store_manager_1")

    assert state.store_items["STOREITEM-VALID"]["status"] == "printed_in_store"
    assert state.item_barcode_tokens["STOREITEM-VALID"]["status"] == "printed_in_store"
    assert not state.sales_transactions
    assert not state.inventory_movements
