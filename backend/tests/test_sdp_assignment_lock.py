import sys
import tempfile
from pathlib import Path

import pytest
from fastapi import HTTPException


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api import routes as routes_module
from app.core.config import settings
from app.core.state import InMemoryState
from app.schemas.transfers import StoreDeliveryPackageStoreItemGenerateRequest


def _seed_received_sdp_package(state: InMemoryState, *, assigned_clerk: str = "") -> dict:
    transfer_no = "TO-20260512-SDPLOCK"
    state.transfer_orders[transfer_no] = {
        "transfer_no": transfer_no,
        "from_warehouse_code": "WH1",
        "to_store_code": "UTAWALA",
        "created_by": "store_manager_1",
        "approval_required": True,
        "status": "approved",
        "approval_status": "approved",
        "created_at": "2026-05-12T08:00:00+03:00",
        "submitted_at": "2026-05-12T08:00:00+03:00",
        "approved_at": "2026-05-12T08:01:00+03:00",
        "approved_by": "warehouse_supervisor_1",
        "received_at": None,
        "received_by": None,
        "closed_at": None,
        "store_receipt_status": "not_started",
        "demand_lines": [],
        "items": [],
    }
    state.store_dispatch_bales["SDB260512001"] = {
        "bale_no": "SDB260512001",
        "machine_code": "2260512001",
        "transfer_no": transfer_no,
        "source_type": "SDB",
        "source_code": "SDB260512001",
        "source_bales": ["SDB260512001"],
        "status": "ready_dispatch",
        "store_code": "UTAWALA",
        "item_count": 2,
        "category_summary": "tops / lady tops / P",
        "category_name": "tops / lady tops",
        "token_nos": [],
    }
    order = state._normalize_store_delivery_execution_order(
        {
            "execution_order_no": "SDO260512001",
            "machine_code": "4260512001",
            "source_transfer_no": transfer_no,
            "from_warehouse_code": "WH1",
            "to_store_code": "UTAWALA",
            "package_count": 1,
            "packages": [],
            "status": "pending_print",
            "created_by": "warehouse_clerk_1",
            "created_at": "2026-05-12T08:02:00+03:00",
        }
    )
    state.store_delivery_execution_orders[order["execution_order_no"]] = order
    package = state._save_store_delivery_package(
        {
            "id": 330,
            "display_code": "SDP260512001",
            "package_id": "SDP260512001",
            "machine_code": "6260512001",
            "barcode_value": "6260512001",
            "parent_sdo_display_code": order["execution_order_no"],
            "parent_sdo_machine_code": order["machine_code"],
            "transfer_no": transfer_no,
            "store_code": "UTAWALA",
            "package_no": 1,
            "package_total": 1,
            "source_type": "SDB",
            "source_code": "SDB260512001",
            "source_machine_code": "2260512001",
            "item_count": 2,
            "category_summary": "tops / lady tops / P",
            "category_name": "tops / lady tops",
            "received_status": "received",
            "received_at": "2026-05-12T09:00:00+03:00",
            "received_by": "store_manager_1",
            "exception_status": "normal",
            "assigned_clerk": "",
            "assignment_status": "unassigned",
            "status": "received_unassigned",
        }
    )
    if assigned_clerk:
        return state.assign_store_delivery_package(
            package["display_code"],
            {
                "assigned_clerk": assigned_clerk,
                "assigned_by": "store_manager_1",
                "store_code": "UTAWALA",
            },
        )
    return package


@pytest.fixture()
def route_state():
    temp_dir = tempfile.TemporaryDirectory()
    original_state_file = settings.state_file
    settings.state_file = Path(temp_dir.name) / "runtime_state.json"
    test_state = InMemoryState()
    original_routes_state = routes_module.state
    routes_module.state = test_state
    try:
        yield test_state
    finally:
        routes_module.state = original_routes_state
        settings.state_file = original_state_file
        temp_dir.cleanup()


def _auth(state: InMemoryState, username: str) -> str:
    token = state.authenticate_user(username, "demo1234")["access_token"]
    return f"Bearer {token}"


def _generate_payload(**overrides) -> StoreDeliveryPackageStoreItemGenerateRequest:
    data = {
        "store_code": "UTAWALA",
        "clerk": "Austin",
        "assigned_clerk": "Austin",
        "rack_code": "A-01",
        "selected_price": 150,
        "sale_price_kes": 150,
        "category_main": "tops",
        "category_sub": "lady tops",
        "category_short": "TOP",
        "grade": "P",
        "pricing_type": "P",
        "quantity": 1,
        "pricing_batch_id": "PB-SDP260512001-A",
    }
    data.update(overrides)
    return StoreDeliveryPackageStoreItemGenerateRequest(**data)


def test_assigned_clerk_can_process_sdp_and_repeat_same_pricing_batch(route_state):
    state = route_state
    package = _seed_received_sdp_package(state, assigned_clerk="Austin")
    auth = _auth(state, "Austin")

    first = routes_module.generate_store_items_for_sdo_package(
        package["display_code"],
        _generate_payload(),
        authorization=auth,
    )
    repeated = routes_module.generate_store_items_for_sdo_package(
        package["machine_code"],
        _generate_payload(quantity=2),
        authorization=auth,
    )

    assert first.generated_count == 1
    assert repeated.generated_count == 1
    assert repeated.store_items[0]["machine_code"] == first.store_items[0]["machine_code"]
    assert state.store_delivery_packages[package["display_code"]]["assigned_clerk"] == "Austin"


def test_same_sdp_cannot_have_two_active_clerk_assignments(route_state):
    state = route_state
    package = _seed_received_sdp_package(state)

    first = state.assign_store_delivery_package(
        package["display_code"],
        {
            "assigned_clerk": "Austin",
            "assigned_by": "store_manager_1",
            "store_code": "UTAWALA",
        },
    )
    repeated = state.assign_store_delivery_package(
        package["machine_code"],
        {
            "assigned_clerk": "Austin",
            "assigned_by": "store_manager_1",
            "store_code": "UTAWALA",
        },
    )

    assert repeated["assigned_at"] == first["assigned_at"]
    with pytest.raises(HTTPException) as exc:
        state.assign_store_delivery_package(
            package["display_code"],
            {
                "assigned_clerk": "Swahili",
                "assigned_by": "store_manager_1",
                "store_code": "UTAWALA",
            },
        )
    assert exc.value.status_code == 409
    assert "一个 SDP 不能分配给多个店员" in str(exc.value.detail)


def test_unassigned_clerk_cannot_process_sdp_even_with_manipulated_payload(route_state):
    state = route_state
    package = _seed_received_sdp_package(state, assigned_clerk="Austin")
    auth = _auth(state, "Swahili")

    with pytest.raises(HTTPException) as exc:
        routes_module.generate_store_items_for_sdo_package(
            package["display_code"],
            _generate_payload(clerk="Austin", assigned_clerk="Austin"),
            authorization=auth,
        )

    assert exc.value.status_code == 403
    assert exc.value.detail == "该 SDP 已分配给 Austin，你不能处理。"
