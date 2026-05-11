import pytest
from fastapi import HTTPException

from test_pos_sale_write_flow import _add_store_item, _open_shift, _sale_payload, _store_item, state


def _hold_payload(*machine_codes, shift_id="", cashier_id="Clerk A", terminal_id="POS-UTW-01", reason="顾客继续挑选", final_price=250):
    return {
        "cashier_id": cashier_id,
        "shift_id": shift_id,
        "terminal_id": terminal_id,
        "reason": reason,
        "customer_name": "",
        "customer_phone": "",
        "note": "",
        "items": [
            {
                "machine_code": machine_code,
                "display_code": f"DISPLAY-{index + 1}",
                "final_price": final_price,
            }
            for index, machine_code in enumerate(machine_codes)
        ],
    }


def _audit_types(state):
    return [event["event_type"] for event in state.audit_events]


def test_create_hold_marks_store_items_held_and_blocks_sale_or_second_hold(state):
    _add_store_item(state, _store_item())
    shift = _open_shift(state)
    before = state.get_store_inventory_overview("UTAWALA")

    hold = state.create_pos_hold("UTAWALA", _hold_payload("5261240000013", shift_id=shift["shift_id"]), created_by="store_manager_1")
    after = state.get_store_inventory_overview("UTAWALA")

    assert hold["hold_no"].startswith("HOLD-UTW-")
    assert hold["status"] == "held"
    assert hold["item_count"] == 1
    assert hold["items"][0]["previous_status"] == "printed_in_store"
    assert state.store_items["STOREITEM-POS-001"]["status"] == "held"
    assert state.store_items["STOREITEM-POS-001"]["hold_no"] == hold["hold_no"]
    assert state.item_barcode_tokens["STOREITEM-POS-001"]["sale_status"] == "held"
    assert before["total_items"] == 1
    assert after["total_items"] == 0
    assert "pos.hold.created" in _audit_types(state)

    with pytest.raises(HTTPException) as sale_exc:
        state.create_pos_sale("UTAWALA", _sale_payload("5261240000013", shift_id=shift["shift_id"]), created_by="store_manager_1")
    assert sale_exc.value.status_code == 400
    assert "held" in str(sale_exc.value.detail).lower() or "挂单" in str(sale_exc.value.detail)

    with pytest.raises(HTTPException):
        state.create_pos_hold("UTAWALA", _hold_payload("5261240000013", shift_id=shift["shift_id"]), created_by="store_manager_1")
    assert not state.sales_transactions
    assert not state.list_inventory_movements(movement_type="POS_SALE_OUT")


def test_hold_list_detail_resume_and_sale_completion_from_hold(state):
    _add_store_item(state, _store_item(store_item_id="STOREITEM-POS-001", machine_code="5261240000013", price=250))
    _add_store_item(state, _store_item(store_item_id="STOREITEM-POS-002", machine_code="5261240000020", price=800))
    shift = _open_shift(state)
    hold = state.create_pos_hold(
        "UTAWALA",
        _hold_payload("5261240000013", "5261240000020", shift_id=shift["shift_id"], final_price=250),
        created_by="store_manager_1",
    )

    holds = state.list_pos_holds("UTAWALA", status="held", limit=20)
    detail = state.get_pos_hold("UTAWALA", hold["hold_no"])
    resumed = state.resume_pos_hold("UTAWALA", hold["hold_no"], resumed_by="store_manager_1")

    assert [row["hold_no"] for row in holds["holds"]] == [hold["hold_no"]]
    assert len(detail["items"]) == 2
    assert resumed["status"] == "resumed"
    assert state.store_items["STOREITEM-POS-001"]["status"] == "held"
    assert "pos.hold.resumed" in _audit_types(state)

    sale_payload = _sale_payload("5261240000013", "5261240000020", cash_amount=1200, shift_id=shift["shift_id"], final_price=250)
    sale_payload["hold_no"] = hold["hold_no"]
    sale = state.create_pos_sale("UTAWALA", sale_payload, created_by="store_manager_1")

    completed_hold = state.get_pos_hold("UTAWALA", hold["hold_no"])
    assert sale["hold_no"] == hold["hold_no"]
    assert completed_hold["status"] == "completed"
    assert completed_hold["completed_sale_id"] == sale["sale_no"]
    assert state.store_items["STOREITEM-POS-001"]["status"] == "sold"
    assert state.store_items["STOREITEM-POS-002"]["sale_status"] == "sold"
    assert len(state.list_inventory_movements(movement_type="POS_SALE_OUT")) == 2
    assert "pos.hold.completed" in _audit_types(state)
    with pytest.raises(HTTPException):
        state.resume_pos_hold("UTAWALA", hold["hold_no"], resumed_by="store_manager_1")


