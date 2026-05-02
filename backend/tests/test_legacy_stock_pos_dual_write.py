import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
from fastapi import HTTPException

from app.core.config import settings
from app.core.state import InMemoryState


DB_SYNC_FAILURE_MESSAGE = "销售已完成，但数据库同步失败，请联系管理员"


def _new_state(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "state_file", tmp_path / "runtime_state.json")
    monkeypatch.setattr(settings, "storage_mode", "runtime_json")
    monkeypatch.setattr(settings, "database_url", None)
    return InMemoryState()


def _open_cashier_shift(state: InMemoryState):
    return state.open_cashier_shift(
        {
            "opened_by": "cashier_1",
            "store_code": "UTAWALA",
            "opening_float_cash": 1000,
            "note": "legacy stock POS test shift",
        }
    )


def _open_shift_as(state: InMemoryState, username: str):
    return state.open_cashier_shift(
        {
            "opened_by": username,
            "store_code": "UTAWALA",
            "opening_float_cash": 1000,
            "note": f"open POS shift for {username}",
        }
    )


def _legacy_sale_payload(shift_no: str = ""):
    return {
        "order_no": "POS-LEGACY-001",
        "store_code": "UTAWALA",
        "cashier_name": "cashier_1",
        "shift_no": shift_no,
        "sold_at": "2026-05-02T09:00:00+03:00",
        "note": "old stock quick sale",
        "items": [
            {
                "source_type": "LEGACY_STOCK",
                "category": "Tops",
                "subcategory": "lady tops",
                "legacy_item_label": "old price tag",
                "qty": 1,
                "selling_price": 150,
            }
        ],
        "payments": [{"method": "cash", "amount": 150}],
    }


def _seed_store_item_for_runtime_sale(state: InMemoryState, barcode: str = "5260430001") -> dict:
    token = {
        "token_no": "TOK-POS-STORE-001",
        "identity_no": "TOK-POS-STORE-001",
        "display_code": "ST-20260430-001-0001",
        "barcode_value": barcode,
        "final_item_barcode": {"barcode_value": barcode},
        "status": "shelved",
        "category_name": "tops / lady tops",
        "grade": "P",
        "source_sdo": "SDO260430001",
        "source_package": "SDB260430AAB",
        "store_dispatch_bale_no": "SDB260430AAB",
        "store_code": "UTAWALA",
        "assigned_employee": "store_clerk_1",
        "selling_price_kes": 220,
        "unit_cost_kes": 80,
        "store_rack_code": "A-TS-LT-01",
        "created_at": "2026-05-02T08:30:00+03:00",
        "updated_at": "2026-05-02T08:30:00+03:00",
    }
    state.item_barcode_tokens[token["token_no"]] = token
    state._ensure_item_token_product_exists(token["token_no"], actor="store_manager_1", rack_code="A-TS-LT-01")
    state._add_store_lot(
        "UTAWALA",
        barcode,
        qty=1,
        unit_cost=80,
        source_type="store_item_seed",
        source_no=token["token_no"],
        store_rack_code="A-TS-LT-01",
    )
    return token


def _store_item_sale_payload(shift_no: str = "", barcode: str = "5260430001"):
    return {
        "order_no": "POS-STORE-RUNTIME-001",
        "store_code": "UTAWALA",
        "cashier_name": "cashier_1",
        "shift_no": shift_no,
        "sold_at": "2026-05-02T09:30:00+03:00",
        "note": "store item POS sale",
        "items": [
            {
                "source_type": "STORE_ITEM",
                "barcode": barcode,
                "qty": 1,
                "selling_price": 220,
            }
        ],
        "payments": [{"method": "cash", "amount": 220}],
    }


