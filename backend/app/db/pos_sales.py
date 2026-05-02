from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time
from typing import Any, Callable, Optional
from zoneinfo import ZoneInfo

from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import AuditEvent, Sale, SaleItem, SalePayment, StoreItem
from app.db.session import create_session_factory


DB_SYNC_FAILURE_MESSAGE = "销售已完成，但数据库同步失败，请联系管理员"
MPESA_PAYMENT_MANUAL_CONFIRMATION_ACTION = "MPESA_PAYMENT_MANUALLY_CONFIRMED"
NAIROBI_TZ = ZoneInfo("Africa/Nairobi")


def _money(value: Any) -> float:
    try:
        return round(float(value or 0), 2)
    except (TypeError, ValueError):
        return 0.0


def _quantity(value: Any) -> int:
    try:
        return max(1, int(value or 1))
    except (TypeError, ValueError):
        return 1


def _item_count(value: Any) -> int:
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0


def _clean(value: Any) -> str:
    return str(value or "").strip()


def _truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return _clean(value).lower() in {"1", "true", "yes", "y", "on", "checked"}


def _parse_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    raw = _clean(value)
    if raw:
        try:
            return datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            pass
    return datetime.now(tz=NAIROBI_TZ)


def _parse_optional_datetime(value: Any) -> Optional[datetime]:
    raw = _clean(value)
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None


def _day_bounds(sold_on: Optional[date | str] = None) -> tuple[datetime, datetime]:
    if isinstance(sold_on, date):
        day = sold_on
    elif _clean(sold_on):
        day = date.fromisoformat(_clean(sold_on))
    else:
        day = datetime.now(tz=NAIROBI_TZ).date()
    start = datetime.combine(day, time.min, tzinfo=NAIROBI_TZ)
    end = datetime.combine(day, time.max, tzinfo=NAIROBI_TZ)
    return start, end


def _source_type(item: dict[str, Any]) -> str:
    raw = _clean(item.get("source_type")).upper()
    return raw or "STORE_ITEM"


def _line_unit_price(item: dict[str, Any]) -> float:
    return _money(item.get("unit_price") or item.get("selling_price") or item.get("selected_price") or item.get("price"))


def _line_total(item: dict[str, Any]) -> float:
    explicit = item.get("line_total")
    if explicit is not None:
        return _money(explicit)
    return round(_quantity(item.get("qty") or item.get("quantity")) * _line_unit_price(item), 2)


def should_write_sale_to_database(
    storage_mode: Optional[str] = None,
    database_url: Optional[str] = None,
) -> bool:
    mode = _clean(storage_mode if storage_mode is not None else settings.storage_mode).lower()
    url = _clean(database_url if database_url is not None else settings.database_url)
    return mode in {"dual_write", "db"} and bool(url)


def _payment_method(payments: list[dict[str, Any]]) -> str:
    methods = [_clean(payment.get("method")).lower() for payment in payments if _clean(payment.get("method"))]
    unique_methods = list(dict.fromkeys(methods))
    if not unique_methods:
        return "unknown"
    return unique_methods[0] if len(unique_methods) == 1 else "mixed"


def _payment_status(payment: dict[str, Any]) -> str:
    method = _clean(payment.get("method")).lower()
    if method == "mpesa" and _payment_manual_confirmed(payment):
        return "manual_confirmed"
    raw_status = _clean(payment.get("payment_status")).lower()
    if raw_status:
        return raw_status
    return "collected" if method == "cash" else "collected"


def _payment_manual_confirmed(payment: dict[str, Any]) -> bool:
    return _truthy(payment.get("manual_confirmed")) or _truthy(payment.get("mpesa_manual_confirmed"))


def _source_type_totals(transaction: dict[str, Any]) -> dict[str, float]:
    totals: dict[str, float] = defaultdict(float)
    for item in transaction.get("items", []) or []:
        totals[_source_type(item)] += _line_total(item)
    return {source_type: round(amount, 2) for source_type, amount in totals.items()}


