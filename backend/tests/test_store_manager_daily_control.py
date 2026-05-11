import copy
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api import routes as routes_module
from app.schemas.store_manager import ManagerMarketFeedbackCreate
from test_pos_hold_flow import _hold_payload
from test_pos_sale_write_flow import _add_store_item, _open_shift, _sale_payload, _store_item, state


def _ean13(value):
    base = str(value).replace("-", "")[:12].zfill(12)
    total = sum((3 if index % 2 else 1) * int(digit) for index, digit in enumerate(base))
    return f"{base}{(10 - total % 10) % 10}"


def _store_item_with_category(store_item_id, category, *, machine_code, price=100, status="printed_in_store", stock_in_confirmed=True):
    row = _store_item(
        store_item_id=store_item_id,
        machine_code=machine_code,
        price=price,
        status=status,
        stock_in_confirmed=stock_in_confirmed,
    )
    row["display_code"] = store_item_id
    row["category_name"] = category
    row["category_short"] = category
    row["category_sub"] = category
    return row


def _add_category_stock(state, category, count, *, prefix, price=100, stock_in_confirmed=True):
    codes = []
    prefix_digits = sum(ord(char) for char in prefix) % 1000
    for index in range(count):
        store_item_id = f"{prefix}-{index + 1:04d}"
        machine_code = _ean13(f"526{prefix_digits:03d}{index + 1:06d}")
        row = _store_item_with_category(
            store_item_id,
            category,
            machine_code=machine_code,
            price=price,
            stock_in_confirmed=stock_in_confirmed,
        )
        _add_store_item(state, row)
        codes.append(row["machine_code"])
    return codes


def _status_snapshot(state):
    return {
        "sales": copy.deepcopy(state.sales_transactions),
        "items": {key: row.get("status") for key, row in state.store_items.items()},
        "holds": copy.deepcopy(state.pos_holds),
        "shifts": copy.deepcopy(state.cashier_shifts),
        "movements": copy.deepcopy(state.inventory_movements),
    }


def test_manager_daily_control_aggregates_real_store_execution_data_without_mutation(state):
    shift = _open_shift(state)
    closed_shift = _open_shift(state, cashier_id="Clerk B", terminal_id="POS-UTW-02")
    state.close_pos_shift(
        "UTAWALA",
        closed_shift["shift_id"],
        {"counted_cash": 1500, "manager_confirmed_by": "store_manager_1", "note": "Short KSh 500"},
        closed_by="Clerk B",
    )

    men_sale_codes = _add_category_stock(state, "Men Shoes", 5, prefix="MEN-SALE", price=100)
    _add_category_stock(state, "Men Shoes", 12, prefix="MEN-STOCK", price=100)
    jacket_sale_codes = _add_category_stock(state, "Jackets", 1, prefix="JACKET-SALE", price=200)
    _add_category_stock(state, "Jackets", 55, prefix="JACKET-STOCK", price=200)
    mixed_codes = _add_category_stock(state, "Cargo Pants", 1, prefix="CARGO-SALE", price=300)
    _add_category_stock(state, "T-Shirts", 3, prefix="UNCONFIRMED", price=150, stock_in_confirmed=False)
    hold_code = _add_category_stock(state, "Men Shoes", 1, prefix="MEN-HOLD", price=100)[0]

    state.create_pos_sale(
        "UTAWALA",
        _sale_payload(*men_sale_codes, payment_method="cash", cash_amount=600, final_price=100, shift_id=shift["shift_id"]),
        created_by="store_manager_1",
    )
    state.create_pos_sale(
        "UTAWALA",
        _sale_payload(jacket_sale_codes[0], payment_method="mpesa", mpesa_amount=200, mpesa_reference="MPE123", final_price=200, shift_id=shift["shift_id"]),
        created_by="store_manager_1",
    )
    state.create_pos_sale(
        "UTAWALA",
        _sale_payload(mixed_codes[0], payment_method="mixed", cash_amount=100, mpesa_amount=200, mpesa_reference="MIX123", final_price=300, shift_id=shift["shift_id"]),
        created_by="store_manager_1",
    )
    state.create_pos_hold(
        "UTAWALA",
        _hold_payload(hold_code, shift_id=shift["shift_id"], final_price=100),
        created_by="store_manager_1",
    )
    feedback = state.create_manager_market_feedback(
        "UTAWALA",
        {
            "category": "Men Shoes",
            "feedback_type": "customer_asked_many",
            "suggested_action": "replenish",
            "note": "Customers asked for big sizes",
        },
        created_by="store_manager_1",
    )

    before = _status_snapshot(state)
    control = state.get_store_manager_daily_control("UTAWALA", date="2026-05-11")
    after = _status_snapshot(state)

    assert control["store_code"] == "UTAWALA"
    assert control["date"] == "2026-05-11"
    assert control["tasks"]["unconfirmed_stock_in_items"] == 3
    assert control["tasks"]["active_holds"] == 1
    assert control["tasks"]["open_shifts"] == 1
    assert control["tasks"]["cash_variance_amount"] == -500
    assert control["flow"]["sold_items"] == 7
    assert control["flow"]["current_sellable_inventory"] == 67
    assert control["flow"]["unprocessed_items"] >= 3
    assert control["cashier_risk"]["today_sales"] == 1000
    assert control["cashier_risk"]["orders"] == 3
    assert control["cashier_risk"]["cash_amount"] == 500
    assert control["cashier_risk"]["mpesa_amount"] == 200
    assert control["cashier_risk"]["mixed_amount"] == 300
    assert control["cashier_risk"]["active_hold_count"] == 1

    hot_by_category = {row["category"]: row for row in control["hot_categories"]}
    assert hot_by_category["Men Shoes"]["sold_qty"] == 5
    assert hot_by_category["Men Shoes"]["current_stock"] == 12
    assert hot_by_category["Men Shoes"]["signal"] == "fast_selling"
    assert hot_by_category["Men Shoes"]["suggested_action"] == "replenish"

    slow_by_category = {row["category"]: row for row in control["slow_categories"]}
    assert slow_by_category["Jackets"]["sold_qty"] == 1
    assert slow_by_category["Jackets"]["current_stock"] == 55
    assert slow_by_category["Jackets"]["signal"] == "slow_moving"
    assert slow_by_category["Jackets"]["suggested_action"] == "promotion"

    assert control["market_feedback"][0]["feedback_id"] == feedback["feedback_id"]
    assert before == after