def test_legacy_stock_quick_sale_records_runtime_without_store_item_barcode(tmp_path, monkeypatch):
    state = _new_state(tmp_path, monkeypatch)
    shift = _open_cashier_shift(state)

    sale = state.create_sale_transaction(_legacy_sale_payload(shift["shift_no"]))

    assert sale["order_no"] == "POS-LEGACY-001"
    assert sale["total_qty"] == 1
    assert sale["total_amount"] == 150
    assert sale["items"][0]["source_type"] == "LEGACY_STOCK"
    assert sale["items"][0]["legacy_category"] == "Tops"
    assert sale["items"][0]["legacy_subcategory"] == "lady tops"
    assert sale["items"][0]["legacy_item_label"] == "old price tag"
    assert sale["items"][0]["barcode"] == ""
    assert sale["items"][0]["line_total"] == 150
    assert sale["identity_ids"] == []
    assert not [
        row
        for row in state.inventory_movements
        if row.get("reference_no") == "POS-LEGACY-001" and row.get("movement_type") == "sale_out"
    ]
    assert any(
        row.get("event_type") == "sale.posted"
        and row.get("entity_id") == "POS-LEGACY-001"
        and row.get("details", {}).get("source_type_totals", {}).get("LEGACY_STOCK") == 150
        for row in state.audit_events
    )


def test_admin_can_open_shift_and_complete_pos_sale(tmp_path, monkeypatch):
    state = _new_state(tmp_path, monkeypatch)
    shift = _open_shift_as(state, "admin_1")
    payload = _legacy_sale_payload(shift["shift_no"])
    payload["order_no"] = "POS-ADMIN-001"
    payload["cashier_name"] = "admin_1"

    sale = state.create_sale_transaction(payload)

    assert shift["cashier_name"] == "admin_1"
    assert sale["sale_no"] == "POS-ADMIN-001"
    assert sale["cashier_name"] == "admin_1"


def test_store_manager_cannot_open_shift_or_create_pos_sale_by_default(tmp_path, monkeypatch):
    state = _new_state(tmp_path, monkeypatch)

    with pytest.raises(HTTPException) as open_exc:
        _open_shift_as(state, "store_manager_1")

    assert open_exc.value.status_code == 403

    payload = _legacy_sale_payload("")
    payload["cashier_name"] = "store_manager_1"
    with pytest.raises(HTTPException) as sale_exc:
        state.create_sale_transaction(payload)

    assert sale_exc.value.status_code == 403
    assert state.sales_transactions == []


def test_non_pos_roles_cannot_create_pos_sale(tmp_path, monkeypatch):
    blocked_users = [
        "store_clerk_1",
        "warehouse_clerk_1",
        "warehouse_manager_1",
        "area_supervisor_1",
    ]
    for username in blocked_users:
        state = _new_state(tmp_path / username, monkeypatch)
        payload = _legacy_sale_payload("")
        payload["cashier_name"] = username

        with pytest.raises(HTTPException) as exc_info:
            state.create_sale_transaction(payload)

        assert exc_info.value.status_code == 403
        assert state.sales_transactions == []


class RecordingSession:
    def __init__(self):
        self.added = []
        self.committed = False
        self.rolled_back = False

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def add(self, row):
        self.added.append(row)

    def commit(self):
        self.committed = True

    def rollback(self):
        self.rolled_back = True

    def execute(self, *_args, **_kwargs):
        class Result:
            def scalar_one_or_none(self):
                return None

        return Result()


class StoreItemRecordingSession(RecordingSession):
    def __init__(self):
        super().__init__()
        self.store_item = SimpleNamespace(
            id=77,
            machine_code="5260430001",
            sale_status="ready_for_sale",
            sold_at=None,
        )

    def execute(self, *_args, **_kwargs):
        class Result:
            def __init__(self, value):
                self.value = value

            def scalar_one_or_none(self):
                return self.value

        return Result(self.store_item)


