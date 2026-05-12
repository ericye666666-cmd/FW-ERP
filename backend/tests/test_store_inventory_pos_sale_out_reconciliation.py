import sys
import tempfile
from pathlib import Path

import pytest
from fastapi import HTTPException


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api import routes as routes_module
from app.core.config import settings
from app.core.seed_data import STORE_RACK_TEMPLATE
from app.core.state import InMemoryState
from app.schemas.sales import PosSaleCreate
from app.schemas.store_racks import StoreItemStockInConfirmRequest


def _store_item(
    *,
    store_item_id="STOREITEM-306-001",
    machine_code="5261240000013",
    store_code="UTAWALA",
    category_short="CARGO PANT",
    location_code="",
    stock_in_confirmed=None,
    status="pending_print",
    sale_status="ready_for_sale",
):
    row = {
        "store_item_id": store_item_id,
        "item_id": store_item_id,
        "display_code": store_item_id,
        "machine_code": machine_code,
        "barcode_value": machine_code,
        "entity_type": "STORE_ITEM",
        "store_code": store_code,
        "category_short": category_short,
        "category_name": category_short,
        "category_sub": category_short,
        "grade": "P",
        "pricing_type": "P",
        "sale_price_kes": 410,
        "selling_price_kes": 410,
        "selected_price": 410,
        "current_location_code": location_code,
        "store_rack_code": location_code,
        "rack_code": location_code,
        "source_sdp_display_code": "SDP261290018",
        "parent_sdo_display_code": "SDO261290001",
        "print_status": "printed",
        "printed_by": "Austin",
        "status": status,
        "store_item_status": status,
        "sale_status": sale_status,
        "created_at": "2026-05-11T08:00:00+03:00",
        "updated_at": "2026-05-11T08:00:00+03:00",
    }
    if stock_in_confirmed is not None:
        row["stock_in_confirmed"] = stock_in_confirmed
    return row


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


@pytest.fixture()
def route_state():
    temp_dir = tempfile.TemporaryDirectory()
    original_state_file = settings.state_file
    settings.state_file = Path(temp_dir.name) / "runtime_state.json"
    test_state = InMemoryState()
    test_state.initialize_store_racks("UTAWALA", STORE_RACK_TEMPLATE, initialized_by="store_manager_1")
    test_state.upsert_store_location(
        "UTAWALA",
        {
            "location_code": "PT-CR",
            "location_name": "CARGO PANT 主货架",
            "location_type": "SHELF",
            "category_name": "CARGO PANT",
            "active": True,
            "updated_by": "store_manager_1",
        },
    )
    original_routes_state = routes_module.state
    routes_module.state = test_state
    store_manager_token = test_state.authenticate_user("store_manager_1", "demo1234")["access_token"]
    store_clerk_token = test_state.authenticate_user("store_clerk_1", "demo1234")["access_token"]
    try:
        yield test_state, f"Bearer {store_manager_token}", f"Bearer {store_clerk_token}"
    finally:
        routes_module.state = original_routes_state
        settings.state_file = original_state_file
        temp_dir.cleanup()


def _open_shift(state):
    return state.open_pos_shift(
        "UTAWALA",
        {
            "cashier_id": "Clerk A",
            "terminal_id": "POS-UTW-01",
            "opening_float": 2000,
            "note": "306 integration test shift",
        },
        opened_by="store_manager_1",
    )


def _sale_payload(machine_code, *, shift_id, idempotency_key=""):
    return PosSaleCreate(
        idempotency_key=idempotency_key,
        cashier_id="Clerk A",
        shift_id=shift_id,
        terminal_id="POS-UTW-01",
        payment_method="cash",
        cash_amount=500,
        discount_amount=0,
        items=[
            {
                "machine_code": machine_code,
                "display_code": "STOREITEM-306-001",
                "final_price": 410,
                "discount_amount": 0,
            }
        ],
    )


def test_route_repeated_pos_sale_idempotency_returns_same_sale(route_state):
    state, manager_auth, _ = route_state
    machine_code = "5261240000099"
    _add_store_item(
        state,
        _store_item(
            store_item_id="STOREITEM-306-099",
            machine_code=machine_code,
            location_code="PT-CR",
            stock_in_confirmed=True,
            status="ready_for_sale",
        ),
    )
    shift = _open_shift(state)
    payload = _sale_payload(machine_code, shift_id=shift["shift_id"], idempotency_key="route-pos-sale-retry-001")

    first = routes_module.create_store_pos_sale("UTAWALA", payload, authorization=manager_auth)
    second = routes_module.create_store_pos_sale("UTAWALA", payload, authorization=manager_auth)

    assert second.sale_no == first.sale_no
    assert second.idempotency_key == "route-pos-sale-retry-001"
    assert len(state.sales_transactions) == 1
    assert len(state.list_inventory_movements(movement_type="POS_SALE_OUT")) == 1


