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
from test_pos_sale_write_flow import _add_store_item, _open_shift, _sale_payload, _store_item


@pytest.fixture()
def route_state():
    temp_dir = tempfile.TemporaryDirectory()
    original_state_file = settings.state_file
    settings.state_file = Path(temp_dir.name) / "runtime_state.json"
    test_state = InMemoryState()
    test_state.initialize_store_racks("UTAWALA", STORE_RACK_TEMPLATE, initialized_by="store_manager_1")
    original_routes_state = routes_module.state
    routes_module.state = test_state
    token = test_state.authenticate_user("store_manager_1", "demo1234")["access_token"]
    try:
        yield test_state, f"Bearer {token}"
    finally:
        routes_module.state = original_routes_state
        settings.state_file = original_state_file
        temp_dir.cleanup()


def _create_sale(state, machine_code, store_item_id, *, price=250, store_code="UTAWALA"):
    _add_store_item(
        state,
        _store_item(
            store_item_id=store_item_id,
            machine_code=machine_code,
            store_code=store_code,
            price=price,
        ),
    )
    shift = next(
        (
            row
            for row in state.cashier_shifts.values()
            if row.get("store_code") == store_code and row.get("cashier_id") == "Clerk A" and row.get("status") == "open"
        ),
        None,
    )
    if not shift:
        terminal_prefix = "UTW" if store_code == "UTAWALA" else store_code[:3].upper()
        shift = _open_shift(state, store_code=store_code, terminal_id=f"POS-{terminal_prefix}-01")
    terminal_id = shift.get("terminal_id") or "POS-UTW-01"
    return state.create_pos_sale(
        store_code,
        _sale_payload(machine_code, cash_amount=price + 100, final_price=price, shift_id=shift["shift_id"], terminal_id=terminal_id),
        created_by="store_manager_1",
    )


def test_pos_sale_detail_route_returns_real_sale_items(route_state):
    state, authorization = route_state
    sale = _create_sale(state, "5261240000013", "STOREITEM-POS-001")

    detail = routes_module.get_store_pos_sale(
        "UTAWALA",
        sale["sale_no"],
        authorization=authorization,
    )

    assert detail.sale_no == sale["sale_no"]
    assert detail.store_code == "UTAWALA"
    assert detail.items[0].machine_code == "5261240000013"
    assert detail.items[0].store_code == "UTAWALA"
    assert detail.total_amount == 250


def test_pos_sale_list_route_returns_current_store_recent_sales_desc(route_state):
    state, authorization = route_state
    first = _create_sale(state, "5261240000013", "STOREITEM-POS-001", price=250)
    second = _create_sale(state, "5261240000020", "STOREITEM-POS-002", price=800)
    state.sales_transactions[0]["sale_time"] = "2026-05-11T08:00:00+03:00"
    state.sales_transactions[0]["created_at"] = "2026-05-11T08:00:00+03:00"
    state.sales_transactions[1]["sale_time"] = "2026-05-11T09:00:00+03:00"
    state.sales_transactions[1]["created_at"] = "2026-05-11T09:00:00+03:00"

    result = routes_module.list_store_pos_sales("UTAWALA", limit=20, authorization=authorization)

    assert result.store_code == "UTAWALA"
    assert [row.sale_no for row in result.sales] == [second["sale_no"], first["sale_no"]]
    assert result.sales[0].total_items == 1
    assert result.sales[0].total_amount == 800


def test_pos_sale_list_route_filters_current_store_only(route_state):
    state, authorization = route_state
    current_store_sale = _create_sale(state, "5261240000013", "STOREITEM-POS-001")
    _create_sale(state, "5261240000037", "STOREITEM-KINNO-001", store_code="KINNO")

    result = routes_module.list_store_pos_sales("UTAWALA", limit=20, authorization=authorization)

    assert [row.sale_no for row in result.sales] == [current_store_sale["sale_no"]]


def test_pos_sale_detail_route_rejects_missing_and_other_store(route_state):
    state, authorization = route_state
    sale = _create_sale(state, "5261240000013", "STOREITEM-POS-001")

    with pytest.raises(HTTPException) as missing:
        routes_module.get_store_pos_sale("UTAWALA", "SALE-UTW-260511-9999", authorization=authorization)
    with pytest.raises(HTTPException) as wrong_store:
        routes_module.get_store_pos_sale("KINNO", sale["sale_no"], authorization=authorization)

    assert missing.value.status_code == 404
    assert wrong_store.value.status_code in {403, 404}


def test_pos_sale_lookup_does_not_mutate_inventory_or_movements(route_state):
    state, authorization = route_state
    sale = _create_sale(state, "5261240000013", "STOREITEM-POS-001")
    before_status = state.store_items["STOREITEM-POS-001"]["status"]
    before_token_status = state.item_barcode_tokens["STOREITEM-POS-001"]["status"]
    before_movement_count = len(state.list_inventory_movements(movement_type="POS_SALE_OUT"))

    routes_module.list_store_pos_sales("UTAWALA", limit=20, authorization=authorization)
    routes_module.get_store_pos_sale("UTAWALA", sale["sale_no"], authorization=authorization)

    assert state.store_items["STOREITEM-POS-001"]["status"] == before_status == "sold"
    assert state.item_barcode_tokens["STOREITEM-POS-001"]["status"] == before_token_status == "sold"
    assert len(state.list_inventory_movements(movement_type="POS_SALE_OUT")) == before_movement_count