def test_legacy_stock_sale_dual_write_builds_sales_items_payments_and_audit_rows():
    from app.db.pos_sales import write_sale_transaction_to_database

    session = StoreItemRecordingSession()
    transaction = {
        "order_no": "POS-LEGACY-001",
        "store_code": "UTAWALA",
        "cashier_name": "cashier_1",
        "sold_at": "2026-05-02T09:00:00+03:00",
        "sale_status": "completed",
        "total_qty": 1,
        "total_amount": 150,
        "payments": [{"method": "cash", "amount": 150, "reference": ""}],
        "items": [
            {
                "source_type": "LEGACY_STOCK",
                "legacy_category": "Tops",
                "legacy_subcategory": "lady tops",
                "legacy_item_label": "old price tag",
                "qty": 1,
                "selling_price": 150,
                "line_total": 150,
            }
        ],
    }

    write_sale_transaction_to_database(transaction, session_factory=lambda: session)

    rows_by_type = {row.__class__.__name__: row for row in session.added}
    assert {"Sale", "SaleItem", "SalePayment", "AuditEvent"}.issubset(rows_by_type)
    assert rows_by_type["Sale"].sale_no == "POS-LEGACY-001"
    assert rows_by_type["SaleItem"].store_item_id is None
    assert rows_by_type["SaleItem"].source_type == "LEGACY_STOCK"
    assert rows_by_type["SaleItem"].legacy_category == "Tops"
    assert rows_by_type["SaleItem"].legacy_subcategory == "lady tops"
    assert rows_by_type["SaleItem"].legacy_item_label == "old price tag"
    assert rows_by_type["SaleItem"].quantity == 1
    assert rows_by_type["SaleItem"].unit_price == 150
    assert rows_by_type["SaleItem"].line_total == 150
    assert rows_by_type["SalePayment"].method == "cash"
    assert rows_by_type["AuditEvent"].action == "POS_SALE_COMPLETED"
    assert rows_by_type["AuditEvent"].after_data["source_type_totals"]["LEGACY_STOCK"] == 150
    assert session.committed is True


def test_store_item_sale_dual_write_preserves_source_chain():
    from app.db.pos_sales import write_sale_transaction_to_database

    session = StoreItemRecordingSession()
    transaction = {
        "order_no": "POS-STORE-001",
        "store_code": "UTAWALA",
        "cashier_name": "cashier_1",
        "sold_at": "2026-05-02T09:30:00+03:00",
        "sale_status": "completed",
        "total_qty": 1,
        "total_amount": 220,
        "payment_total": 220,
        "payments": [{"method": "mpesa", "amount": 220, "reference": "QWE123"}],
        "items": [
            {
                "source_type": "STORE_ITEM",
                "store_item_display_code": "ST-20260430-001-0001",
                "store_item_machine_code": "5260430001",
                "source_sdo": "SDO260430001",
                "source_package": "SDB260430AAB",
                "assigned_employee": "clerk_1",
                "store_rack_code": "A-TS-LT-01",
                "category_summary": "tops / lady tops",
                "selected_price": 220,
                "qty": 1,
                "selling_price": 220,
                "line_total": 220,
            }
        ],
    }

    write_sale_transaction_to_database(transaction, session_factory=lambda: session)

    rows_by_type = {row.__class__.__name__: row for row in session.added}
    sale_item = rows_by_type["SaleItem"]
    assert sale_item.store_item_id == 77
    assert sale_item.source_type == "STORE_ITEM"
    assert sale_item.store_item_display_code == "ST-20260430-001-0001"
    assert sale_item.store_item_machine_code == "5260430001"
    assert sale_item.source_sdo == "SDO260430001"
    assert sale_item.source_package == "SDB260430AAB"
    assert sale_item.assigned_employee == "clerk_1"
    assert sale_item.store_rack_code == "A-TS-LT-01"
    assert sale_item.category_summary == "tops / lady tops"
    assert sale_item.selected_price == 220
    assert session.store_item.sale_status == "sold"
    assert session.store_item.sold_at is not None
    assert rows_by_type["SalePayment"].method == "mpesa"
    assert rows_by_type["AuditEvent"].after_data["source_type_totals"]["STORE_ITEM"] == 220