def _source_type_qty(transaction: dict[str, Any]) -> dict[str, int]:
    totals: dict[str, int] = defaultdict(int)
    for item in transaction.get("items", []) or []:
        totals[_source_type(item)] += _quantity(item.get("qty") or item.get("quantity"))
    return dict(totals)


def _resolve_store_item_row(session: Session, machine_code: str) -> Optional[StoreItem]:
    normalized = _clean(machine_code).upper()
    if not normalized:
        return None
    statement: Select[tuple[StoreItem]] = select(StoreItem).where(StoreItem.machine_code == normalized)
    return session.execute(statement).scalar_one_or_none()


def _build_sale_item_row(session: Session, sale_no: str, item: dict[str, Any], *, sold_at: datetime) -> SaleItem:
    source_type = _source_type(item)
    quantity = _quantity(item.get("qty") or item.get("quantity"))
    unit_price = _line_unit_price(item)
    line_total = _line_total(item)
    machine_code = _clean(item.get("store_item_machine_code") or item.get("barcode")).upper()
    display_code = _clean(item.get("store_item_display_code") or item.get("identity_id") or machine_code).upper()
    store_item_row = _resolve_store_item_row(session, machine_code) if source_type == "STORE_ITEM" else None
    if store_item_row is not None:
        store_item_row.sale_status = "sold"
        store_item_row.sold_at = sold_at

    return SaleItem(
        sale_no=sale_no,
        store_item_id=getattr(store_item_row, "id", None),
        store_item_display_code=display_code,
        store_item_machine_code=machine_code,
        price=unit_price,
        quantity=quantity,
        unit_price=unit_price,
        line_total=line_total,
        selected_price=_money(item.get("selected_price") or item.get("expected_price") or unit_price),
        source_sdo=_clean(item.get("source_sdo")),
        source_package=_clean(item.get("source_package")),
        source_type=source_type,
        assigned_employee=_clean(item.get("assigned_employee")),
        store_rack_code=_clean(item.get("store_rack_code")),
        category_summary=_clean(
            item.get("category_summary")
            or item.get("legacy_category")
            or item.get("category")
            or item.get("product_name")
        ),
        legacy_category=(_clean(item.get("legacy_category") or item.get("category")) or None),
        legacy_subcategory=(_clean(item.get("legacy_subcategory") or item.get("subcategory")) or None),
        legacy_item_label=(_clean(item.get("legacy_item_label")) or None),
    )


