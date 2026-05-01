import tempfile
from pathlib import Path

import pytest
from fastapi import HTTPException

from app.core.config import settings
from app.core.state import InMemoryState


@pytest.fixture()
def isolated_state():
    temp_dir = tempfile.TemporaryDirectory()
    original_state_file = settings.state_file
    settings.state_file = Path(temp_dir.name) / "runtime_state.json"
    try:
        yield InMemoryState()
    finally:
        settings.state_file = original_state_file
        temp_dir.cleanup()


def _create_ready_raw_bales(state: InMemoryState, customs_notice_no: str = "ROLE240427"):
    shipment = state.create_inbound_shipment(
        {
            "shipment_type": "sea",
            "customs_notice_no": customs_notice_no,
            "unload_date": "2026-04-27",
            "coc_goods_manifest": "role permission contract tests",
            "note": "",
            "coc_documents": [],
        }
    )
    state.create_parcel_batch(
        {
            "intake_type": "sea_freight",
            "inbound_shipment_no": shipment["shipment_no"],
            "supplier_name": "Youxun Demo",
            "cargo_type": "summer apparel",
            "category_main": "dress",
            "category_sub": "2 pieces",
            "package_count": 1,
            "total_weight": 40,
            "received_by": "warehouse_clerk_1",
            "note": "permission contract setup",
        }
    )
    state.confirm_inbound_shipment_intake(
        shipment["shipment_no"],
        {
            "declared_total_packages": 1,
            "confirmed_by": "warehouse_supervisor_1",
            "note": "confirmed for contract setup",
        },
    )
    bales = state.generate_bale_barcodes(shipment["shipment_no"], "warehouse_supervisor_1")
    return shipment, bales


def _create_sorting_token(state: InMemoryState):
    _, bales = _create_ready_raw_bales(state, customs_notice_no="ROLE240427-SORT")
    task = state.create_sorting_task(
        {
            "bale_barcodes": [bales[0]["bale_barcode"]],
            "handler_names": ["warehouse_clerk_1"],
            "note": "prepare sorting token",
            "created_by": "warehouse_supervisor_1",
        }
    )
    state.submit_sorting_task_results(
        task["task_no"],
        {
            "result_items": [
                {
                    "category_name": "dress / 2 pieces",
                    "grade": "P",
                    "actual_weight_kg": 40,
                    "qty": 1,
                    "confirm_to_inventory": True,
                }
            ],
            "note": "confirm to inventory",
            "created_by": "warehouse_supervisor_1",
        },
    )
    return next(iter(state.item_barcode_tokens.values()))


def test_contract_cost_fill_denies_store_role(isolated_state: InMemoryState):
    state = isolated_state
    state.create_or_update_china_source_record(
        {
            "source_pool_token": "CN-SRC-ROLE240427-01",
            "container_type": "40HQ",
            "customs_notice_no": "ROLE240427",
            "lines": [
                {
                    "source_bale_token": "CN-SRC-ROLE240427-01-001",
                    "supplier_name": "Youxun Demo",
                    "category_main": "dress",
                    "category_sub": "2 pieces",
                    "package_count": 1,
                    "unit_weight_kg": 40,
                    "unit_cost_amount": 100,
                    "unit_cost_currency": "KES",
                }
            ],
        },
        created_by="warehouse_supervisor_1",
    )

    with pytest.raises(HTTPException) as exc:
        state.update_china_source_cost(
            "CN-SRC-ROLE240427-01",
            {"cost_entries": {}},
            updated_by="store_manager_1",
        )

    assert exc.value.status_code == 403