def test_store_item_runtime_sale_dual_write_failure_returns_local_sale_result(tmp_path, monkeypatch):
    state = _new_state(tmp_path, monkeypatch)
    shift = _open_cashier_shift(state)
    token = _seed_store_item_for_runtime_sale(state)
    monkeypatch.setattr(settings, "storage_mode", "dual_write")
    monkeypatch.setattr(settings, "database_url", "postgresql://fw_erp_app@example.com/fw_erp_staging")

    def fail_dual_write(_transaction):
        raise RuntimeError("database unavailable")

    monkeypatch.setattr("app.core.state.write_sale_transaction_to_database", fail_dual_write)

    sale = state.create_sale_transaction(_store_item_sale_payload(shift["shift_no"], token["barcode_value"]))

    assert sale["sale_no"] == "POS-STORE-RUNTIME-001"
    assert sale["local_persisted"] is True
    assert sale["db_sync_status"] == "failed"
    assert sale["db_sync_pending"] is True
    assert sale["db_sync_error"] == "database unavailable"
    assert sale["items"][0]["source_type"] == "STORE_ITEM"
    assert sale["items"][0]["store_item_display_code"] == "ST-20260430-001-0001"
    assert sale["items"][0]["store_item_machine_code"] == token["barcode_value"]
    assert sale["items"][0]["source_sdo"] == "SDO260430001"
    assert sale["items"][0]["source_package"] == "SDB260430AAB"
    assert sale["items"][0]["assigned_employee"] == "store_clerk_1"
    assert sale["items"][0]["store_rack_code"] == "A-TS-LT-01"
    second = state.create_sale_transaction(_store_item_sale_payload(shift["shift_no"], token["barcode_value"]))
    assert second is sale
    assert len(state.sales_transactions) == 1


def test_dual_write_records_manual_confirmed_mpesa_payment_and_audit_row():
    from app.db.pos_sales import write_sale_transaction_to_database

    session = RecordingSession()
    transaction = {
        "order_no": "POS-MPESA-MANUAL-001",
        "store_code": "UTAWALA",
        "cashier_name": "cashier_1",
        "sold_at": "2026-05-02T10:15:00+03:00",
        "sale_status": "completed",
        "total_qty": 1,
        "total_amount": 150,
        "payment_total": 150,
        "payment_status": "manual_confirmed",
        "payments": [
            {
                "method": "mpesa",
                "amount": 150,
                "reference": "QWE123",
                "customer_phone": "254700000001",
                "payment_status": "manual_confirmed",
                "manual_confirmed": True,
                "confirmed_by": "store_manager_1",
                "confirmed_at_local": "2026-05-02T10:14:00+03:00",
                "confirmation_note": "Safaricom SMS seen on store phone",
            }
        ],
        "items": [
            {
                "source_type": "LEGACY_STOCK",
                "legacy_category": "Tops",
                "legacy_subcategory": "lady tops",
                "qty": 1,
                "selling_price": 150,
                "line_total": 150,
            }
        ],
    }

    write_sale_transaction_to_database(transaction, session_factory=lambda: session)

    payment = next(row for row in session.added if row.__class__.__name__ == "SalePayment")
    assert payment.method == "mpesa"
    assert payment.customer_phone == "254700000001"
    assert payment.payment_status == "manual_confirmed"
    assert payment.manual_confirmed is True
    assert payment.confirmed_by == "store_manager_1"
    assert payment.confirmed_at_local is not None
    assert payment.confirmation_note == "Safaricom SMS seen on store phone"
    manual_audit = [
        row
        for row in session.added
        if row.__class__.__name__ == "AuditEvent"
        and row.action == "MPESA_PAYMENT_MANUALLY_CONFIRMED"
    ]
    assert manual_audit
    assert manual_audit[0].after_data["reference"] == "QWE123"
    assert manual_audit[0].after_data["confirmed_by"] == "store_manager_1"