def write_sale_transaction_to_database(
    transaction: dict[str, Any],
    *,
    database_url: Optional[str] = None,
    session_factory: Optional[Callable[[], Any]] = None,
    environment: Optional[str] = None,
) -> dict[str, Any]:
    factory = session_factory or create_session_factory(database_url or settings.database_url)
    if factory is None:
        return {"enabled": False, "status": "not_configured"}

    sale_no = _clean(transaction.get("order_no"))
    payments = list(transaction.get("payments", []) or [])
    with factory() as session:
        try:
            sold_at = _parse_datetime(transaction.get("sold_at") or transaction.get("created_at"))
            session.add(
                Sale(
                    sale_no=sale_no,
                    store_code=_clean(transaction.get("store_code")).upper(),
                    cashier=_clean(transaction.get("cashier_name")),
                    payment_method=_payment_method(payments),
                    total_amount=_money(transaction.get("total_amount")),
                    item_count=_item_count(transaction.get("total_qty")),
                    sold_at=sold_at,
                    status=_clean(transaction.get("sale_status")) or "completed",
                )
            )
            for item in transaction.get("items", []) or []:
                session.add(_build_sale_item_row(session, sale_no, item, sold_at=sold_at))
            for payment in payments:
                method = _clean(payment.get("method")).lower() or "unknown"
                manual_confirmed = method == "mpesa" and _payment_manual_confirmed(payment)
                session.add(
                    SalePayment(
                        sale_no=sale_no,
                        method=method,
                        amount=_money(payment.get("amount")),
                        reference=(_clean(payment.get("reference")).upper() or None),
                        customer_phone=(_clean(payment.get("customer_phone") or payment.get("phone_number")) or None),
                        payment_status=_payment_status(payment),
                        manual_confirmed=manual_confirmed,
                        confirmed_by=(_clean(payment.get("confirmed_by")) or None),
                        confirmed_at_local=_parse_optional_datetime(payment.get("confirmed_at_local")),
                        confirmation_note=(_clean(payment.get("confirmation_note")) or None),
                    )
                )
            session.add(
                AuditEvent(
                    actor=_clean(transaction.get("cashier_name")),
                    action="POS_SALE_COMPLETED",
                    entity_type="sale",
                    entity_id=sale_no,
                    before_data=None,
                    after_data={
                        "sale_no": sale_no,
                        "store_code": _clean(transaction.get("store_code")).upper(),
                        "cashier": _clean(transaction.get("cashier_name")),
                        "total_amount": _money(transaction.get("total_amount")),
                        "item_count": _item_count(transaction.get("total_qty")),
                        "total_qty": _item_count(transaction.get("total_qty")),
                        "payment_total": _money(transaction.get("payment_total")),
                        "payment_methods": [_clean(payment.get("method")).lower() for payment in payments],
                        "source_type_totals": _source_type_totals(transaction),
                        "source_type_qty": _source_type_qty(transaction),
                        "created_at": sold_at.isoformat(),
                    },
                    created_at=sold_at,
                    environment=_clean(environment or settings.environment) or "staging",
                )
            )
            for payment in payments:
                method = _clean(payment.get("method")).lower()
                if method != "mpesa" or not _payment_manual_confirmed(payment):
                    continue
                confirmed_by = _clean(payment.get("confirmed_by")) or _clean(transaction.get("cashier_name"))
                confirmed_at_local = _clean(payment.get("confirmed_at_local"))
                session.add(
                    AuditEvent(
                        actor=confirmed_by,
                        action=MPESA_PAYMENT_MANUAL_CONFIRMATION_ACTION,
                        entity_type="sale",
                        entity_id=sale_no,
                        before_data=None,
                        after_data={
                            "cashier": _clean(transaction.get("cashier_name")),
                            "confirmed_by": confirmed_by,
                            "store_code": _clean(transaction.get("store_code")).upper(),
                            "sale_no": sale_no,
                            "reference": _clean(payment.get("reference")).upper(),
                            "amount": _money(payment.get("amount")),
                            "confirmed_at_local": confirmed_at_local,
                        },
                        created_at=_parse_optional_datetime(confirmed_at_local) or sold_at,
                        environment=_clean(environment or settings.environment) or "staging",
                    )
                )
            session.commit()
        except Exception:
            session.rollback()
            raise
    return {"enabled": True, "status": "written", "sale_no": sale_no}


