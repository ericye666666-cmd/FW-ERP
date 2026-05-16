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
from test_pos_sale_write_flow import _add_store_item, _sale_payload, _store_item


@pytest.fixture()
def state():
    temp_dir = tempfile.TemporaryDirectory()
    original_state_file = settings.state_file
    settings.state_file = Path(temp_dir.name) / "runtime_state.json"
    test_state = InMemoryState()
    test_state.initialize_store_racks("UTAWALA", STORE_RACK_TEMPLATE, initialized_by="store_manager_1")
    try:
        yield test_state
    finally:
        settings.state_file = original_state_file
        temp_dir.cleanup()


@pytest.fixture()
def route_state(state):
    original_routes_state = routes_module.state
    routes_module.state = state
    token = state.authenticate_user("store_manager_1", "demo1234")["access_token"]
    try:
        yield state, f"Bearer {token}"
    finally:
        routes_module.state = original_routes_state


def _open_shift(state, cashier_id="Clerk A", terminal_id="POS-UTW-01", opening_float=2000):
    return state.open_pos_shift(
        "UTAWALA",
        {
            "cashier_id": cashier_id,
            "terminal_id": terminal_id,
            "opening_float": opening_float,
            "note": "start shift",
        },
        opened_by="store_manager_1",
    )


def _add_item(state, suffix, *, price=250):
    machine_code = f"52612400000{suffix}"
    store_item_id = f"STOREITEM-POS-{suffix}"
    _add_store_item(
        state,
        _store_item(store_item_id=store_item_id, machine_code=machine_code, price=price),
    )
    return machine_code, store_item_id


def _sell(state, shift_id, machine_code, *, payment_method="cash", cash_amount=1000, mpesa_amount=0, mpesa_reference="", final_price=250, cashier_id="Clerk A"):
    payload = _sale_payload(
        machine_code,
        payment_method=payment_method,
        cash_amount=cash_amount,
        mpesa_amount=mpesa_amount,
        mpesa_reference=mpesa_reference,
        final_price=final_price,
    )
    payload["shift_id"] = shift_id
    payload["cashier_id"] = cashier_id
    return state.create_pos_sale("UTAWALA", payload, created_by="store_manager_1")


def test_open_shift_cashier_based_uniqueness_and_terminal_metadata(state):
    shift = _open_shift(state)

    assert shift["shift_id"].startswith("SHIFT-UTW-")
    assert shift["store_code"] == "UTAWALA"
    assert shift["cashier_id"] == "Clerk A"
    assert shift["terminal_id"] == "POS-UTW-01"
    assert shift["opening_float"] == 2000
    assert shift["status"] == "open"

    reused = _open_shift(state, cashier_id="Clerk A", terminal_id="POS-UTW-02")
    assert reused["shift_id"] == shift["shift_id"]

    second_cashier = _open_shift(state, cashier_id="textcashier", terminal_id="POS-UTW-01")
    assert second_cashier["shift_id"] != shift["shift_id"]
    assert second_cashier["cashier_id"] == "textcashier"
    assert second_cashier["terminal_id"] == "POS-UTW-01"

    reused_second = _open_shift(state, cashier_id="textcashier", terminal_id="POS-UTW-09")
    assert reused_second["shift_id"] == second_cashier["shift_id"]

    open_rows = [row for row in state.list_store_pos_shifts("UTAWALA") if row["status"] == "open"]
    assert {row["cashier_id"] for row in open_rows} >= {"Clerk A", "textcashier"}


def test_current_shift_route_and_missing_404(route_state):
    state, authorization = route_state
    shift = _open_shift(state)

    _open_shift(state, cashier_id="textcashier", terminal_id="POS-UTW-01")
    current = routes_module.get_current_store_pos_shift(
        "UTAWALA",
        cashier_id="Clerk A",
        terminal_id="POS-UTW-99",
        authorization=authorization,
    )

    assert current.shift_id == shift["shift_id"]
    with pytest.raises(HTTPException) as missing:
        routes_module.get_current_store_pos_shift(
            "UTAWALA",
            cashier_id="Clerk B",
            terminal_id="POS-UTW-02",
            authorization=authorization,
        )
    assert missing.value.status_code == 404