def test_duplicate_sale_no_returns_existing_runtime_sale_without_second_dual_write(tmp_path, monkeypatch):
    state = _new_state(tmp_path, monkeypatch)
    shift = _open_cashier_shift(state)
    monkeypatch.setattr(settings, "storage_mode", "dual_write")
    monkeypatch.setattr(settings, "database_url", "postgresql://fw_erp_app@example.com/fw_erp_staging")
    written_sale_nos: list[str] = []

    def record_dual_write(transaction):
        written_sale_nos.append(transaction["sale_no"])

    monkeypatch.setattr("app.core.state.write_sale_transaction_to_database", record_dual_write)
    payload = _legacy_sale_payload(shift["shift_no"])

    first = state.create_sale_transaction(payload)
    second = state.create_sale_transaction(payload)

    assert second is first
    assert second["sale_no"] == "POS-LEGACY-001"
    assert [sale["sale_no"] for sale in state.sales_transactions].count("POS-LEGACY-001") == 1
    assert written_sale_nos == ["POS-LEGACY-001"]


def test_offline_mpesa_manual_confirmed_sale_records_responsibility_chain(tmp_path, monkeypatch):
    state = _new_state(tmp_path, monkeypatch)
    _open_cashier_shift(state)
    payload = _legacy_sale_payload("")
    payload.update(
        {
            "client_sale_id": "OFF-MPESA-001",
            "order_no": "POS-MPESA-MANUAL-001",
            "power_mode": "offline",
            "payments": [
                {
                    "method": "mpesa",
                    "amount": 150,
                    "reference": "QWE123",
                    "customer_phone": "254700000001",
                    "mpesa_manual_confirmed": True,
                    "confirmed_by": "store_manager_1",
                    "confirmed_at_local": "2026-05-02T10:14:00+03:00",
                    "confirmation_note": "Safaricom SMS seen on store phone",
                }
            ],
        }
    )

    sale = state.create_sale_transaction(payload)

    payment = sale["payments"][0]
    assert sale["payment_status"] == "manual_confirmed"
    assert payment["payment_status"] == "manual_confirmed"
    assert payment["manual_confirmed"] is True
    assert payment["customer_phone"] == "254700000001"
    assert payment["confirmed_by"] == "store_manager_1"
    assert payment["confirmed_at_local"] == "2026-05-02T10:14:00+03:00"
    assert payment["confirmation_note"] == "Safaricom SMS seen on store phone"
    assert any(
        row.get("event_type") == "MPESA_PAYMENT_MANUALLY_CONFIRMED"
        and row.get("entity_id") == "POS-MPESA-MANUAL-001"
        and row.get("details", {}).get("confirmed_by") == "store_manager_1"
        and row.get("details", {}).get("reference") == "QWE123"
        for row in state.audit_events
    )


def test_offline_mpesa_pending_and_mixed_statuses_are_explicit(tmp_path, monkeypatch):
    state = _new_state(tmp_path, monkeypatch)
    _open_cashier_shift(state)
    pending_payload = _legacy_sale_payload("")
    pending_payload.update(
        {
            "client_sale_id": "OFF-MPESA-002",
            "order_no": "POS-MPESA-PENDING-001",
            "power_mode": "offline",
            "payments": [
                {
                    "method": "mpesa",
                    "amount": 150,
                    "reference": "QWE124",
                    "customer_phone": "254700000002",
                    "mpesa_manual_confirmed": False,
                }
            ],
        }
    )

    pending_sale = state.create_sale_transaction(pending_payload)

    assert pending_sale["payment_status"] == "pending_verification"
    assert pending_sale["payments"][0]["payment_status"] == "pending_verification"
    assert pending_sale["payments"][0]["manual_confirmed"] is False

    mixed_payload = _legacy_sale_payload("")
    mixed_payload.update(
        {
            "client_sale_id": "OFF-MPESA-003",
            "order_no": "POS-MPESA-MIXED-001",
            "power_mode": "offline",
            "payments": [
                {"method": "cash", "amount": 50},
                {
                    "method": "mpesa",
                    "amount": 100,
                    "reference": "QWE125",
                    "customer_phone": "254700000003",
                    "mpesa_manual_confirmed": True,
                    "confirmed_by": "cashier_1",
                    "confirmed_at_local": "2026-05-02T10:22:00+03:00",
                },
            ],
        }
    )

    mixed_sale = state.create_sale_transaction(mixed_payload)

    assert mixed_sale["payment_status"] == "mixed_manual_confirmed"
    assert [payment["payment_status"] for payment in mixed_sale["payments"]] == ["collected", "manual_confirmed"]


