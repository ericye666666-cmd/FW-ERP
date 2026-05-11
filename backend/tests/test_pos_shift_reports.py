import copy

import pytest
from fastapi import HTTPException

from test_pos_hold_flow import _hold_payload
from test_pos_shift_flow import _add_item, _open_shift, _sell, state


def _set_item_category(state, store_item_id, category):
    state.store_items[store_item_id]["category_name"] = category
    state.store_items[store_item_id]["category"] = category
    token = state.item_barcode_tokens.get(store_item_id)
    if token:
        token["category_name"] = category
        token["category"] = category


def _pos_sale_out_count(state):
    return len(
        [
            row
            for row in state.inventory_movements
            if row.get("movement_type") == "POS_SALE_OUT"
        ]
    )


def test_open_shift_x_report_summarizes_sales_payments_holds_and_is_read_only(state):
    shift = _open_shift(state, opening_float=2000)
    shift_id = shift["shift_id"]

    cash_code, cash_id = _add_item(state, "13", price=250)
    mpesa_code, mpesa_id = _add_item(state, "20", price=800)
    mixed_code, mixed_id = _add_item(state, "37", price=300)
    active_hold_code, active_hold_id = _add_item(state, "44", price=150)
    cancelled_hold_code, _cancelled_hold_id = _add_item(state, "51", price=150)
    completed_hold_code, completed_hold_id = _add_item(state, "68", price=150)

    _set_item_category(state, cash_id, "CARGO PANT")
    _set_item_category(state, mixed_id, "CARGO PANT")
    _set_item_category(state, mpesa_id, "DRESSES")
    _set_item_category(state, completed_hold_id, "DRESSES")
    _set_item_category(state, active_hold_id, "T-SHIRTS")

    _sell(state, shift_id, cash_code, payment_method="cash", cash_amount=500, final_price=250)
    _sell(
        state,
        shift_id,
        mpesa_code,
        payment_method="mpesa",
        mpesa_amount=800,
        mpesa_reference="MPE123",
        final_price=800,
    )
    _sell(
        state,
        shift_id,
        mixed_code,
        payment_method="mixed",
        cash_amount=100,
        mpesa_amount=200,
        mpesa_reference="MIX123",
        final_price=300,
    )

    active_hold = state.create_pos_hold(
        "UTAWALA",
        _hold_payload(active_hold_code, shift_id=shift_id, final_price=150),
    )
    cancelled_hold = state.create_pos_hold(
        "UTAWALA",
        _hold_payload(cancelled_hold_code, shift_id=shift_id, final_price=150),
    )
    state.cancel_pos_hold(
        "UTAWALA",
        cancelled_hold["hold_no"],
        {"cancel_reason": "顾客不要了"},
        cancelled_by="Clerk A",
    )
    completed_hold = state.create_pos_hold(
        "UTAWALA",
        _hold_payload(completed_hold_code, shift_id=shift_id, final_price=150),
    )
    state.resume_pos_hold("UTAWALA", completed_hold["hold_no"], resumed_by="Clerk A")
    state.create_pos_sale(
        "UTAWALA",
        {
            "cashier_id": "Clerk A",
            "shift_id": shift_id,
            "terminal_id": "POS-UTW-01",
            "payment_method": "cash",
            "cash_amount": 200,
            "mpesa_amount": 0,
            "mpesa_reference": "",
            "discount_amount": 0,
            "hold_no": completed_hold["hold_no"],
            "items": [
                {
                    "machine_code": completed_hold_code,
                    "display_code": "STOREITEM-POS-68",
                    "final_price": 150,
                    "discount_amount": 0,
                }
            ],
        },
    )

    sales_before = copy.deepcopy(state.sales_transactions)
    item_statuses_before = {
        key: row.get("status") for key, row in state.store_items.items()
    }
    movement_count_before = _pos_sale_out_count(state)

    report = state.get_pos_shift_x_report("UTAWALA", shift_id)

    assert report["report_type"] == "X_REPORT"
    assert report["status"] == "open"
    assert report["shift_id"] == shift_id
    assert report["total_sales"] == 1500
    assert report["order_count"] == 4
    assert report["item_count"] == 4
    assert report["cash_sales"] == 400
    assert report["mpesa_sales"] == 800
    assert report["mixed_cash"] == 100
    assert report["mixed_mpesa"] == 200
    assert report["expected_cash"] == 2500
    assert report["counted_cash"] is None
    assert report["cash_variance"] is None
    assert report["hold_count"] == 3
    assert report["active_hold_count"] == 1
    assert report["completed_hold_count"] == 1
    assert report["cancelled_hold_count"] == 1

    payments = {row["method"]: row for row in report["payment_breakdown"]}
    assert payments["cash"] == {"method": "cash", "amount": 400, "orders": 2}
    assert payments["mpesa"] == {"method": "mpesa", "amount": 800, "orders": 1}
    assert payments["mixed"] == {"method": "mixed", "amount": 300, "orders": 1}

    categories = {row["category"]: row for row in report["category_breakdown"]}
    assert categories["CARGO PANT"] == {
        "category": "CARGO PANT",
        "qty": 2,
        "amount": 550,
        "store_item_qty": 2,
        "manual_qty": 0,
    }
    assert categories["DRESSES"] == {
        "category": "DRESSES",
        "qty": 2,
        "amount": 950,
        "store_item_qty": 2,
        "manual_qty": 0,
    }

    assert state.pos_holds[active_hold["hold_no"]]["status"] == "held"
    assert state.sales_transactions == sales_before
    assert {key: row.get("status") for key, row in state.store_items.items()} == item_statuses_before
    assert _pos_sale_out_count(state) == movement_count_before


def test_z_report_requires_closed_shift_and_uses_close_cash_variance(state):
    shift = _open_shift(state, opening_float=2000)
    shift_id = shift["shift_id"]
    machine_code, _store_item_id = _add_item(state, "13", price=250)
    _sell(state, shift_id, machine_code, payment_method="cash", cash_amount=500, final_price=250)

    with pytest.raises(HTTPException) as exc:
        state.get_pos_shift_z_report("UTAWALA", shift_id)
    assert exc.value.status_code == 400
    assert "Use X-report" in exc.value.detail

    state.close_pos_shift(
        "UTAWALA",
        shift_id,
        {
            "counted_cash": 2200,
            "note": "Short KSh 50",
            "manager_confirmed_by": "store_manager_1",
        },
        closed_by="Clerk A",
    )
    movement_count_before = _pos_sale_out_count(state)

    report = state.get_pos_shift_z_report("UTAWALA", shift_id)

    assert report["report_type"] == "Z_REPORT"
    assert report["status"] == "closed"
    assert report["closed_at"]
    assert report["closed_by"] == "Clerk A"
    assert report["manager_confirmed_by"] == "store_manager_1"
    assert report["opening_float"] == 2000
    assert report["cash_sales"] == 250
    assert report["expected_cash"] == 2250
    assert report["counted_cash"] == 2200
    assert report["cash_variance"] == -50
    assert _pos_sale_out_count(state) == movement_count_before


def test_shift_report_store_scope_is_enforced(state):
    shift = _open_shift(state)

    with pytest.raises(HTTPException) as exc:
        state.get_pos_shift_x_report("CBD", shift["shift_id"])
    assert exc.value.status_code == 404
