import tempfile
from pathlib import Path

import pytest
from fastapi import HTTPException

from app.core.config import settings
from app.core.state import InMemoryState


STORE_EMPLOYEE_ROLES = ("store_manager", "store_clerk", "cashier")
PROTECTED_ROLES = (
    "admin",
    "warehouse_supervisor",
    "warehouse_manager",
    "warehouse_clerk",
    "area_supervisor",
    "external_auditor",
)


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


def _user_by_username(state: InMemoryState, username: str) -> dict:
    return next(row for row in state.list_users() if row["username"] == username)


def _create_store_employee(state: InMemoryState, username: str, role_code: str, store_code: str = "UTAWALA") -> dict:
    return state.create_user(
        {
            "created_by": "admin_1",
            "username": username,
            "full_name": username.replace("_", " ").title(),
            "password": "demo1234",
            "role_code": role_code,
            "store_code": store_code,
            "is_active": True,
        }
    )


def test_area_supervisor_can_create_store_and_new_store_is_added_to_managed_stores(isolated_state: InMemoryState):
    state = isolated_state

    created = state.create_store(
        {
            "created_by": "area_supervisor_1",
            "code": "RUIRU",
            "name": "Ruiru Launch Store",
            "status": "preparing",
            "address": "Ruiru, Kiambu Road",
            "phone": "+254700000001",
            "google_maps_url": "https://maps.google.com/?q=Ruiru",
            "manager_note": "Launch preparation",
        }
    )

    supervisor = _user_by_username(state, "area_supervisor_1")
    assert created["code"] == "RUIRU"
    assert created["phone"] == "+254700000001"
    assert "RUIRU" in supervisor["managed_store_codes"]


def test_area_supervisor_can_edit_store_basic_profile_and_close_by_status(isolated_state: InMemoryState):
    state = isolated_state
    state.create_store(
        {
            "created_by": "area_supervisor_1",
            "code": "RUIRU",
            "name": "Ruiru Launch Store",
            "status": "preparing",
        }
    )

    updated = state.update_store(
        "RUIRU",
        {
            "updated_by": "area_supervisor_1",
            "name": "Ruiru Retail",
            "address": "Ruiru Bypass",
            "phone": "+254700000002",
            "google_maps_url": "https://maps.google.com/?q=Ruiru+Bypass",
            "manager_note": "Pause before final opening",
            "status": "paused",
        },
    )

    assert updated["name"] == "Ruiru Retail"
    assert updated["address"] == "Ruiru Bypass"
    assert updated["phone"] == "+254700000002"
    assert updated["google_maps_url"] == "https://maps.google.com/?q=Ruiru+Bypass"
    assert updated["manager_note"] == "Pause before final opening"
    assert updated["status"] == "paused"


@pytest.mark.parametrize("role_code", STORE_EMPLOYEE_ROLES)
def test_area_supervisor_can_create_store_employee_roles(isolated_state: InMemoryState, role_code: str):
    state = isolated_state

    created = state.create_user(
        {
            "created_by": "area_supervisor_1",
            "username": f"launch_{role_code}",
            "full_name": f"Launch {role_code}",
            "password": "demo1234",
            "role_code": role_code,
            "store_code": "UTAWALA",
            "is_active": True,
        }
    )

    assert created["role_code"] == role_code
    assert created["store_code"] == "UTAWALA"
    assert created["is_active"] is True


@pytest.mark.parametrize("role_code", PROTECTED_ROLES)
def test_area_supervisor_cannot_create_protected_roles(isolated_state: InMemoryState, role_code: str):
    state = isolated_state

    with pytest.raises(HTTPException) as exc:
        state.create_user(
            {
                "created_by": "area_supervisor_1",
                "username": f"blocked_{role_code}",
                "full_name": f"Blocked {role_code}",
                "password": "demo1234",
                "role_code": role_code,
                "store_code": "UTAWALA" if role_code in STORE_EMPLOYEE_ROLES else None,
                "is_active": True,
            }
        )

    assert exc.value.status_code == 403
    assert exc.value.detail == "你不能创建这个角色"


@pytest.mark.parametrize("role_code", STORE_EMPLOYEE_ROLES)
def test_area_supervisor_can_reset_store_employee_password(isolated_state: InMemoryState, role_code: str):
    state = isolated_state
    user = _create_store_employee(state, f"reset_{role_code}", role_code)

    updated = state.update_user(
        user["id"],
        {
            "updated_by": "area_supervisor_1",
            "password": "newpass123",
        },
    )

    assert updated["role_code"] == role_code
    login = state.authenticate_user(user["username"], "newpass123")
    assert login["user"]["username"] == user["username"]


