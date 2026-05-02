import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import build_settings


def test_default_settings_keep_local_runtime_json_without_database_url():
    settings = build_settings(env={})

    assert settings.environment == "local"
    assert settings.storage_mode == "runtime_json"
    assert settings.database_url is None


def test_settings_read_storage_mode_environment_and_database_url():
    settings = build_settings(
        env={
            "RETAIL_OPS_ENVIRONMENT": "staging",
            "RETAIL_OPS_STORAGE_MODE": "dual_write",
            "DATABASE_URL": "postgresql://fw_erp_app@example.com/fw_erp_staging",
        }
    )

    assert settings.environment == "staging"
    assert settings.storage_mode == "dual_write"
    assert settings.database_url == "postgresql://fw_erp_app@example.com/fw_erp_staging"


def test_phase_one_schema_metadata_contains_required_tables():
    from app.db.models import PHASE_ONE_TABLE_NAMES
    from app.db.base import Base

    expected_tables = {
        "roles",
        "stores",
        "warehouses",
        "users",
        "transfer_orders",
        "sdo_packages",
        "delivery_batches",
        "delivery_batch_orders",
        "store_receipts",
        "store_receipt_packages",
        "clerk_assignments",
        "store_items",
        "store_item_print_batches",
        "store_item_print_batch_items",
        "sales",
        "sale_items",
        "sale_payments",
        "audit_events",
    }

    assert set(PHASE_ONE_TABLE_NAMES) == expected_tables
    assert expected_tables.issubset(set(Base.metadata.tables))
    assert Base.metadata.tables["store_items"].c.machine_code.unique is True
    assert Base.metadata.tables["sales"].c.sale_no.primary_key is True
    assert Base.metadata.tables["sale_items"].c.store_item_id.nullable is True
    for column_name in [
        "quantity",
        "unit_price",
        "line_total",
        "selected_price",
        "legacy_category",
        "legacy_subcategory",
        "legacy_item_label",
    ]:
        assert column_name in Base.metadata.tables["sale_items"].c
    for column_name in [
        "customer_phone",
        "payment_status",
        "manual_confirmed",
        "confirmed_by",
        "confirmed_at_local",
        "confirmation_note",
    ]:
        assert column_name in Base.metadata.tables["sale_payments"].c
    assert Base.metadata.tables["sdo_packages"].c.raw_payload.type.__class__.__name__ == "JSONB"


def test_unknown_item_counts_are_nullable_without_zero_defaults():
    from app.db.base import Base
    from app.db import models  # noqa: F401

    unknown_count_columns = [
        Base.metadata.tables["transfer_orders"].c.total_item_count,
        Base.metadata.tables["sdo_packages"].c.item_count,
        Base.metadata.tables["delivery_batch_orders"].c.item_count,
    ]

    for column in unknown_count_columns:
        assert column.nullable is True
        assert column.server_default is None

    assert Base.metadata.tables["store_receipt_packages"].c.accepted_qty.nullable is False
    assert Base.metadata.tables["store_receipt_packages"].c.accepted_qty.server_default is not None
    assert Base.metadata.tables["store_item_print_batches"].c.requested_qty.nullable is False
    assert Base.metadata.tables["store_item_print_batches"].c.requested_qty.server_default is not None
    assert Base.metadata.tables["sales"].c.item_count.nullable is False
    assert Base.metadata.tables["sales"].c.item_count.server_default is not None


def test_database_check_without_url_does_not_require_database():
    from app.db.session import check_database_connection

    result = check_database_connection(database_url="")

    assert result["enabled"] is False
    assert result["ok"] is False
    assert result["status"] == "not_configured"


def test_database_check_executes_simple_connection_when_url_is_available():
    from app.db.session import check_database_connection

    result = check_database_connection(database_url="sqlite+pysqlite:///:memory:")

    assert result["enabled"] is True
    assert result["ok"] is True
    assert result["status"] == "connected"


def test_database_url_normalization_prefers_psycopg_driver_for_postgres():
    from app.db.session import normalize_database_url

    assert normalize_database_url("postgresql://user@host/db").startswith("postgresql+psycopg://")
    assert normalize_database_url("postgresql+psycopg://user:pass@host/db").startswith("postgresql+psycopg://")