def test_manager_market_feedback_is_persisted_by_store_and_date(state):
    first = state.create_manager_market_feedback(
        "UTAWALA",
        {
            "category": "Men Shoes",
            "feedback_type": "customer_asked_many",
            "suggested_action": "replenish",
            "note": "Need big sizes",
        },
        created_by="store_manager_1",
    )
    state.create_manager_market_feedback(
        "KINNO",
        {
            "category": "Jackets",
            "feedback_type": "customer_said_expensive",
            "suggested_action": "promotion",
            "note": "Customer said price is high",
        },
        created_by="store_manager_1",
    )

    rows = state.list_manager_market_feedback("UTAWALA", date="2026-05-11")
    other_store_rows = state.list_manager_market_feedback("KINNO", date="2026-05-11")

    assert first["feedback_id"].startswith("FB-UTW-")
    assert [row["feedback_id"] for row in rows] == [first["feedback_id"]]
    assert all(row["store_code"] == "UTAWALA" for row in rows)
    assert all(row["store_code"] == "KINNO" for row in other_store_rows)


def test_manager_daily_control_and_feedback_routes_share_backend_state(state):
    original_state = routes_module.state
    routes_module.state = state
    token = state.authenticate_user("store_manager_1", "demo1234")["access_token"]
    authorization = f"Bearer {token}"
    try:
        created = routes_module.create_store_manager_market_feedback(
            "UTAWALA",
            ManagerMarketFeedbackCreate(
                category="Men Shoes",
                feedback_type="customer_asked_many",
                suggested_action="replenish",
                note="Asked for size 44",
            ),
            authorization=authorization,
        )
        feedback_rows = routes_module.list_store_manager_market_feedback(
            "UTAWALA",
            date="2026-05-11",
            authorization=authorization,
        )
        control = routes_module.get_store_manager_daily_control(
            "UTAWALA",
            date="2026-05-11",
            authorization=authorization,
        )
    finally:
        routes_module.state = original_state

    assert created.feedback_id.startswith("FB-UTW-")
    assert feedback_rows.feedback[0].feedback_id == created.feedback_id
    assert control.store_code == "UTAWALA"
    assert control.market_feedback[0].feedback_id == created.feedback_id