def test_cancel_hold_releases_items_without_sale_or_movement(state):
    _add_store_item(state, _store_item())
    shift = _open_shift(state)
    hold = state.create_pos_hold("UTAWALA", _hold_payload("5261240000013", shift_id=shift["shift_id"]), created_by="store_manager_1")

    cancelled = state.cancel_pos_hold("UTAWALA", hold["hold_no"], {"cancel_reason": "顾客不要了"}, cancelled_by="store_manager_1")

    assert cancelled["status"] == "cancelled"
    assert cancelled["cancel_reason"] == "顾客不要了"
    assert state.store_items["STOREITEM-POS-001"]["status"] == "printed_in_store"
    assert state.store_items["STOREITEM-POS-001"].get("hold_no", "") == ""
    assert state.item_barcode_tokens["STOREITEM-POS-001"]["sale_status"] == "ready_for_sale"
    assert not state.sales_transactions
    assert not state.list_inventory_movements(movement_type="POS_SALE_OUT")
    assert "pos.hold.cancelled" in _audit_types(state)
    with pytest.raises(HTTPException):
        state.resume_pos_hold("UTAWALA", hold["hold_no"], resumed_by="store_manager_1")


def test_hold_is_atomic_and_store_scoped(state):
    _add_store_item(state, _store_item(store_item_id="STOREITEM-VALID", machine_code="5261240000013"))
    _add_store_item(state, _store_item(store_item_id="STOREITEM-SOLD", machine_code="5261240000051", status="sold", sale_status="sold"))
    shift = _open_shift(state)

    with pytest.raises(HTTPException):
        state.create_pos_hold(
            "UTAWALA",
            _hold_payload("5261240000013", "5261240000051", shift_id=shift["shift_id"]),
            created_by="store_manager_1",
        )

    assert state.store_items["STOREITEM-VALID"]["status"] == "printed_in_store"
    assert not state.pos_holds

    hold = state.create_pos_hold("UTAWALA", _hold_payload("5261240000013", shift_id=shift["shift_id"]), created_by="store_manager_1")
    other_store = next(code for code in state.stores if code != "UTAWALA")
    with pytest.raises(HTTPException):
        state.get_pos_hold(other_store, hold["hold_no"])
    with pytest.raises(HTTPException):
        state.resume_pos_hold(other_store, hold["hold_no"], resumed_by="store_manager_1")
    with pytest.raises(HTTPException):
        state.cancel_pos_hold(other_store, hold["hold_no"], {"cancel_reason": "wrong store"}, cancelled_by="store_manager_1")


def test_sale_from_hold_rejects_item_mismatch(state):
    _add_store_item(state, _store_item(store_item_id="STOREITEM-POS-001", machine_code="5261240000013"))
    _add_store_item(state, _store_item(store_item_id="STOREITEM-POS-002", machine_code="5261240000020"))
    shift = _open_shift(state)
    hold = state.create_pos_hold("UTAWALA", _hold_payload("5261240000013", shift_id=shift["shift_id"]), created_by="store_manager_1")

    sale_payload = _sale_payload("5261240000020", cash_amount=1000, shift_id=shift["shift_id"])
    sale_payload["hold_no"] = hold["hold_no"]
    with pytest.raises(HTTPException) as exc:
        state.create_pos_sale("UTAWALA", sale_payload, created_by="store_manager_1")

    assert exc.value.status_code == 400
    assert "hold" in str(exc.value.detail).lower() or "挂单" in str(exc.value.detail)
    assert state.store_items["STOREITEM-POS-001"]["status"] == "held"
    assert state.store_items["STOREITEM-POS-002"]["status"] == "printed_in_store"
    assert not state.sales_transactions