def query_sales_analytics_from_database(
    *,
    database_url: Optional[str] = None,
    store_code: Optional[str] = None,
    sold_on: Optional[date | str] = None,
    session_factory: Optional[Callable[[], Any]] = None,
) -> dict[str, Any]:
    factory = session_factory or create_session_factory(database_url or settings.database_url)
    if factory is None:
        return {"enabled": False, "status": "not_configured", "summary": {}, "sales": []}

    start_at, end_at = _day_bounds(sold_on)
    normalized_store_code = _clean(store_code).upper()
    with factory() as session:
        sale_statement = select(Sale).where(Sale.sold_at >= start_at, Sale.sold_at <= end_at)
        if normalized_store_code:
            sale_statement = sale_statement.where(Sale.store_code == normalized_store_code)
        sale_rows = list(session.execute(sale_statement).scalars().all())
        sale_nos = [row.sale_no for row in sale_rows]
        if sale_nos:
            item_rows = list(session.execute(select(SaleItem).where(SaleItem.sale_no.in_(sale_nos))).scalars().all())
            payment_rows = list(session.execute(select(SalePayment).where(SalePayment.sale_no.in_(sale_nos))).scalars().all())
        else:
            item_rows = []
            payment_rows = []

    items_by_sale: dict[str, list[SaleItem]] = defaultdict(list)
    for row in item_rows:
        items_by_sale[row.sale_no].append(row)
    payments_by_sale: dict[str, list[SalePayment]] = defaultdict(list)
    for row in payment_rows:
        payments_by_sale[row.sale_no].append(row)

    cash_amount = round(sum(_money(row.amount) for row in payment_rows if row.method == "cash"), 2)
    mpesa_amount = round(sum(_money(row.amount) for row in payment_rows if row.method == "mpesa"), 2)
    mpesa_verified_amount = round(
        sum(_money(row.amount) for row in payment_rows if row.method == "mpesa" and row.payment_status == "verified"),
        2,
    )
    mpesa_manual_confirmed_amount = round(
        sum(
            _money(row.amount)
            for row in payment_rows
            if row.method == "mpesa" and (row.payment_status == "manual_confirmed" or row.manual_confirmed)
        ),
        2,
    )
    mpesa_pending_verification_amount = round(
        sum(
            _money(row.amount)
            for row in payment_rows
            if row.method == "mpesa" and row.payment_status == "pending_verification"
        ),
        2,
    )
    mixed_amount = round(sum(_money(row.total_amount) for row in sale_rows if row.payment_method == "mixed"), 2)
    legacy_amount = round(sum(_money(row.line_total or row.price) for row in item_rows if row.source_type == "LEGACY_STOCK"), 2)
    store_item_amount = round(sum(_money(row.line_total or row.price) for row in item_rows if row.source_type == "STORE_ITEM"), 2)
    item_count = sum(int(row.quantity or 1) for row in item_rows)
    category_totals: dict[str, float] = defaultdict(float)
    subcategory_totals: dict[str, float] = defaultdict(float)
    for row in item_rows:
        amount = _money(row.line_total or row.price)
        category = _clean(row.legacy_category or row.category_summary) or "未分类"
        subcategory = _clean(row.legacy_subcategory or row.category_summary) or "未分类"
        category_totals[category] += amount
        subcategory_totals[subcategory] += amount
    sales = [
        {
            "sale_no": row.sale_no,
            "store_code": row.store_code,
            "cashier": row.cashier,
            "sold_at": row.sold_at.isoformat() if row.sold_at else "",
            "total_amount": _money(row.total_amount),
            "item_count": int(row.item_count or 0),
            "payment_methods": [payment.method for payment in payments_by_sale[row.sale_no]],
            "source_types": list(dict.fromkeys(item.source_type for item in items_by_sale[row.sale_no])),
        }
        for row in sale_rows
    ]
    return {
        "enabled": True,
        "status": "ok",
        "summary": {
            "today_sales_amount": round(sum(_money(row.total_amount) for row in sale_rows), 2),
            "today_qty": item_count,
            "today_order_count": len(sale_rows),
            "cash_amount": cash_amount,
            "mpesa_amount": mpesa_amount,
            "mpesa_verified_amount": mpesa_verified_amount,
            "mpesa_manual_confirmed_amount": mpesa_manual_confirmed_amount,
            "mpesa_pending_verification_amount": mpesa_pending_verification_amount,
            "manual_confirmed_mpesa": mpesa_manual_confirmed_amount,
            "mixed_amount": mixed_amount,
            "legacy_stock_sales_amount": legacy_amount,
            "store_item_sales_amount": store_item_amount,
            "category_totals": [
                {"category": category, "sales_amount": round(amount, 2)}
                for category, amount in sorted(category_totals.items())
            ],
            "subcategory_totals": [
                {"subcategory": subcategory, "sales_amount": round(amount, 2)}
                for subcategory, amount in sorted(subcategory_totals.items())
            ],
        },
        "sales": sales,
    }