def test_user_management_update_and_soft_deactivate_preserve_org_binding(isolated_state: InMemoryState):
    state = isolated_state
    created = state.create_user(
        {
            "created_by": "admin_1",
            "username": "cashier_edit_1",
            "full_name": "Cashier Edit 1",
            "password": "demo1234",
            "role_code": "cashier",
            "store_code": "UTAWALA",
            "is_active": True,
        }
    )

    updated = state.update_user(
        created["id"],
        {
            "updated_by": "admin_1",
            "full_name": "Edited Area Supervisor",
            "role_code": "area_supervisor",
            "store_code": "",
            "warehouse_code": "",
            "area_code": "NAIROBI-EAST",
            "managed_store_codes": ["UTAWALA", "KAWANGWARE"],
            "status": "active",
        },
    )

    assert updated["full_name"] == "Edited Area Supervisor"
    assert updated["role_code"] == "area_supervisor"
    assert updated["store_code"] is None
    assert updated["area_code"] == "NAIROBI-EAST"
    assert updated["managed_store_codes"] == ["UTAWALA", "KAWANGWARE"]
    assert updated["status"] == "active"
    assert updated["is_active"] is True

    deactivated = state.deactivate_user(created["id"], "admin_1")

    assert deactivated["status"] == "inactive"
    assert deactivated["is_active"] is False

    activated = state.update_user(
        created["id"],
        {
            "updated_by": "admin_1",
            "full_name": deactivated["full_name"],
            "role_code": deactivated["role_code"],
            "area_code": deactivated["area_code"],
            "managed_store_codes": deactivated["managed_store_codes"],
            "status": "active",
            "is_active": True,
        },
    )

    assert activated["status"] == "active"
    assert activated["is_active"] is True


def test_user_management_cannot_deactivate_self(isolated_state: InMemoryState):
    state = isolated_state
    admin = next(row for row in state.list_users() if row["username"] == "admin_1")

    with pytest.raises(HTTPException) as exc:
        state.deactivate_user(admin["id"], "admin_1")

    assert exc.value.status_code == 400


def test_user_management_cannot_deactivate_admin_1_from_another_admin(isolated_state: InMemoryState):
    state = isolated_state
    state.create_user(
        {
            "created_by": "admin_1",
            "username": "admin_2",
            "full_name": "Admin 2",
            "password": "demo1234",
            "role_code": "admin",
            "is_active": True,
        }
    )
    admin = next(row for row in state.list_users() if row["username"] == "admin_1")

    with pytest.raises(HTTPException) as exc:
        state.deactivate_user(admin["id"], "admin_2")

    assert exc.value.status_code == 400


def test_user_management_update_restricted_to_admin(isolated_state: InMemoryState):
    state = isolated_state
    cashier = state.create_user(
        {
            "created_by": "admin_1",
            "username": "cashier_edit_permission",
            "full_name": "Cashier Edit Permission",
            "password": "demo1234",
            "role_code": "cashier",
            "store_code": "UTAWALA",
            "is_active": True,
        }
    )

    with pytest.raises(HTTPException) as exc:
        state.update_user(
            cashier["id"],
            {
                "updated_by": "area_supervisor_1",
                "full_name": "Should Not Update",
                "role_code": "cashier",
                "store_code": "UTAWALA",
                "status": "active",
            },
        )

    assert exc.value.status_code == 403


@pytest.mark.xfail(reason="Role matrix requires finance/owner style cost-fill authority, but finance/owner roles are not modeled or enforced yet.")
def test_contract_cost_fill_finance_role_expected(isolated_state: InMemoryState):
    state = isolated_state
    state.create_user(
        {
            "created_by": "admin_1",
            "username": "finance_1",
            "full_name": "Finance 1",
            "password": "demo1234",
            "role_code": "finance",
            "store_code": None,
            "is_active": True,
        }
    )

    state.create_or_update_china_source_record(
        {
            "source_pool_token": "CN-SRC-ROLE240427-02",
            "container_type": "40HQ",
            "customs_notice_no": "ROLE240427",
            "lines": [
                {
                    "source_bale_token": "CN-SRC-ROLE240427-02-001",
                    "supplier_name": "Youxun Demo",
                    "category_main": "dress",
                    "category_sub": "2 pieces",
                    "package_count": 1,
                    "unit_weight_kg": 40,
                    "unit_cost_amount": 100,
                    "unit_cost_currency": "KES",
                }
            ],
        },
        created_by="warehouse_supervisor_1",
    )

    state.update_china_source_cost(
        "CN-SRC-ROLE240427-02",
        {"cost_entries": {}},
        updated_by="finance_1",
    )