def test_confirmed_store_item_leaves_inventory_overview_after_pos_sale(route_state):
    state, manager_auth, clerk_auth = route_state
    machine_code = "5261240000013"
    _add_store_item(state, _store_item(machine_code=machine_code))

    before_confirm = routes_module.get_store_inventory_overview("UTAWALA", authorization=manager_auth)
    confirm = routes_module.confirm_store_item_stock_in(
        "UTAWALA",
        machine_code,
        StoreItemStockInConfirmRequest(location_code="PT-CR", confirmed_by="Austin"),
        authorization=clerk_auth,
    )
    after_confirm = routes_module.get_store_inventory_overview("UTAWALA", authorization=manager_auth)
    after_confirm_location = routes_module.get_store_inventory_location_items(
        "UTAWALA",
        "PT-CR",
        authorization=manager_auth,
    )
    after_confirm_category = routes_module.get_store_inventory_category_items(
        "UTAWALA",
        "CARGO PANT",
        authorization=manager_auth,
    )
    confirmed_item_status = state.store_items["STOREITEM-306-001"]["status"]
    confirmed_token_status = state.item_barcode_tokens["STOREITEM-306-001"]["status"]

    shift = _open_shift(state)
    sale = routes_module.create_store_pos_sale(
        "UTAWALA",
        _sale_payload(machine_code, shift_id=shift["shift_id"]),
        authorization=manager_auth,
    )
    after_sale = routes_module.get_store_inventory_overview("UTAWALA", authorization=manager_auth)
    after_sale_location = routes_module.get_store_inventory_location_items(
        "UTAWALA",
        "PT-CR",
        authorization=manager_auth,
    )
    after_sale_category = routes_module.get_store_inventory_category_items(
        "UTAWALA",
        "CARGO PANT",
        authorization=manager_auth,
    )
    sale_detail = routes_module.get_store_pos_sale("UTAWALA", sale.sale_no, authorization=manager_auth)
    sale_list = routes_module.list_store_pos_sales("UTAWALA", limit=20, authorization=manager_auth)
    movements = state.list_inventory_movements(movement_type="POS_SALE_OUT")

    assert before_confirm["total_items"] == 0
    assert before_confirm["unconfirmed_items"] == 1
    assert confirm.status == "confirmed"
    assert confirmed_item_status == "ready_for_sale"
    assert confirmed_token_status == "ready_for_sale"
    assert after_confirm["total_items"] == 1
    assert after_confirm["shelf_items"] == 1
    assert after_confirm["unconfirmed_items"] == 0
    assert after_confirm["by_category"][0]["category_name"] == "CARGO PANT"
    assert after_confirm["by_category"][0]["total_items"] == 1
    assert {row["location_code"]: row["item_count"] for row in after_confirm["by_location"]}["PT-CR"] == 1
    assert [row["machine_code"] for row in after_confirm_location] == [machine_code]
    assert [row["machine_code"] for row in after_confirm_category] == [machine_code]

    assert sale.sale_no
    assert sale.items[0].machine_code == machine_code
    assert state.store_items["STOREITEM-306-001"]["status"] == "sold"
    assert state.item_barcode_tokens["STOREITEM-306-001"]["status"] == "sold"
    assert state.item_barcode_tokens["STOREITEM-306-001"]["sale_no"] == sale.sale_no
    assert movements and movements[-1]["details"]["reference_sale_id"] == sale.sale_no
    assert after_sale["total_items"] == 0
    assert after_sale["shelf_items"] == 0
    assert {row["location_code"]: row["item_count"] for row in after_sale["by_location"]}["PT-CR"] == 0
    assert after_sale_category == []
    assert after_sale_location == []
    assert sale_detail.sale_no == sale.sale_no
    assert sale_detail.items[0].machine_code == machine_code
    assert [row.sale_no for row in sale_list.sales] == [sale.sale_no]


def test_unconfirmed_store_item_still_cannot_be_sold(route_state):
    state, manager_auth, _ = route_state
    _add_store_item(state, _store_item(machine_code="5261240000044", stock_in_confirmed=False, status="active"))
    shift = _open_shift(state)

    with pytest.raises(HTTPException) as exc:
        routes_module.create_store_pos_sale(
            "UTAWALA",
            _sale_payload("5261240000044", shift_id=shift["shift_id"]),
            authorization=manager_auth,
        )

    assert exc.value.status_code == 400
    assert "库存确认" in str(exc.value.detail)
