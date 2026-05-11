import pytest
from fastapi import HTTPException

from test_pos_sale_write_flow import _add_store_item, _open_shift, _store_item, state
from app.schemas.sales import PosSaleCreate


def _manual_line(*, category="Dresses / 连衣裙", qty=2, unit_price=150):
    return {
        "line_type": "MANUAL_LEGACY_ITEM",
        "category": category,
        "qty": qty,
        "unit_price": unit_price,
    }


def _manual_sale_payload(*, shift_id="", cash_amount=1000, items=None):
    return {
        "cashier_id": "Clerk A",
        "shift_id": shift_id,
        "terminal_id": "POS-UTW-01",
        "payment_method": "cash",
        "cash_amount": cash_amount,
        "mpesa_amount": 0,
        "mpesa_reference": "",
        "discount_amount": 0,
        "items": items or [_manual_line()],
    }


def test_manual_legacy_item_sale_succeeds_without_barcode_resolver_or_inventory_movement(state, monkeypatch):
    shift = _open_shift(state)

    def fail_resolver(*_args, **_kwargs):
        raise AssertionError("manual legacy item must not call barcode resolver")

    monkeypatch.setattr(state, "resolve_barcode", fail_resolver)

    sale = state.create_pos_sale(
        "UTAWALA",
        _manual_sale_payload(shift_id=shift["shift_id"]),
        created_by="store_manager_1",
    )

    assert sale["total_amount"] == 300
    assert sale["subtotal"] == 300
    assert sale["change_amount"] == 700
    assert sale["items"][0]["line_type"] == "MANUAL_LEGACY_ITEM"
    assert sale["items"][0]["display_code"] == "MANUAL - Dresses / 连衣裙"
    assert sale["items"][0]["machine_code"] == ""
    assert sale["items"][0]["qty"] == 2
    assert sale["items"][0]["unit_price"] == 150
    assert sale["items"][0]["inventory_tracked"] is False
    assert state.sales_transactions[0]["sale_items"][0]["line_type"] == "MANUAL_LEGACY_ITEM"
    assert not state.inventory_movements
    assert not state.store_items


def test_pos_sale_schema_accepts_manual_line_without_machine_code_or_frontend_subtotal():
    payload = PosSaleCreate(
        cashier_id="Clerk A",
        shift_id="SHIFT-UTW-260511-0001",
        terminal_id="POS-UTW-01",
        payment_method="cash",
        cash_amount=300,
        items=[_manual_line()],
    )

    assert payload.items[0].line_type == "MANUAL_LEGACY_ITEM"
    assert payload.items[0].machine_code == ""
    assert payload.items[0].display_code == ""
    assert payload.items[0].final_price == 0


def test_store_item_and_manual_legacy_item_mixed_sale_marks_only_store_item_sold(state):
    _add_store_item(state, _store_item(price=250))
    shift = _open_shift(state)

    sale = state.create_pos_sale(
        "UTAWALA",
        _manual_sale_payload(
            shift_id=shift["shift_id"],
            cash_amount=1000,
            items=[
                {
                    "line_type": "STORE_ITEM",
                    "machine_code": "5261240000013",
                    "display_code": "STOREITEM-POS-001",
                    "final_price": 250,
                    "discount_amount": 0,
                },
                _manual_line(category="T-Shirts / T恤", qty=3, unit_price=100),
            ],
        ),
        created_by="store_manager_1",
    )

    assert sale["total_amount"] == 550
    assert sale["items"][0]["line_type"] == "STORE_ITEM"
    assert sale["items"][0]["inventory_tracked"] is True
    assert sale["items"][1]["line_type"] == "MANUAL_LEGACY_ITEM"
    assert sale["items"][1]["final_price"] == 300
    assert state.store_items["STOREITEM-POS-001"]["status"] == "sold"
    movements = state.list_inventory_movements(movement_type="POS_SALE_OUT")
    assert len(movements) == 1
    assert movements[0]["details"]["display_code"] == "STOREITEM-POS-001"


@pytest.mark.parametrize(
    ("line", "expected"),
    [
        (_manual_line(category="", qty=1, unit_price=100), "category"),
        (_manual_line(qty=0, unit_price=100), "qty"),
        (_manual_line(qty=-1, unit_price=100), "qty"),
        (_manual_line(qty=1, unit_price=0), "unit_price"),
        (_manual_line(qty=1, unit_price=-50), "unit_price"),
    ],
)
def test_manual_legacy_item_validation_rejects_invalid_category_qty_or_price(state, line, expected):
    shift = _open_shift(state)

    with pytest.raises(HTTPException) as exc:
        state.create_pos_sale(
            "UTAWALA",
            _manual_sale_payload(shift_id=shift["shift_id"], items=[line]),
            created_by="store_manager_1",
        )

    assert exc.value.status_code == 400
    assert expected in str(exc.value.detail)
    assert not state.sales_transactions
    assert not state.inventory_movements


def test_manual_legacy_item_still_requires_open_shift(state):
    with pytest.raises(HTTPException) as exc:
        state.create_pos_sale(
            "UTAWALA",
            _manual_sale_payload(shift_id="SHIFT-MISSING"),
            created_by="store_manager_1",
        )

    assert exc.value.status_code in {400, 404}
    assert "shift" in str(exc.value.detail).lower()


def test_shift_reports_include_manual_sales_amount_item_count_and_category_breakdown(state):
    shift = _open_shift(state)
    shift_id = shift["shift_id"]

    state.create_pos_sale(
        "UTAWALA",
        _manual_sale_payload(
            shift_id=shift_id,
            cash_amount=1000,
            items=[_manual_line(category="Dresses / 连衣裙", qty=2, unit_price=150)],
        ),
        created_by="store_manager_1",
    )

    x_report = state.get_pos_shift_x_report("UTAWALA", shift_id)

    assert x_report["total_sales"] == 300
    assert x_report["item_count"] == 2
    assert x_report["manual_item_count"] == 2
    assert x_report["manual_sales_amount"] == 300
    category = {row["category"]: row for row in x_report["category_breakdown"]}["Dresses / 连衣裙"]
    assert category["qty"] == 2
    assert category["manual_qty"] == 2
    assert category["store_item_qty"] == 0
    assert category["amount"] == 300

    state.close_pos_shift(
        "UTAWALA",
        shift_id,
        {
            "counted_cash": 2300,
            "note": "manual sale close",
            "manager_confirmed_by": "store_manager_1",
        },
        closed_by="Clerk A",
    )
    z_report = state.get_pos_shift_z_report("UTAWALA", shift_id)
    assert z_report["manual_item_count"] == 2
    assert z_report["manual_sales_amount"] == 300
    assert z_report["cash_variance"] == 0