@pytest.mark.xfail(reason="Sorting confirmation/cost lock still allows warehouse_clerk; documented contract requires manager/finance/owner gate.")
def test_contract_sorting_confirmation_rejects_clerk(isolated_state: InMemoryState):
    state = isolated_state
    _, bales = _create_ready_raw_bales(state, customs_notice_no="ROLE240427-LOCK")
    task = state.create_sorting_task(
        {
            "bale_barcodes": [bales[0]["bale_barcode"]],
            "handler_names": ["warehouse_clerk_1"],
            "note": "role contract xfail",
            "created_by": "warehouse_supervisor_1",
        }
    )

    with pytest.raises(HTTPException) as exc:
        state.submit_sorting_task_results(
            task["task_no"],
            {
                "result_items": [
                    {
                        "category_name": "dress / 2 pieces",
                        "grade": "P",
                        "actual_weight_kg": 40,
                        "qty": 1,
                        "confirm_to_inventory": True,
                    }
                ],
                "note": "should be blocked for clerk",
                "created_by": "warehouse_clerk_1",
            },
        )
    assert exc.value.status_code == 403


def test_contract_store_receiving_rejects_raw_inbound_bale_identity(isolated_state: InMemoryState):
    state = isolated_state
    _, bales = _create_ready_raw_bales(state, customs_notice_no="ROLE240427-RECV")

    with pytest.raises(HTTPException) as exc:
        state.accept_store_dispatch_bale(
            bales[0]["bale_barcode"],
            {
                "accepted_by": "store_manager_1",
                "store_code": "UTAWALA",
                "note": "raw inbound should be rejected as receiving identity",
            },
        )

    assert exc.value.status_code == 404


def test_contract_store_item_price_edit_does_not_mutate_cost_fields(isolated_state: InMemoryState):
    state = isolated_state
    token = _create_sorting_token(state)
    token_no = token["token_no"]
    before_unit_cost = token.get("unit_cost_kes")

    updated = state.update_item_barcode_token_store_edit(
        token_no,
        {
            "updated_by": "store_manager_1",
            "store_code": "UTAWALA",
            "selling_price_kes": 299,
            "store_rack_code": "A-01",
            "note": "store price edit should not alter cost",
        },
    )

    assert updated["selling_price_kes"] == 299
    assert updated.get("unit_cost_kes") == before_unit_cost


def test_contract_pos_sale_rejects_non_store_item_identity(isolated_state: InMemoryState):
    state = isolated_state
    _, bales = _create_ready_raw_bales(state, customs_notice_no="ROLE240427-POS")

    shift = state.open_cashier_shift(
        {
            "store_code": "UTAWALA",
            "opened_by": "cashier_1",
            "opening_float_cash": 500,
            "note": "open shift for contract test",
        }
    )

    with pytest.raises(HTTPException) as exc:
        state.create_sale_transaction(
            {
                "order_no": "SALE-CONTRACT-001",
                "store_code": "UTAWALA",
                "cashier_name": "cashier_1",
                "shift_no": shift["shift_no"],
                "items": [{"barcode": bales[0]["bale_barcode"], "qty": 1, "selling_price": 100}],
                "payments": [{"method": "cash", "amount": 100, "reference": "", "customer_id": ""}],
            }
        )

    assert exc.value.status_code == 400
    assert "STORE_ITEM" in str(exc.value.detail)


def test_contract_void_and_refund_routes_are_distinct_actions():
    routes_source = Path("backend/app/api/routes.py").read_text()

    assert '@router.post("/sales/{order_no}/void-request"' in routes_source
    assert '@router.post("/sales/{order_no}/refund-request"' in routes_source
    assert '@router.post("/sales/void-requests/{void_no}/review"' in routes_source
    assert '@router.post("/sales/refund-requests/{refund_no}/review"' in routes_source


def test_contract_b2b_bale_sales_namespace_stays_separate_from_pos_namespace():
    routes_source = Path("backend/app/api/routes.py").read_text()

    assert '@router.post("/bale-sales/orders"' in routes_source
    assert '@router.post("/sales"' in routes_source
    assert '@router.post("/pos/shifts/open"' in routes_source


@pytest.mark.xfail(reason="User/role management currently allows area_supervisor to create users; contract says admin/owner only.")
def test_contract_user_role_management_restricted_to_admin_owner_only(isolated_state: InMemoryState):
    state = isolated_state
    with pytest.raises(HTTPException) as exc:
        state.create_user(
            {
                "created_by": "area_supervisor_1",
                "username": "temp_user_contract",
                "full_name": "Temp Contract User",
                "password": "demo1234",
                "role_code": "store_clerk",
                "store_code": "UTAWALA",
                "is_active": True,
            }
        )
    assert exc.value.status_code == 403