def test_pos_sale_requires_matching_open_shift(state):
    machine_code, _ = _add_item(state, "13")
    payload = _sale_payload(machine_code)

    with pytest.raises(HTTPException) as missing:
        state.create_pos_sale("UTAWALA", {**payload, "shift_id": ""}, created_by="store_manager_1")
    with pytest.raises(HTTPException) as unknown:
        state.create_pos_sale("UTAWALA", {**payload, "shift_id": "SHIFT-UTW-260511-9999"}, created_by="store_manager_1")

    shift = _open_shift(state, cashier_id="Clerk A")
    with pytest.raises(HTTPException) as wrong_cashier:
        state.create_pos_sale("UTAWALA", {**payload, "shift_id": shift["shift_id"], "cashier_id": "Clerk B"}, created_by="store_manager_1")

    state.close_pos_shift("UTAWALA", shift["shift_id"], {"counted_cash": 2000, "note": ""}, closed_by="store_manager_1")
    with pytest.raises(HTTPException) as closed:
        state.create_pos_sale("UTAWALA", {**payload, "shift_id": shift["shift_id"]}, created_by="store_manager_1")

    assert missing.value.status_code == 400
    assert unknown.value.status_code == 404
    assert wrong_cashier.value.status_code == 400
    assert closed.value.status_code == 400
    assert not state.sales_transactions


def test_pos_sale_with_open_shift_and_summary_breakdown(state):
    shift = _open_shift(state, opening_float=2000)
    cash_code, _ = _add_item(state, "13", price=250)
    mpesa_code, _ = _add_item(state, "20", price=800)
    mixed_code, _ = _add_item(state, "37", price=300)

    _sell(state, shift["shift_id"], cash_code, payment_method="cash", cash_amount=300, final_price=250)
    _sell(state, shift["shift_id"], mpesa_code, payment_method="mpesa", cash_amount=0, mpesa_amount=800, mpesa_reference="MPESA800", final_price=800)
    _sell(state, shift["shift_id"], mixed_code, payment_method="mixed", cash_amount=100, mpesa_amount=200, mpesa_reference="MPESA200", final_price=300)

    summary = state.get_pos_shift_summary("UTAWALA", shift["shift_id"])

    assert summary["shift_id"] == shift["shift_id"]
    assert summary["total_sales"] == 1350
    assert summary["order_count"] == 3
    assert summary["cash_sales"] == 250
    assert summary["mpesa_sales"] == 800
    assert summary["mixed_cash"] == 100
    assert summary["mixed_mpesa"] == 200
    assert summary["expected_cash"] == 2350
    assert summary["hold_count"] == 0
    assert summary["cancelled_order_count"] == 0


def test_close_shift_records_variance_and_blocks_reclose_or_sales(state):
    shift = _open_shift(state, opening_float=2000)
    machine_code, store_item_id = _add_item(state, "13", price=250)
    sale = _sell(state, shift["shift_id"], machine_code, payment_method="cash", cash_amount=300, final_price=250)
    before_sale_items = list(state.sales_transactions[0]["sale_items"])
    before_item_status = state.store_items[store_item_id]["status"]
    before_token_status = state.item_barcode_tokens[store_item_id]["status"]
    before_movement_count = len(state.list_inventory_movements(movement_type="POS_SALE_OUT"))

    closed = state.close_pos_shift(
        "UTAWALA",
        shift["shift_id"],
        {"counted_cash": 2200, "note": "Short KSh 50", "manager_confirmed_by": "store_manager_1"},
        closed_by="store_manager_1",
    )

    assert closed["status"] == "closed"
    assert closed["expected_cash"] == 2250
    assert closed["counted_cash"] == 2200
    assert closed["cash_variance"] == -50
    assert closed["manager_confirmed_by"] == "store_manager_1"
    assert state.sales_transactions[0]["sale_items"] == before_sale_items
    assert state.store_items[store_item_id]["status"] == before_item_status == "sold"
    assert state.item_barcode_tokens[store_item_id]["status"] == before_token_status == "sold"
    assert len(state.list_inventory_movements(movement_type="POS_SALE_OUT")) == before_movement_count

    next_code, _ = _add_item(state, "44", price=250)
    with pytest.raises(HTTPException):
        _sell(state, shift["shift_id"], next_code)
    with pytest.raises(HTTPException):
        state.close_pos_shift("UTAWALA", shift["shift_id"], {"counted_cash": 2250}, closed_by="store_manager_1")
    assert sale["shift_id"] == shift["shift_id"]

def test_current_shift_lookup_returns_cashier_shift_not_terminal_owner(state):
    clerk_shift = _open_shift(state, cashier_id="Clerk A", terminal_id="POS-UTW-01")
    text_shift = _open_shift(state, cashier_id="textcashier", terminal_id="POS-UTW-01")

    current = state.get_current_pos_shift("UTAWALA", cashier_id="textcashier", terminal_id="POS-UTW-01")

    assert current["shift_id"] == text_shift["shift_id"]
    assert current["shift_id"] != clerk_shift["shift_id"]