@pytest.mark.parametrize("username", ("admin_1", "warehouse_supervisor_1", "warehouse_manager_1", "warehouse_clerk_1", "area_supervisor_1", "auditor_1"))
def test_area_supervisor_cannot_reset_protected_user_password(isolated_state: InMemoryState, username: str):
    state = isolated_state
    target = _user_by_username(state, username)

    with pytest.raises(HTTPException) as exc:
        state.update_user(
            target["id"],
            {
                "updated_by": "area_supervisor_1",
                "password": "newpass123",
            },
        )

    assert exc.value.status_code == 403
    assert exc.value.detail == "你不能重置这个账号的密码"


@pytest.mark.parametrize("role_code", STORE_EMPLOYEE_ROLES)
def test_area_supervisor_can_soft_deactivate_store_employee_without_physical_delete(isolated_state: InMemoryState, role_code: str):
    state = isolated_state
    user = _create_store_employee(state, f"deactivate_{role_code}", role_code)

    deactivated = state.deactivate_user(user["id"], "area_supervisor_1")

    assert deactivated["status"] == "inactive"
    assert deactivated["is_active"] is False
    retained = _user_by_username(state, user["username"])
    assert retained["id"] == user["id"]
    assert retained["status"] == "inactive"


def test_area_supervisor_cannot_reactivate_store_employee_with_active_status(isolated_state: InMemoryState):
    state = isolated_state
    user = _create_store_employee(state, "reactivate_status_clerk", "store_clerk")
    state.deactivate_user(user["id"], "admin_1")

    with pytest.raises(HTTPException) as exc:
        state.update_user(
            user["id"],
            {
                "updated_by": "area_supervisor_1",
                "status": "active",
            },
        )

    assert exc.value.status_code == 403
    assert _user_by_username(state, user["username"])["status"] == "inactive"


def test_area_supervisor_cannot_reactivate_store_employee_with_is_active_true(isolated_state: InMemoryState):
    state = isolated_state
    user = _create_store_employee(state, "reactivate_active_flag_clerk", "store_clerk")
    state.deactivate_user(user["id"], "admin_1")

    with pytest.raises(HTTPException) as exc:
        state.update_user(
            user["id"],
            {
                "updated_by": "area_supervisor_1",
                "is_active": True,
            },
        )

    assert exc.value.status_code == 403
    assert _user_by_username(state, user["username"])["is_active"] is False


def test_area_supervisor_cannot_combine_password_reset_with_status_changes(isolated_state: InMemoryState):
    state = isolated_state
    user = _create_store_employee(state, "reset_with_status_clerk", "store_clerk")

    with pytest.raises(HTTPException) as exc:
        state.update_user(
            user["id"],
            {
                "updated_by": "area_supervisor_1",
                "password": "newpass123",
                "status": "inactive",
            },
        )

    assert exc.value.status_code == 403
    assert state.authenticate_user(user["username"], "demo1234")["user"]["username"] == user["username"]


@pytest.mark.parametrize(
    "field_name, field_value",
    (
        ("role_code", "cashier"),
        ("store_code", "KINNO"),
        ("managed_store_codes", ["KINNO"]),
    ),
)
def test_area_supervisor_cannot_change_role_or_store_org_fields(isolated_state: InMemoryState, field_name: str, field_value):
    state = isolated_state
    user = _create_store_employee(state, f"blocked_{field_name}_clerk", "store_clerk")

    with pytest.raises(HTTPException) as exc:
        state.update_user(
            user["id"],
            {
                "updated_by": "area_supervisor_1",
                field_name: field_value,
            },
        )

    retained = _user_by_username(state, user["username"])
    assert exc.value.status_code == 403
    assert retained["role_code"] == "store_clerk"
    assert retained["store_code"] == "UTAWALA"
    assert retained["managed_store_codes"] == []


@pytest.mark.parametrize("username", ("admin_1", "warehouse_supervisor_1", "warehouse_manager_1", "warehouse_clerk_1", "area_supervisor_1", "auditor_1"))
def test_area_supervisor_cannot_deactivate_protected_users(isolated_state: InMemoryState, username: str):
    state = isolated_state
    target = _user_by_username(state, username)

    with pytest.raises(HTTPException) as exc:
        state.deactivate_user(target["id"], "area_supervisor_1")

    assert exc.value.status_code == 403
    assert exc.value.detail == "请联系主管处理"