def test_offline_mpesa_requires_reference_for_manual_or_pending_status(tmp_path, monkeypatch):
    state = _new_state(tmp_path, monkeypatch)
    _open_cashier_shift(state)
    payload = _legacy_sale_payload("")
    payload.update(
        {
            "client_sale_id": "OFF-MPESA-004",
            "order_no": "POS-MPESA-NOREF-001",
            "power_mode": "offline",
            "payments": [
                {
                    "method": "mpesa",
                    "amount": 150,
                    "reference": "",
                    "mpesa_manual_confirmed": True,
                }
            ],
        }
    )

    with pytest.raises(HTTPException) as exc_info:
        state.create_sale_transaction(payload)

    assert exc_info.value.status_code == 400
    assert "M-Pesa reference" in exc_info.value.detail
    assert state.sales_transactions == []


def test_mixed_payment_amount_mismatch_is_rejected_before_sale_is_persisted(tmp_path, monkeypatch):
    state = _new_state(tmp_path, monkeypatch)
    shift = _open_cashier_shift(state)
    payload = _legacy_sale_payload(shift["shift_no"])
    payload["payments"] = [
        {"method": "cash", "amount": 50},
        {"method": "mpesa", "amount": 40, "reference": "MPESA1"},
    ]

    with pytest.raises(HTTPException) as exc_info:
        state.create_sale_transaction(payload)

    assert exc_info.value.status_code == 400
    assert "付款金额必须等于销售总额" in exc_info.value.detail
    assert state.sales_transactions == []


def test_store_manager_cannot_create_pos_sale_by_default(tmp_path, monkeypatch):
    state = _new_state(tmp_path, monkeypatch)
    shift = _open_cashier_shift(state)
    payload = _legacy_sale_payload(shift["shift_no"])
    payload["cashier_name"] = "store_manager_1"

    with pytest.raises(HTTPException) as exc_info:
        state.create_sale_transaction(payload)

    assert exc_info.value.status_code == 403
    assert state.sales_transactions == []


def test_dual_write_failure_keeps_runtime_sale_and_returns_completed_sale_with_warning(tmp_path, monkeypatch):
    state = _new_state(tmp_path, monkeypatch)
    shift = _open_cashier_shift(state)
    monkeypatch.setattr(settings, "storage_mode", "dual_write")
    monkeypatch.setattr(settings, "database_url", "postgresql://fw_erp_app@example.com/fw_erp_staging")

    def fail_dual_write(_transaction):
        raise RuntimeError("database unavailable")

    monkeypatch.setattr("app.core.state.write_sale_transaction_to_database", fail_dual_write)

    sale = state.create_sale_transaction(_legacy_sale_payload(shift["shift_no"]))

    assert sale["order_no"] == "POS-LEGACY-001"
    assert sale["db_sync_status"] == "failed"
    assert sale["db_sync_error"] == "database unavailable"
    assert sale["local_persisted"] is True
    assert sale["db_sync_pending"] is True
    assert sale["db_sync_failed_at"]
    assert sale["sale_no"] == "POS-LEGACY-001"
    assert state.sales_transactions[0]["order_no"] == "POS-LEGACY-001"
    assert state.sales_transactions[0]["items"][0]["source_type"] == "LEGACY_STOCK"
    assert state.sales_transactions[0]["db_sync_status"] == "failed"
    assert state.sales_transactions[0]["db_sync_pending"] is True
    second = state.create_sale_transaction(_legacy_sale_payload(shift["shift_no"]))
    assert second is sale
    assert len(state.sales_transactions) == 1
    assert any(
        row.get("event_type") == "sale.db_sync_failed"
        and row.get("entity_id") == "POS-LEGACY-001"
        and row.get("details", {}).get("db_sync_status") == "failed"
        for row in state.audit_events
    )
