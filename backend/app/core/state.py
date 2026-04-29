from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from itertools import count
import math
import random
import re
from typing import Any, Optional
from zoneinfo import ZoneInfo

from fastapi import HTTPException

from app.core.config import settings
from app.core.persistence import load_json, save_json
from app.core.security import generate_session_token, hash_password, verify_password
from app.core.seed_data import ACTIVE_STORES, DEFAULT_CARGO_TYPES, DEFAULT_USERS, LABEL_TEMPLATES, STORE_RACK_TEMPLATE

NAIROBI_TZ = ZoneInfo("Africa/Nairobi")
LOCKED_BALE_TEMPLATE_CODE = "warehouse_in"
SALES_FX_RATES_TO_KES = {
    "KES": 1.0,
    "USD": 129.1531,
    "CNY": 17.8097,
}
DEFAULT_APPAREL_CATEGORY_PRESETS = [
    {"category_main": "tops", "category_sub": "lady tops", "label": "女装上衣", "rack_prefix": "A-TS-LT", "cost_p": 185, "cost_s": 138},
    {"category_main": "tops", "category_sub": "unisex T-shirt", "label": "中性T恤", "rack_prefix": "A-TS-UT", "cost_p": 165, "cost_s": 126},
    {"category_main": "tops", "category_sub": "men shirt", "label": "男衬衫", "rack_prefix": "A-TS-MS", "cost_p": 190, "cost_s": 145},
    {"category_main": "dress", "category_sub": "short dress", "label": "短裙", "rack_prefix": "A-DR-SD", "cost_p": 220, "cost_s": 165},
    {"category_main": "dress", "category_sub": "long dress", "label": "长裙", "rack_prefix": "A-DR-LD", "cost_p": 245, "cost_s": 188},
    {"category_main": "dress", "category_sub": "2 pieces", "label": "套装", "rack_prefix": "A-DR-2P", "cost_p": 280, "cost_s": 215},
    {"category_main": "pants", "category_sub": "sweat pant", "label": "卫裤", "rack_prefix": "A-PT-SW", "cost_p": 195, "cost_s": 148},
    {"category_main": "pants", "category_sub": "cargo pant", "label": "工装裤", "rack_prefix": "A-PT-CR", "cost_p": 205, "cost_s": 156},
    {"category_main": "pants", "category_sub": "jeans pant", "label": "牛仔裤", "rack_prefix": "A-PT-JE", "cost_p": 210, "cost_s": 158},
    {"category_main": "pants", "category_sub": "others pants", "label": "其他裤装", "rack_prefix": "A-PT-OT", "cost_p": 180, "cost_s": 138},
    {"category_main": "jacket", "category_sub": "jacket", "label": "外套", "rack_prefix": "A-JK-JK", "cost_p": 260, "cost_s": 198},
    {"category_main": "kids", "category_sub": "baby kids", "label": "婴童", "rack_prefix": "A-KD-BB", "cost_p": 145, "cost_s": 108},
    {"category_main": "kids", "category_sub": "big kids", "label": "大童", "rack_prefix": "A-KD-BK", "cost_p": 165, "cost_s": 124},
    {"category_main": "shoes", "category_sub": "sport shoes", "label": "运动鞋", "rack_prefix": "A-SH-SP", "cost_p": 320, "cost_s": 248},
    {"category_main": "shoes", "category_sub": "office shoes", "label": "办公鞋", "rack_prefix": "A-SH-OF", "cost_p": 300, "cost_s": 232},
    {"category_main": "shoes", "category_sub": "lady shoes", "label": "女鞋", "rack_prefix": "A-SH-LD", "cost_p": 285, "cost_s": 218},
    {"category_main": "shoes", "category_sub": "kids shoes", "label": "童鞋", "rack_prefix": "A-SH-KD", "cost_p": 210, "cost_s": 158},
    {"category_main": "bags", "category_sub": "bags", "label": "包袋", "rack_prefix": "A-BG-BG", "cost_p": 240, "cost_s": 182},
    {"category_main": "cosmetics", "category_sub": "cosmetics", "label": "化妆品", "rack_prefix": "A-CS-CS", "cost_p": 135, "cost_s": 98},
    {"category_main": "others", "category_sub": "others", "label": "其他", "rack_prefix": "A-OT-OT", "cost_p": 150, "cost_s": 112},
]


def _build_default_apparel_default_costs() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for preset in DEFAULT_APPAREL_CATEGORY_PRESETS:
        rows.extend(
            [
                {
                    "category_main": preset["category_main"],
                    "category_sub": preset["category_sub"],
                    "grade": "P",
                    "default_cost_kes": preset["cost_p"],
                    "note": f"{preset['label']} P 档默认成本",
                },
                {
                    "category_main": preset["category_main"],
                    "category_sub": preset["category_sub"],
                    "grade": "S",
                    "default_cost_kes": preset["cost_s"],
                    "note": f"{preset['label']} S 档默认成本",
                },
            ]
        )
    return rows


def _build_default_apparel_sorting_racks() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for preset in DEFAULT_APPAREL_CATEGORY_PRESETS:
        rows.extend(
            [
                {
                    "category_main": preset["category_main"],
                    "category_sub": preset["category_sub"],
                    "grade": "P",
                    "default_cost_kes": preset["cost_p"],
                    "rack_code": f"{preset['rack_prefix']}-P-01",
                    "note": f"{preset['label']} P 档默认分拣库位",
                },
                {
                    "category_main": preset["category_main"],
                    "category_sub": preset["category_sub"],
                    "grade": "S",
                    "default_cost_kes": preset["cost_s"],
                    "rack_code": f"{preset['rack_prefix']}-S-01",
                    "note": f"{preset['label']} S 档默认分拣库位",
                },
            ]
        )
    return rows


DEFAULT_APPAREL_DEFAULT_COSTS = _build_default_apparel_default_costs()
DEFAULT_APPAREL_SORTING_RACKS = _build_default_apparel_sorting_racks()


def _normalize_apparel_text_key(value: Any) -> str:
    return str(value or "").strip().lower()


def _derive_apparel_sorting_rack_prefix(category_main: str, category_sub: str) -> str:
    normalized_main = _normalize_apparel_text_key(category_main)
    normalized_sub = _normalize_apparel_text_key(category_sub)
    for preset in DEFAULT_APPAREL_CATEGORY_PRESETS:
        if (
            _normalize_apparel_text_key(preset.get("category_main")) == normalized_main
            and _normalize_apparel_text_key(preset.get("category_sub")) == normalized_sub
        ):
            return str(preset.get("rack_prefix") or "").strip().upper()
    main_token = "".join(ch for ch in str(category_main or "").upper() if ch.isalnum())[:2] or "OT"
    sub_parts = [part for part in re.split(r"[^A-Za-z0-9]+", str(category_sub or "").upper()) if part]
    if not sub_parts:
        sub_token = "OT"
    elif len(sub_parts) == 1:
        sub_token = sub_parts[0][:2]
    else:
        sub_token = "".join(part[:1] for part in sub_parts[:2])[:2]
    return f"A-{main_token}-{sub_token}"


def _convert_amount_to_kes(amount: Any, currency: Any) -> float:
    normalized_currency = str(currency or "").strip().upper()
    rate = SALES_FX_RATES_TO_KES.get(normalized_currency)
    numeric_amount = round(float(amount or 0), 2)
    if not rate or numeric_amount <= 0:
        return 0.0
    return round(numeric_amount * rate, 2)


def _derive_apparel_sorting_rack_code(category_main: str, category_sub: str, grade: str) -> str:
    prefix = _derive_apparel_sorting_rack_prefix(category_main, category_sub)
    normalized_grade = str(grade or "").strip().upper() or "P"
    return f"{prefix}-{normalized_grade}-01"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_unload_date_value(value: str) -> str:
    normalized = str(value or "").strip()
    if not normalized:
        return ""
    try:
        parsed = datetime.fromisoformat(normalized.replace("T", " "))
    except ValueError:
        return normalized
    has_time = bool(re.search(r"[ T]\d{2}:\d{2}", normalized))
    return parsed.strftime("%Y-%m-%d %H:%M") if has_time else parsed.date().isoformat()


def _shipment_unload_suffix(unload_date: str) -> str:
    normalized = str(unload_date or "").strip()
    if not normalized:
        return ""
    match = re.match(r"(\d{4}-\d{2}-\d{2})", normalized)
    if match:
        return match.group(1)
    return normalized


class InMemoryState:
    def __init__(self) -> None:
        self._state_file = settings.state_file
        self._bootstrapping_from_disk = True
        self._reset_runtime()
        try:
            self._load_from_disk()
        finally:
            self._bootstrapping_from_disk = False

    def _reset_runtime(self) -> None:
        self.products: dict[int, dict[str, Any]] = {}
        self.product_by_barcode: dict[str, int] = {}
        self.suppliers: dict[str, dict[str, Any]] = {}
        self.cargo_types: dict[str, dict[str, Any]] = {}
        self.china_source_records: dict[str, dict[str, Any]] = {}
        self.apparel_piece_weights: dict[str, dict[str, Any]] = {}
        self.apparel_default_costs: dict[str, dict[str, Any]] = {}
        self.apparel_sorting_racks: dict[str, dict[str, Any]] = {}
        self.inbound_shipments: dict[str, dict[str, Any]] = {}
        self.parcel_batches: dict[str, dict[str, Any]] = {}
        self.bale_barcodes: dict[str, dict[str, Any]] = {}
        self.sorting_tasks: dict[str, dict[str, Any]] = {}
        self.item_barcode_tokens: dict[str, dict[str, Any]] = {}
        self.store_prep_bale_tasks: dict[str, dict[str, Any]] = {}
        self.store_prep_bales: dict[str, dict[str, Any]] = {}
        self.store_dispatch_bales: dict[str, dict[str, Any]] = {}
        self.store_delivery_execution_orders: dict[str, dict[str, Any]] = {}
        self.sorting_stock: dict[str, dict[str, Any]] = {}
        self.goods_receipts: list[dict[str, Any]] = []
        self.print_jobs: list[dict[str, Any]] = []
        self.print_station_jobs: list[dict[str, Any]] = []
        self.warehouse_stock: dict[str, dict[str, Any]] = defaultdict(dict)
        self.warehouse_lots: dict[str, list[dict[str, Any]]] = defaultdict(list)
        self.store_stock: dict[str, dict[str, Any]] = defaultdict(dict)
        self.store_lots: dict[str, list[dict[str, Any]]] = defaultdict(list)
        self.price_rules: dict[str, dict[str, Any]] = {}
        self.transfer_orders: dict[str, dict[str, Any]] = {}
        self.picking_waves: dict[str, dict[str, Any]] = {}
        self.transfer_recommendations: dict[str, dict[str, Any]] = {}
        self.transfer_receiving_sessions: dict[str, dict[str, Any]] = {}
        self.store_token_receiving_sessions: dict[str, dict[str, Any]] = {}
        self.return_orders: dict[str, dict[str, Any]] = {}
        self.sales_transactions: list[dict[str, Any]] = []
        self.bale_sales_pricing_profiles: dict[str, dict[str, Any]] = {}
        self.bale_sales_orders: dict[str, dict[str, Any]] = {}
        self.sale_void_requests: dict[str, dict[str, Any]] = {}
        self.sale_refund_requests: dict[str, dict[str, Any]] = {}
        self.store_rack_locations: dict[str, dict[str, Any]] = {}
        self.inventory_adjustments: list[dict[str, Any]] = []
        self.inventory_movements: list[dict[str, Any]] = []
        self.audit_events: list[dict[str, Any]] = []
        self.cashier_shifts: dict[str, dict[str, Any]] = {}
        self.cashier_handover_logs: dict[str, dict[str, Any]] = {}
        self.payment_anomalies: dict[str, dict[str, Any]] = {}
        self.mpesa_collections: list[dict[str, Any]] = []
        self.offline_sync_batches: dict[str, dict[str, Any]] = {}
        self.offline_sale_registry: dict[str, dict[str, Any]] = {}
        self.label_templates: dict[str, dict[str, Any]] = {}
        self.users: dict[int, dict[str, Any]] = {}
        self.auth_sessions: dict[str, dict[str, Any]] = {}
        self.stores: dict[str, dict[str, Any]] = {
            store["code"]: {**store, "created_at": now_iso()} for store in ACTIVE_STORES
        }
        self._set_counters()
        self._ensure_seed_label_templates()
        self._ensure_seed_apparel_default_costs()
        self._ensure_seed_apparel_sorting_racks()
        self._ensure_seed_suppliers()
        self._ensure_seed_cargo_types()
        self._ensure_seed_users()
        self._ensure_seed_store_racks()

    def _set_counters(self) -> None:
        self._product_ids = count(max(self.products.keys(), default=0) + 1)
        self._supplier_ids = count(max((row["id"] for row in self.suppliers.values()), default=0) + 1)
        self._cargo_type_ids = count(max((row["id"] for row in self.cargo_types.values()), default=0) + 1)
        self._inbound_shipment_ids = count(max((row["id"] for row in self.inbound_shipments.values()), default=0) + 1)
        self._parcel_batch_ids = count(max((row["id"] for row in self.parcel_batches.values()), default=0) + 1)
        self._bale_barcode_ids = count(max((row["id"] for row in self.bale_barcodes.values()), default=0) + 1)
        self._sorting_task_ids = count(max((row["id"] for row in self.sorting_tasks.values()), default=0) + 1)
        self._store_prep_bale_task_ids = count(max((row["id"] for row in self.store_prep_bale_tasks.values()), default=0) + 1)
        self._store_prep_bale_ids = count(len(self.store_prep_bales) + 1)
        self._lot_ids = count(
            max(
                (
                    lot["id"]
                    for group in list(self.warehouse_lots.values()) + list(self.store_lots.values())
                    for lot in group
                ),
                default=0,
            )
            + 1
        )
        self._receipt_ids = count(max((row["id"] for row in self.goods_receipts), default=0) + 1)
        self._print_job_ids = count(max((row["id"] for row in self.print_jobs), default=0) + 1)
        self._print_station_job_ids = count(max((row["id"] for row in self.print_station_jobs), default=0) + 1)
        self._transfer_ids = count(len(self.transfer_orders) + 1)
        self._picking_wave_ids = count(len(self.picking_waves) + 1)
        self._store_delivery_execution_order_ids = count(len(self.store_delivery_execution_orders) + 1)
        self._transfer_recommendation_ids = count(len(self.transfer_recommendations) + 1)
        self._receiving_session_ids = count(len(self.transfer_receiving_sessions) + 1)
        self._store_token_receiving_session_ids = count(len(self.store_token_receiving_sessions) + 1)
        self._receiving_batch_ids = count(
            max(
                (
                    batch["batch_id"]
                    for session in self.transfer_receiving_sessions.values()
                    for batch in session.get("batches", [])
                ),
                default=0,
            )
            + 1
        )
        self._store_token_receiving_batch_ids = count(
            max(
                (
                    batch["batch_id"]
                    for session in self.store_token_receiving_sessions.values()
                    for batch in session.get("batches", [])
                ),
                default=0,
            )
            + 1
        )
        self._return_ids = count(len(self.return_orders) + 1)
        self._price_rule_ids = count(max((row["id"] for row in self.price_rules.values()), default=0) + 1)
        self._sale_ids = count(max((row["id"] for row in self.sales_transactions), default=0) + 1)
        self._bale_sales_order_ids = count(len(self.bale_sales_orders) + 1)
        self._sale_void_request_ids = count(len(self.sale_void_requests) + 1)
        self._sale_refund_request_ids = count(len(self.sale_refund_requests) + 1)
        self._adjustment_ids = count(max((row["id"] for row in self.inventory_adjustments), default=0) + 1)
        self._movement_ids = count(max((row["id"] for row in self.inventory_movements), default=0) + 1)
        self._audit_ids = count(max((row["id"] for row in self.audit_events), default=0) + 1)
        self._cashier_shift_ids = count(len(self.cashier_shifts) + 1)
        self._cashier_handover_ids = count(len(self.cashier_handover_logs) + 1)
        self._payment_anomaly_ids = count(len(self.payment_anomalies) + 1)
        self._mpesa_collection_ids = count(max((row["id"] for row in self.mpesa_collections), default=0) + 1)
        self._offline_sync_ids = count(len(self.offline_sync_batches) + 1)
        self._user_ids = count(max(self.users.keys(), default=0) + 1)

    def _snapshot(self) -> dict[str, Any]:
        return {
            "products": self.products,
            "product_by_barcode": self.product_by_barcode,
            "suppliers": self.suppliers,
            "cargo_types": self.cargo_types,
            "china_source_records": self.china_source_records,
            "apparel_piece_weights": self.apparel_piece_weights,
            "apparel_default_costs": self.apparel_default_costs,
            "apparel_sorting_racks": self.apparel_sorting_racks,
            "inbound_shipments": self.inbound_shipments,
            "parcel_batches": self.parcel_batches,
            "bale_barcodes": self.bale_barcodes,
            "sorting_tasks": self.sorting_tasks,
            "item_barcode_tokens": self.item_barcode_tokens,
            "store_prep_bale_tasks": self.store_prep_bale_tasks,
            "store_prep_bales": self.store_prep_bales,
            "store_dispatch_bales": self.store_dispatch_bales,
            "store_delivery_execution_orders": self.store_delivery_execution_orders,
            "sorting_stock": self.sorting_stock,
            "goods_receipts": self.goods_receipts,
            "print_jobs": self.print_jobs,
            "print_station_jobs": self.print_station_jobs,
            "warehouse_stock": dict(self.warehouse_stock),
            "warehouse_lots": dict(self.warehouse_lots),
            "store_stock": dict(self.store_stock),
            "store_lots": dict(self.store_lots),
            "price_rules": self.price_rules,
            "transfer_orders": self.transfer_orders,
            "picking_waves": self.picking_waves,
            "transfer_recommendations": self.transfer_recommendations,
            "transfer_receiving_sessions": self.transfer_receiving_sessions,
            "store_token_receiving_sessions": self.store_token_receiving_sessions,
            "return_orders": self.return_orders,
            "sales_transactions": self.sales_transactions,
            "bale_sales_pricing_profiles": self.bale_sales_pricing_profiles,
            "bale_sales_orders": self.bale_sales_orders,
            "sale_void_requests": self.sale_void_requests,
            "sale_refund_requests": self.sale_refund_requests,
            "store_rack_locations": self.store_rack_locations,
            "inventory_adjustments": self.inventory_adjustments,
            "inventory_movements": self.inventory_movements,
            "audit_events": self.audit_events,
            "cashier_shifts": self.cashier_shifts,
            "cashier_handover_logs": self.cashier_handover_logs,
            "payment_anomalies": self.payment_anomalies,
            "mpesa_collections": self.mpesa_collections,
            "offline_sync_batches": self.offline_sync_batches,
            "offline_sale_registry": self.offline_sale_registry,
            "label_templates": self.label_templates,
            "users": self.users,
            "stores": self.stores,
        }

    def _persist(self) -> None:
        save_json(self._state_file, self._snapshot())

    def _load_from_disk(self) -> None:
        payload = load_json(self._state_file)
        if not payload:
            return

        self.products = {int(key): value for key, value in payload.get("products", {}).items()}
        self.product_by_barcode = {
            barcode: int(product_id)
            for barcode, product_id in payload.get("product_by_barcode", {}).items()
        }
        self.suppliers = payload.get("suppliers", {})
        self.cargo_types = payload.get("cargo_types", {})
        self.china_source_records = payload.get("china_source_records", {})
        self.apparel_piece_weights = payload.get("apparel_piece_weights", {})
        self.apparel_default_costs = payload.get("apparel_default_costs", {})
        self.apparel_sorting_racks = payload.get("apparel_sorting_racks", {})
        self.inbound_shipments = payload.get("inbound_shipments", {})
        self.parcel_batches = payload.get("parcel_batches", {})
        self.bale_barcodes = payload.get("bale_barcodes", {})
        self.sorting_tasks = payload.get("sorting_tasks", {})
        self.item_barcode_tokens = payload.get("item_barcode_tokens", {})
        self.store_prep_bale_tasks = payload.get("store_prep_bale_tasks", {})
        self.store_prep_bales = payload.get("store_prep_bales", {})
        self.store_dispatch_bales = payload.get("store_dispatch_bales", {})
        self.store_delivery_execution_orders = payload.get("store_delivery_execution_orders", {})
        self.sorting_stock = payload.get("sorting_stock", {})
        self.goods_receipts = payload.get("goods_receipts", [])
        self.print_jobs = payload.get("print_jobs", [])
        self.print_station_jobs = payload.get("print_station_jobs", [])
        self.warehouse_stock = defaultdict(dict, payload.get("warehouse_stock", {}))
        self.warehouse_lots = defaultdict(list, payload.get("warehouse_lots", {}))
        self.store_stock = defaultdict(dict, payload.get("store_stock", {}))
        self.store_lots = defaultdict(list, payload.get("store_lots", {}))
        self.price_rules = payload.get("price_rules", {})
        self.transfer_orders = payload.get("transfer_orders", {})
        self.picking_waves = payload.get("picking_waves", {})
        self.transfer_recommendations = payload.get("transfer_recommendations", {})
        self.transfer_receiving_sessions = payload.get("transfer_receiving_sessions", {})
        self.store_token_receiving_sessions = payload.get("store_token_receiving_sessions", {})
        self.return_orders = payload.get("return_orders", {})
        self.sales_transactions = payload.get("sales_transactions", [])
        self.bale_sales_pricing_profiles = payload.get("bale_sales_pricing_profiles", {})
        self.bale_sales_orders = payload.get("bale_sales_orders", {})
        self.sale_void_requests = payload.get("sale_void_requests", {})
        self.sale_refund_requests = payload.get("sale_refund_requests", {})
        self.store_rack_locations = payload.get("store_rack_locations", {})
        self.inventory_adjustments = payload.get("inventory_adjustments", [])
        self.inventory_movements = payload.get("inventory_movements", [])
        self.audit_events = payload.get("audit_events", [])
        self.cashier_shifts = payload.get("cashier_shifts", {})
        self.cashier_handover_logs = payload.get("cashier_handover_logs", {})
        self.payment_anomalies = payload.get("payment_anomalies", {})
        self.mpesa_collections = payload.get("mpesa_collections", [])
        self.offline_sync_batches = payload.get("offline_sync_batches", {})
        self.offline_sale_registry = payload.get("offline_sale_registry", {})
        self.label_templates = payload.get("label_templates", {})
        self.users = {int(key): value for key, value in payload.get("users", {}).items()}
        store_payload = payload.get("stores", {})
        if store_payload:
            self.stores = dict(store_payload)
        updated_products = self._hydrate_products()
        updated_price_rules = self._hydrate_price_rules()
        updated_sales = self._hydrate_sales_transactions()
        updated_void_requests = self._hydrate_sale_void_requests()
        updated_refund_requests = self._hydrate_sale_refund_requests()
        updated_returns = self._hydrate_return_orders()
        updated_shifts = self._hydrate_cashier_shifts()
        updated_handovers = self._hydrate_cashier_handover_logs()
        updated_payment_anomalies = self._hydrate_payment_anomalies()
        updated_mpesa = self._hydrate_mpesa_collections()
        updated_offline = self._hydrate_offline_sync_state()
        updated_label_templates = self._hydrate_label_templates()
        updated_bales = self._hydrate_bale_barcodes()
        updated_bale_print_jobs = self._hydrate_bale_print_jobs()
        updated_sorting_tokens = self._reconcile_sorting_item_tokens()
        self._rebuild_product_barcode_index()
        self._rebuild_store_dispatch_bales()

        self._set_counters()
        updated_seed_label_templates = self._ensure_seed_label_templates()
        updated_apparel_default_costs = self._ensure_seed_apparel_default_costs()
        updated_apparel_sorting_racks = self._ensure_seed_apparel_sorting_racks()
        self._ensure_seed_suppliers()
        self._ensure_seed_cargo_types()
        self._ensure_seed_users()
        updated_store_racks = self._ensure_seed_store_racks()
        updated_suppliers = self._hydrate_suppliers()
        updated_cargo_types = self._hydrate_cargo_types()
        updated_inventory_lots = self._hydrate_inventory_lots()
        self._set_counters()
        if (
            updated_suppliers
            or updated_cargo_types
            or updated_products
            or updated_price_rules
            or updated_sales
            or updated_void_requests
            or updated_refund_requests
            or updated_returns
            or updated_shifts
            or updated_handovers
            or updated_payment_anomalies
            or updated_mpesa
            or updated_offline
            or updated_label_templates
            or updated_seed_label_templates
            or updated_bales
            or updated_bale_print_jobs
            or updated_sorting_tokens
            or updated_inventory_lots
            or updated_apparel_default_costs
            or updated_apparel_sorting_racks
            or updated_store_racks
        ) and self._state_file.exists():
            self._persist()

    def _product_code_for_id(self, product_id: int) -> str:
        return f"PRD{product_id:06d}"

    def _default_barcode_for_id(self, product_id: int) -> str:
        return f"BC{product_id:08d}"

    def _clamp_float(self, value: Any, minimum: float, maximum: float, fallback: float) -> float:
        try:
            number = float(value)
        except (TypeError, ValueError):
            number = float(fallback)
        return min(max(number, minimum), maximum)

    def _round_tenth(self, value: Any) -> float:
        return round(float(value or 0) * 10) / 10

    def _guess_template_paper_preset(self, width_mm: int, height_mm: int) -> str:
        normalized_width = int(width_mm or 0)
        normalized_height = int(height_mm or 0)
        if normalized_width == 60 and normalized_height == 40:
            return "60x40"
        if normalized_width == 50 and normalized_height == 30:
            return "50x30"
        if normalized_width == 70 and normalized_height == 50:
            return "70x50"
        return "custom"

    def _default_bale_template_layout(self, width_mm: int, height_mm: int) -> dict[str, Any]:
        width = int(self._clamp_float(width_mm, 20, 120, 60))
        height = int(self._clamp_float(height_mm, 20, 120, 40))
        is_compact_60x40 = width == 60 and height == 40
        margin_x = 3.6 if is_compact_60x40 else max(3.5, self._round_tenth(width * 0.07))
        headline_height = 6.8 if is_compact_60x40 else max(7.0, self._round_tenth(height * 0.2))
        barcode_height = 15.0 if is_compact_60x40 else max(11.0, self._round_tenth(height * 0.34))
        scan_token_height = 4.8 if is_compact_60x40 else 5.2
        gutter = 1.6 if is_compact_60x40 else 2.2
        headline_y = 2.4 if is_compact_60x40 else 3.5
        barcode_y = self._round_tenth(headline_y + headline_height + gutter)
        scan_token_y = self._round_tenth(barcode_y + barcode_height + gutter)
        footer_y = self._round_tenth(scan_token_y + scan_token_height + gutter)
        content_width = self._round_tenth(width - margin_x * 2)
        footer_height = max(4.0, self._round_tenth(height - footer_y - 2.5))
        return {
            "paper_preset": self._guess_template_paper_preset(width, height),
            "components": [
                {
                    "id": "headline",
                    "label": "顶部关键信息",
                    "type": "text",
                    "enabled": True,
                    "x_mm": margin_x,
                    "y_mm": headline_y,
                    "w_mm": content_width,
                    "h_mm": headline_height,
                    "font_size": 8.8 if is_compact_60x40 else (9 if width >= 60 else 8),
                    "font_weight": "700",
                    "align": "left",
                    "content_source": "supplier_package" if is_compact_60x40 else "supplier_category_package",
                },
                {
                    "id": "barcode",
                    "label": "中间 Code128 条码",
                    "type": "barcode",
                    "enabled": True,
                    "x_mm": margin_x,
                    "y_mm": barcode_y,
                    "w_mm": content_width,
                    "h_mm": barcode_height,
                    "font_size": 0,
                    "font_weight": "400",
                    "align": "center",
                    "content_source": "scan_token",
                },
                {
                    "id": "scan_token",
                    "label": "短码文本",
                    "type": "text",
                    "enabled": True,
                    "x_mm": margin_x,
                    "y_mm": scan_token_y,
                    "w_mm": content_width,
                    "h_mm": scan_token_height,
                    "font_size": 6.8 if is_compact_60x40 else (7.4 if width >= 60 else 6.8),
                    "font_weight": "700",
                    "align": "center",
                    "content_source": "scan_token",
                },
                {
                    "id": "footer",
                    "label": "底部辅助小字",
                    "type": "text",
                    "enabled": False,
                    "x_mm": margin_x,
                    "y_mm": footer_y,
                    "w_mm": content_width,
                    "h_mm": footer_height,
                    "font_size": 5.6 if width >= 60 else 5.2,
                    "font_weight": "400",
                    "align": "left",
                    "content_source": "shipment_batch",
                },
            ],
        }

    def _default_bale_component_allowed_sources(self, component_id: str) -> Optional[set[str]]:
        return {
            "headline": {"supplier_category_package", "supplier_package", "category_package", "supplier_category", "package_only"},
            "barcode": {"scan_token"},
            "scan_token": {"scan_token"},
            "footer": {"none", "shipment_no", "parcel_batch_no", "shipment_batch", "bale_barcode"},
        }.get(str(component_id or "").strip().lower())

    def _normalize_bale_template_component(
        self,
        component: Optional[dict[str, Any]],
        width_mm: int,
        height_mm: int,
        *,
        fallback: Optional[dict[str, Any]] = None,
        index: int = 0,
        strict_sources: bool = False,
    ) -> dict[str, Any]:
        current = dict(component or {})
        fallback_row = dict(fallback or {})
        fallback_id = str(fallback_row.get("id") or f"component_{index + 1}").strip().lower() or f"component_{index + 1}"
        component_id = str(current.get("id") or fallback_id).strip().lower() or fallback_id
        component_type = str(current.get("type") or fallback_row.get("type") or ("barcode" if component_id == "barcode" else "text")).strip().lower()
        if component_type not in {"text", "barcode", "line"}:
            component_type = str(fallback_row.get("type") or "text").strip().lower() or "text"
        minimum_width = 0.1 if component_type == "line" else (24 if component_type == "barcode" else 4)
        minimum_height = 0.1 if component_type == "line" else (10 if component_type == "barcode" else 2.4)
        fallback_width = fallback_row.get("w_mm", minimum_width)
        fallback_height = fallback_row.get("h_mm", minimum_height)
        width_value = self._clamp_float(current.get("w_mm"), minimum_width, width_mm, fallback_width)
        height_value = self._clamp_float(current.get("h_mm"), minimum_height, height_mm, fallback_height)
        x_value = self._clamp_float(current.get("x_mm"), 0, max(width_mm - width_value, 0), fallback_row.get("x_mm", 0))
        y_value = self._clamp_float(current.get("y_mm"), 0, max(height_mm - height_value, 0), fallback_row.get("y_mm", 0))
        align = str(current.get("align") or fallback_row.get("align") or "left").strip().lower()
        if align not in {"left", "center", "right"}:
            align = str(fallback_row.get("align") or "left").strip().lower() or "left"
        vertical_align = str(current.get("vertical_align") or fallback_row.get("vertical_align") or "top").strip().lower()
        if vertical_align not in {"top", "middle", "bottom"}:
            vertical_align = "top"
        content_source = str(current.get("content_source") or fallback_row.get("content_source") or "").strip()
        allowed_sources = self._default_bale_component_allowed_sources(component_id) if strict_sources else None
        if allowed_sources is not None and content_source not in allowed_sources:
            content_source = str(fallback_row.get("content_source") or "").strip()
        render_mode = str(current.get("render_mode") or fallback_row.get("render_mode") or "text").strip().lower()
        if render_mode not in {"text", "bitmap"}:
            render_mode = "text"
        normalized = {
            "id": component_id,
            "label": str(current.get("label") or fallback_row.get("label") or component_id).strip(),
            "type": component_type,
            "enabled": bool(current.get("enabled", fallback_row.get("enabled", True))),
            "x_mm": self._round_tenth(x_value),
            "y_mm": self._round_tenth(y_value),
            "w_mm": self._round_tenth(min(width_value, width_mm)),
            "h_mm": self._round_tenth(min(height_value, height_mm)),
            "align": align,
            "content_source": content_source,
        }
        if component_type == "text":
            normalized["font_size"] = self._clamp_float(
                current.get("font_size"),
                5,
                24,
                fallback_row.get("font_size", 7),
            )
            normalized["font_weight"] = "700" if str(current.get("font_weight") or fallback_row.get("font_weight") or "400").strip() == "700" else "400"
            normalized["vertical_align"] = vertical_align
            normalized["render_mode"] = render_mode
        elif component_type == "barcode":
            normalized["font_size"] = 0
            normalized["font_weight"] = "400"
        return normalized

    def _normalize_label_template_layout(
        self,
        template_scope: str,
        layout: Optional[dict[str, Any]],
        width_mm: int,
        height_mm: int,
    ) -> dict[str, Any]:
        normalized_scope = str(template_scope or "").strip().lower()
        if normalized_scope != "bale":
            return dict(layout or {})
        width = int(self._clamp_float(width_mm, 20, 120, 60))
        height = int(self._clamp_float(height_mm, 20, 120, 40))
        defaults = self._default_bale_template_layout(width, height)
        defaults_by_id = {
            str(component.get("id") or "").strip().lower(): component
            for component in defaults["components"]
        }
        layout_row = dict(layout or {})
        component_rows = layout_row.get("components") if isinstance(layout_row.get("components"), list) else []
        if not component_rows:
            return defaults
        has_custom_components = any(
            str(row.get("id") or "").strip().lower() not in defaults_by_id
            or str(row.get("type") or "").strip().lower() == "line"
            or str(row.get("render_mode") or "").strip().lower() == "bitmap"
            for row in component_rows
            if isinstance(row, dict)
        )
        normalized_components: list[dict[str, Any]] = []
        if has_custom_components:
            for index, current in enumerate(component_rows):
                if not isinstance(current, dict):
                    continue
                current_id = str(current.get("id") or "").strip().lower()
                normalized_components.append(
                    self._normalize_bale_template_component(
                        current,
                        width,
                        height,
                        fallback=defaults_by_id.get(current_id),
                        index=index,
                        strict_sources=False,
                    )
                )
        else:
            for index, fallback in enumerate(defaults["components"]):
                current = next(
                    (
                        row for row in component_rows
                        if str(row.get("id") or "").strip().lower() == str(fallback.get("id") or "").strip().lower()
                    ),
                    {},
                )
                normalized_components.append(
                    self._normalize_bale_template_component(
                        current,
                        width,
                        height,
                        fallback=fallback,
                        index=index,
                        strict_sources=True,
                    )
                )
        return {
            "paper_preset": str(layout_row.get("paper_preset") or self._guess_template_paper_preset(width, height)).strip().lower(),
            "components": normalized_components,
        }

    def _normalize_code_fragment(self, value: str, fallback: str = "GEN") -> str:
        text = "".join(ch for ch in str(value or "").upper() if ch.isalnum())
        return text[:8] or fallback

    def _sorting_sku_code(self, category_name: str, grade: str, default_cost_kes: Any = None) -> str:
        category_code = self._normalize_code_fragment(category_name, "ITEM")
        grade_code = self._normalize_code_fragment(grade, "A")[:2]
        if default_cost_kes in {None, ""}:
            return f"{category_code}-{grade_code}"
        cost_fragment = f"{int(round(float(default_cost_kes) * 100)):06d}"
        return f"{category_code}-{grade_code}-{cost_fragment}"

    def _sorting_task_identifier_code(self, task_no: str, fallback: str = "TASK") -> str:
        text = "".join(ch for ch in str(task_no or "").upper() if ch.isalnum())
        return text or fallback

    def _alpha_serial_code(self, serial_no: int, width: int) -> str:
        alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
        value = max(int(serial_no or 0), 0)
        chars: list[str] = []
        for _ in range(max(int(width or 1), 1)):
            chars.append(alphabet[value % len(alphabet)])
            value //= len(alphabet)
        return "".join(reversed(chars))

    def _date_fragment_from_value(self, value: Any, fallback_now: bool = False) -> str:
        date_source = "".join(ch for ch in str(value or "").strip() if ch.isdigit())
        if len(date_source) >= 8 and date_source.startswith(("19", "20")):
            return date_source[2:8]
        if len(date_source) >= 6:
            return date_source[:6]
        return datetime.now(NAIROBI_TZ).strftime("%y%m%d") if fallback_now else "000000"

    def _serial_seed_from_task_group(self, task_no: str, token_group_no: int) -> int:
        task_code = str(task_no or "").strip().upper()
        match = re.search(r"(\d+)$", task_code)
        task_id = int(match.group(1)) if match else 0
        return max(task_id * 100 + int(token_group_no or 0), int(token_group_no or 0), 1)

    def _sorting_item_token_no(self, task_no: str, serial_no: int) -> str:
        task_code = self._sorting_task_identifier_code(task_no, "TASK")
        return f"TOK-{task_code}-{serial_no:04d}"

    def _store_item_barcode_value(self, task_no: str, serial_no: int, created_at: Any = "") -> str:
        date_fragment = self._date_fragment_from_value(created_at or task_no, fallback_now=True)
        serial_seed = self._serial_seed_from_task_group(task_no, 0) * 10000 + max(int(serial_no or 0), 1)
        return f"IT{date_fragment}{self._alpha_serial_code(serial_seed, 6)}"

    def _raw_bale_scan_token(self, row: dict[str, Any]) -> str:
        existing = str(row.get("scan_token") or "").strip().upper()
        if existing:
            return existing
        date_fragment = self._date_fragment_from_value(row.get("unload_date") or row.get("created_at"))
        row_id = int(row.get("id") or 0)
        if row_id > 0:
            return f"RB{date_fragment}{self._alpha_serial_code(row_id, 5)}"
        parcel_batch_no = self._normalize_code_fragment(str(row.get("parcel_batch_no") or ""), "BATCH")
        serial_no = max(int(row.get("serial_no") or 0), 0)
        seed = sum(ord(ch) for ch in parcel_batch_no[:4]) * 100 + serial_no
        return f"RB{date_fragment}{self._alpha_serial_code(seed, 5)}"

    def _raw_bale_legacy_barcode(self, row: dict[str, Any]) -> str:
        existing = str(row.get("legacy_bale_barcode") or "").strip().upper()
        if existing:
            return existing
        current = str(row.get("bale_barcode") or "").strip().upper()
        scan_token = str(row.get("scan_token") or "").strip().upper()
        if current and current != scan_token and current.startswith("BALE-"):
            return current
        return ""

    def _raw_bale_matches_reference(self, row: dict[str, Any], bale_reference: str) -> bool:
        normalized_reference = str(bale_reference or "").strip().upper()
        if not normalized_reference:
            return False
        return normalized_reference in {
            str(row.get("bale_barcode") or "").strip().upper(),
            str(row.get("scan_token") or "").strip().upper(),
            str(row.get("legacy_bale_barcode") or "").strip().upper(),
        }

    def _find_raw_bale_by_reference_no_defaults(self, bale_reference: str) -> Optional[dict[str, Any]]:
        normalized_reference = str(bale_reference or "").strip().upper()
        if not normalized_reference:
            return None
        row = self.bale_barcodes.get(normalized_reference)
        if row:
            return row
        for candidate in self.bale_barcodes.values():
            if self._raw_bale_matches_reference(candidate, normalized_reference):
                return candidate
        return None

    def _canonicalize_bale_reference_list(self, bale_references: list[str]) -> tuple[list[str], list[str]]:
        primary_codes: list[str] = []
        legacy_codes: list[str] = []
        for reference in bale_references or []:
            normalized_reference = str(reference or "").strip().upper()
            if not normalized_reference:
                continue
            bale = self._find_raw_bale_by_reference_no_defaults(normalized_reference)
            if bale:
                primary_code = str(bale.get("bale_barcode") or "").strip().upper()
                legacy_code = str(bale.get("legacy_bale_barcode") or "").strip().upper()
            else:
                primary_code = normalized_reference
                legacy_code = ""
            if primary_code and primary_code not in primary_codes:
                primary_codes.append(primary_code)
            if legacy_code and legacy_code not in legacy_codes:
                legacy_codes.append(legacy_code)
        return primary_codes, legacy_codes

    def _normalize_raw_bale_destination(self, row: dict[str, Any]) -> str:
        destination = str(row.get("destination_judgement") or "").strip().lower()
        if destination in {"sorting", "bale_sales_pool", "pending"}:
            return destination
        status = str(row.get("status") or "").strip().lower()
        if status in {"sorting_in_progress", "sorted"}:
            return "sorting"
        if status == "in_bale_sales_pool":
            return "bale_sales_pool"
        return "pending"

    def _infer_raw_bale_weight_kg(self, row: dict[str, Any]) -> Optional[float]:
        weight = row.get("weight_kg")
        if weight not in {None, ""}:
            return float(weight)
        parcel_batch_no = str(row.get("parcel_batch_no") or "").strip().upper()
        parcel_row = self.parcel_batches.get(parcel_batch_no)
        if parcel_row and parcel_row.get("total_weight") not in {None, ""}:
            return float(parcel_row["total_weight"])
        return None

    def _infer_raw_bale_task_no(self, *bale_references: str) -> str:
        normalized_references = {
            str(reference or "").strip().upper()
            for reference in bale_references
            if str(reference or "").strip()
        }
        if not normalized_references:
            return ""
        for task in self.sorting_tasks.values():
            task_bales = [
                str(code or "").strip().upper()
                for code in task.get("bale_barcodes", [])
                if str(code or "").strip()
            ]
            if normalized_references.intersection(task_bales):
                return str(task.get("task_no") or "").strip().upper()
            for code in task_bales:
                candidate = self._find_raw_bale_by_reference_no_defaults(code)
                if candidate and any(self._raw_bale_matches_reference(candidate, reference) for reference in normalized_references):
                    return str(task.get("task_no") or "").strip().upper()
        return ""

    def _raw_bale_current_location(self, row: dict[str, Any], occupied_by_task_no: str, destination_judgement: str) -> str:
        status = str(row.get("status") or "").strip().lower()
        if status == "sorting_in_progress":
            return f"sorting_task:{occupied_by_task_no}" if occupied_by_task_no else "sorting_task"
        if status == "sorted":
            return "sorted_inventory"
        if status == "in_bale_sales_pool" or destination_judgement == "bale_sales_pool":
            return "bale_sales_pool"
        return "warehouse_raw_bale_stock"

    def _ensure_raw_bale_defaults(self, row: dict[str, Any]) -> bool:
        updated = False
        scan_token = self._raw_bale_scan_token(row)
        if str(row.get("scan_token") or "").strip().upper() != scan_token:
            row["scan_token"] = scan_token
            updated = True
        legacy_bale_barcode = self._raw_bale_legacy_barcode(row)
        if str(row.get("legacy_bale_barcode") or "").strip().upper() != legacy_bale_barcode:
            row["legacy_bale_barcode"] = legacy_bale_barcode
            updated = True
        if str(row.get("bale_barcode") or "").strip().upper() != scan_token:
            row["bale_barcode"] = scan_token
            updated = True
        destination_judgement = self._normalize_raw_bale_destination(row)
        if row.get("destination_judgement") != destination_judgement:
            row["destination_judgement"] = destination_judgement
            updated = True

        weight_kg = self._infer_raw_bale_weight_kg(row)
        if row.get("weight_kg") != weight_kg:
            row["weight_kg"] = weight_kg
            updated = True

        occupied_by_task_no = str(row.get("occupied_by_task_no") or "").strip().upper() or self._infer_raw_bale_task_no(
            row.get("bale_barcode", ""),
            row.get("legacy_bale_barcode", ""),
        )
        if str(row.get("occupied_by_task_no") or "").strip().upper() != occupied_by_task_no:
            row["occupied_by_task_no"] = occupied_by_task_no
            updated = True

        if row.get("entered_bale_sales_pool_at", "") == "":
            row["entered_bale_sales_pool_at"] = None
            updated = True
        if row.get("entered_bale_sales_pool_by") is None:
            row["entered_bale_sales_pool_by"] = ""
            updated = True

        current_location = self._raw_bale_current_location(row, occupied_by_task_no, destination_judgement)
        if row.get("current_location") != current_location:
            row["current_location"] = current_location
            updated = True

        return updated

    def _hydrate_bale_barcodes(self) -> bool:
        updated = False
        normalized_rows: dict[str, dict[str, Any]] = {}
        for row in self.bale_barcodes.values():
            if self._ensure_raw_bale_defaults(row):
                updated = True
            normalized_rows[str(row.get("bale_barcode") or "").strip().upper()] = row
        if set(normalized_rows.keys()) != set(self.bale_barcodes.keys()):
            self.bale_barcodes = normalized_rows
            updated = True
        return updated

    def _hydrate_bale_print_jobs(self) -> bool:
        updated = False
        for job in self.print_jobs:
            if str(job.get("job_type") or "").strip().lower() != "bale_barcode_label":
                continue
            bale_reference = str(job.get("barcode") or "").strip().upper()
            bale = self._find_raw_bale_by_reference_no_defaults(bale_reference)
            if not bale:
                continue
            self._ensure_raw_bale_defaults(bale)
            payload = dict(job.get("print_payload") or {})
            primary_bale_barcode = str(bale.get("bale_barcode") or "").strip().upper()
            legacy_bale_barcode = str(bale.get("legacy_bale_barcode") or "").strip().upper()
            scan_token = str(bale.get("scan_token") or "").strip().upper()
            job_updated = False
            if str(job.get("barcode") or "").strip().upper() != primary_bale_barcode:
                job["barcode"] = primary_bale_barcode
                job_updated = True
            if str(job.get("template_code") or "").strip().lower() != LOCKED_BALE_TEMPLATE_CODE:
                job["template_code"] = LOCKED_BALE_TEMPLATE_CODE
                job_updated = True
            if payload.get("barcode_value") != scan_token:
                payload["barcode_value"] = scan_token
                job_updated = True
            if payload.get("scan_token") != scan_token:
                payload["scan_token"] = scan_token
                job_updated = True
            if payload.get("human_readable") != scan_token:
                payload["human_readable"] = scan_token
                job_updated = True
            if payload.get("bale_barcode") != primary_bale_barcode:
                payload["bale_barcode"] = primary_bale_barcode
                job_updated = True
            if payload.get("legacy_bale_barcode") != legacy_bale_barcode:
                payload["legacy_bale_barcode"] = legacy_bale_barcode
                job_updated = True
            if payload.get("template_code") != LOCKED_BALE_TEMPLATE_CODE:
                payload["template_code"] = LOCKED_BALE_TEMPLATE_CODE
                job_updated = True
            template_row = self.label_templates.get(LOCKED_BALE_TEMPLATE_CODE) or {}
            if payload.get("paper_preset") != str(template_row.get("paper_preset") or payload.get("paper_preset") or "").strip().lower():
                payload["paper_preset"] = str(template_row.get("paper_preset") or payload.get("paper_preset") or "").strip().lower()
                job_updated = True
            normalized_layout = self._normalize_label_template_layout(
                "bale",
                template_row.get("layout") or payload.get("layout"),
                int(template_row.get("width_mm") or payload.get("width_mm") or 60),
                int(template_row.get("height_mm") or payload.get("height_mm") or 40),
            )
            if payload.get("layout") != normalized_layout:
                payload["layout"] = normalized_layout
                job_updated = True
            if job_updated:
                job["print_payload"] = payload
                updated = True
        return updated

    def _find_raw_bale_by_reference(self, bale_reference: str) -> Optional[dict[str, Any]]:
        row = self._find_raw_bale_by_reference_no_defaults(bale_reference)
        if not row:
            return None
        self._ensure_raw_bale_defaults(row)
        return row

    def _get_raw_bale_or_raise(self, bale_barcode: str) -> dict[str, Any]:
        normalized_bale = str(bale_barcode or "").strip().upper()
        if not normalized_bale:
            raise HTTPException(status_code=400, detail="bale_barcode is required")
        row = self._find_raw_bale_by_reference(normalized_bale)
        if not row:
            raise HTTPException(status_code=404, detail=f"找不到 bale barcode：{normalized_bale}")
        self._ensure_raw_bale_defaults(row)
        return row

    def _build_raw_bale_row(self, row: dict[str, Any]) -> dict[str, Any]:
        normalized = dict(row)
        self._ensure_raw_bale_defaults(normalized)
        normalized["is_occupied"] = bool(str(normalized.get("occupied_by_task_no") or "").strip())
        normalized["is_in_bale_sales_pool"] = str(normalized.get("destination_judgement") or "").strip().lower() == "bale_sales_pool"
        normalized["can_route_to_sorting"] = (
            str(normalized.get("status") or "").strip().lower() == "ready_for_sorting"
            and not normalized["is_occupied"]
            and not normalized["is_in_bale_sales_pool"]
        )
        normalized["can_route_to_bale_sales_pool"] = (
            str(normalized.get("status") or "").strip().lower() == "ready_for_sorting"
            and not normalized["is_occupied"]
        )
        return normalized

    def _store_dispatch_bale_no(self, task_no: str, token_group_no: int) -> str:
        date_fragment = self._date_fragment_from_value(task_no, fallback_now=True)
        serial_seed = self._serial_seed_from_task_group(task_no, token_group_no)
        return f"SDB{date_fragment}{self._alpha_serial_code(serial_seed, 3)}"

    def _store_prep_bale_task_no(self, task_id: int) -> str:
        return f"SPT-{datetime.now(NAIROBI_TZ).strftime('%Y%m%d')}-{int(task_id or 0):03d}"

    def _store_prep_bale_no(self, bale_index: int) -> str:
        return f"SPB-{datetime.now(NAIROBI_TZ).strftime('%Y%m%d')}-{int(bale_index or 0):03d}"

    def _store_prep_bale_barcode(self, row: dict[str, Any]) -> str:
        existing = str(row.get("bale_barcode") or row.get("scan_token") or "").strip().upper()
        if existing:
            return existing
        date_fragment = self._date_fragment_from_value(row.get("created_at") or row.get("updated_at"), fallback_now=True)
        bale_id = int(row.get("id") or 0)
        if bale_id > 0:
            return f"SDB{date_fragment}{self._alpha_serial_code(bale_id, 3)}"
        bale_no = self._normalize_code_fragment(str(row.get("bale_no") or ""), "SPB")
        seed = sum(ord(ch) for ch in bale_no)
        return f"SDB{date_fragment}{self._alpha_serial_code(seed, 3)}"

    def _normalize_store_prep_bale_task(self, row: dict[str, Any]) -> dict[str, Any]:
        normalized = dict(row or {})
        normalized["task_type"] = str(normalized.get("task_type") or "store_dispatch").strip().lower() or "store_dispatch"
        normalized["category_main"] = str(normalized.get("category_main") or "").strip()
        normalized["category_sub"] = str(normalized.get("category_sub") or "").strip()
        normalized["target_qty"] = int(normalized.get("target_qty") or 0)
        normalized["pieces_per_bale"] = int(normalized.get("pieces_per_bale") or 0)
        normalized["bale_count"] = max(1, int(normalized.get("bale_count") or 1))
        normalized["target_weight_kg"] = (
            round(float(normalized.get("target_weight_kg") or 0), 2)
            if normalized.get("target_weight_kg") not in {None, ""}
            else None
        )
        normalized["actual_weight_kg"] = (
            round(float(normalized.get("actual_weight_kg") or 0), 2)
            if normalized.get("actual_weight_kg") not in {None, ""}
            else None
        )
        normalized["estimated_piece_weight_kg"] = (
            round(float(normalized.get("estimated_piece_weight_kg") or 0), 2)
            if normalized.get("estimated_piece_weight_kg") not in {None, ""}
            else None
        )
        normalized["ratio_label"] = str(normalized.get("ratio_label") or "").strip().upper()
        normalized["ratio_summary"] = str(normalized.get("ratio_summary") or "").strip()
        normalized["grade_requirements"] = self._normalize_store_prep_grade_requirements(normalized.get("grade_requirements") or [])
        normalized["grade_ratios"] = self._normalize_store_prep_grade_ratios(normalized.get("grade_ratios") or [])
        normalized["grade_summary"] = str(normalized.get("grade_summary") or "").strip()
        normalized["assigned_employee"] = str(normalized.get("assigned_employee") or "").strip()
        normalized["available_qty"] = int(normalized.get("available_qty") or 0)
        normalized["reserved_token_nos"] = [
            str(token_no or "").strip().upper()
            for token_no in (normalized.get("reserved_token_nos") or [])
            if str(token_no or "").strip()
        ]
        normalized["suspended_qty"] = len(normalized["reserved_token_nos"])
        normalized["packed_qty"] = int(normalized.get("packed_qty") or 0)
        normalized["prepared_bale_no"] = str(normalized.get("prepared_bale_no") or "").strip().upper()
        normalized["prepared_bale_barcode"] = str(normalized.get("prepared_bale_barcode") or "").strip().upper()
        normalized["prepared_bale_nos"] = [
            str(bale_no or "").strip().upper()
            for bale_no in (normalized.get("prepared_bale_nos") or [])
            if str(bale_no or "").strip()
        ]
        normalized["prepared_bale_barcodes"] = [
            str(barcode or "").strip().upper()
            for barcode in (normalized.get("prepared_bale_barcodes") or [])
            if str(barcode or "").strip()
        ]
        if normalized["prepared_bale_no"] and normalized["prepared_bale_no"] not in normalized["prepared_bale_nos"]:
            normalized["prepared_bale_nos"].insert(0, normalized["prepared_bale_no"])
        if normalized["prepared_bale_barcode"] and normalized["prepared_bale_barcode"] not in normalized["prepared_bale_barcodes"]:
            normalized["prepared_bale_barcodes"].insert(0, normalized["prepared_bale_barcode"])
        normalized["status"] = str(normalized.get("status") or "open").strip().lower() or "open"
        normalized["unit_cost_kes"] = (
            round(float(normalized.get("unit_cost_kes") or 0), 2)
            if normalized.get("unit_cost_kes") not in {None, ""}
            else None
        )
        normalized["total_cost_kes"] = (
            round(float(normalized.get("total_cost_kes") or 0), 2)
            if normalized.get("total_cost_kes") not in {None, ""}
            else None
        )
        normalized["label_summary"] = str(normalized.get("label_summary") or "").strip()
        normalized["note"] = str(normalized.get("note") or "").strip()
        normalized["created_by"] = str(normalized.get("created_by") or "").strip()
        normalized["completed_by"] = str(normalized.get("completed_by") or "").strip()
        return normalized

    def _normalize_store_prep_bale(self, row: dict[str, Any]) -> dict[str, Any]:
        normalized = dict(row or {})
        normalized["id"] = int(normalized.get("id") or 0)
        normalized["bale_no"] = str(normalized.get("bale_no") or "").strip().upper()
        bale_barcode = self._store_prep_bale_barcode(normalized)
        normalized["bale_barcode"] = bale_barcode
        normalized["scan_token"] = bale_barcode
        normalized["task_no"] = str(normalized.get("task_no") or "").strip().upper()
        normalized["task_type"] = str(normalized.get("task_type") or "store_dispatch").strip().lower() or "store_dispatch"
        normalized["category_main"] = str(normalized.get("category_main") or "").strip()
        normalized["category_sub"] = str(normalized.get("category_sub") or "").strip()
        normalized["qty"] = int(normalized.get("qty") or 0)
        normalized["target_weight_kg"] = (
            round(float(normalized.get("target_weight_kg") or 0), 2)
            if normalized.get("target_weight_kg") not in {None, ""}
            else None
        )
        normalized["actual_weight_kg"] = (
            round(float(normalized.get("actual_weight_kg") or 0), 2)
            if normalized.get("actual_weight_kg") not in {None, ""}
            else None
        )
        normalized["estimated_piece_weight_kg"] = (
            round(float(normalized.get("estimated_piece_weight_kg") or 0), 2)
            if normalized.get("estimated_piece_weight_kg") not in {None, ""}
            else None
        )
        normalized["ratio_label"] = str(normalized.get("ratio_label") or "").strip().upper()
        normalized["ratio_summary"] = str(normalized.get("ratio_summary") or "").strip()
        normalized["grade_requirements"] = self._normalize_store_prep_grade_requirements(normalized.get("grade_requirements") or [])
        normalized["grade_summary"] = str(normalized.get("grade_summary") or "").strip()
        normalized["assigned_employee"] = str(normalized.get("assigned_employee") or "").strip()
        normalized["token_nos"] = [
            str(token_no or "").strip().upper()
            for token_no in normalized.get("token_nos", []) or []
            if str(token_no or "").strip()
        ]
        normalized["status"] = str(normalized.get("status") or "waiting_store_dispatch").strip().lower() or "waiting_store_dispatch"
        normalized["unit_cost_kes"] = (
            round(float(normalized.get("unit_cost_kes") or 0), 2)
            if normalized.get("unit_cost_kes") not in {None, ""}
            else None
        )
        normalized["total_cost_kes"] = (
            round(float(normalized.get("total_cost_kes") or 0), 2)
            if normalized.get("total_cost_kes") not in {None, ""}
            else None
        )
        normalized["label_summary"] = str(normalized.get("label_summary") or "").strip()
        normalized["staging_area"] = str(normalized.get("staging_area") or "").strip()
        return normalized

    def _transfer_dispatch_bale_no(self, transfer_no: str, bale_index: int) -> str:
        transfer_code = self._normalize_code_fragment(transfer_no, "TRF")
        return f"SDB-{transfer_code}-{int(bale_index or 0):03d}"

    def _transfer_delivery_batch_no(self, transfer_no: str) -> str:
        transfer_code = self._normalize_code_fragment(transfer_no, "DB")
        return f"DB-{transfer_code}"

    def _transfer_shipment_session_no(self, transfer_no: str) -> str:
        transfer_code = self._normalize_code_fragment(transfer_no, "SHIP")
        return f"SHIP-{transfer_code}"

    def _store_delivery_execution_order_no(self) -> str:
        serial = next(self._store_delivery_execution_order_ids)
        return f"SDO{datetime.now(timezone.utc).strftime('%y%m%d')}{serial:03d}"

    def _physical_label_machine_code(
        self,
        display_code: str,
        code_type: str,
        source_reference: str = "",
    ) -> str:
        normalized_display = str(display_code or "").strip().upper()
        normalized_type = str(code_type or "").strip().upper()
        normalized_source_reference = str(source_reference or "").strip().upper()
        type_digit_map = {
            "RAW_BALE": "1",
            "SDB": "2",
            "STORE_PREP_BALE": "2",
            "LPK": "3",
            "SDO": "4",
            "STORE_ITEM": "5",
        }
        type_digit = type_digit_map.get(normalized_type, "")
        if not normalized_display or not type_digit:
            return normalized_display
        digits_source = normalized_display
        if normalized_type == "LPK" and normalized_source_reference:
            digits_source = normalized_source_reference
        compact_digits = "".join(ch for ch in digits_source if ch.isdigit())
        if len(compact_digits) >= 9:
            return f"{type_digit}{compact_digits[-9:]}"
        return normalized_display

    def _normalize_store_delivery_execution_order(self, row: dict[str, Any]) -> dict[str, Any]:
        normalized = dict(row or {})
        execution_order_no = str(
            normalized.get("execution_order_no")
            or normalized.get("official_delivery_barcode")
            or self._store_delivery_execution_order_no()
        ).strip().upper()
        source_transfer_no = str(
            normalized.get("source_transfer_no")
            or normalized.get("replenishment_request_no")
            or normalized.get("transfer_no")
            or ""
        ).strip().upper()
        source_bales = normalized.get("source_store_prep_bale_codes") or normalized.get("source_bale_codes") or []
        source_gap_tasks = normalized.get("source_gap_fill_task_codes") or normalized.get("source_loose_pick_task_codes") or []
        raw_packages = normalized.get("packages") if isinstance(normalized.get("packages"), list) else []
        normalized_packages: list[dict[str, Any]] = []
        for package in raw_packages:
            if not isinstance(package, dict):
                continue
            source_type = str(package.get("source_type") or "").strip().upper()
            source_code = str(package.get("source_code") or package.get("bale_no") or "").strip().upper()
            raw_item_count = (
                package.get("item_count")
                if package.get("item_count") not in {None, ""}
                else package.get("qty")
                if package.get("qty") not in {None, ""}
                else package.get("quantity")
                if package.get("quantity") not in {None, ""}
                else package.get("piece_count")
                if package.get("piece_count") not in {None, ""}
                else package.get("pieces")
            )
            item_count: Optional[int] = None
            if raw_item_count is not None and raw_item_count != "":
                try:
                    parsed_count = int(float(raw_item_count))
                    if parsed_count >= 0:
                        item_count = parsed_count
                except (TypeError, ValueError):
                    item_count = None
            normalized_packages.append(
                {
                    "source_type": source_type,
                    "source_code": source_code,
                    "item_count": item_count,
                    "category_summary": str(package.get("category_summary") or package.get("category_name") or "").strip(),
                    "category_name": str(package.get("category_name") or package.get("category_summary") or "").strip(),
                }
            )
        explicit_total_item_count = normalized.get("total_item_count")
        total_item_count: Optional[int] = None
        if explicit_total_item_count is not None and explicit_total_item_count != "":
            try:
                parsed_total = int(float(explicit_total_item_count))
                if parsed_total >= 0:
                    total_item_count = parsed_total
            except (TypeError, ValueError):
                total_item_count = None
        if total_item_count is None and normalized_packages:
            package_counts = [pkg.get("item_count") for pkg in normalized_packages if pkg.get("item_count") is not None]
            if len(package_counts) == len(normalized_packages):
                total_item_count = sum(int(value) for value in package_counts)
        status = str(normalized.get("status") or "pending_print").strip().lower() or "pending_print"
        created_at = normalized.get("created_at") or now_iso()
        machine_code = self._physical_label_machine_code(execution_order_no, "SDO")
        normalized.update(
            {
                "execution_order_no": execution_order_no,
                "official_delivery_barcode": execution_order_no,
                "machine_code": machine_code,
                "source_transfer_no": source_transfer_no,
                "replenishment_request_no": source_transfer_no,
                "from_warehouse_code": str(normalized.get("from_warehouse_code") or "").strip().upper(),
                "to_store_code": str(normalized.get("to_store_code") or "").strip().upper(),
                "source_store_prep_bale_codes": [
                    str(value or "").strip().upper() for value in source_bales if str(value or "").strip()
                ],
                "source_gap_fill_task_codes": [
                    str(value or "").strip().upper() for value in source_gap_tasks if str(value or "").strip()
                ],
                "package_count": max(
                    len(normalized_packages),
                    max(0, int(normalized.get("package_count") or 0)),
                ),
                "total_item_count": total_item_count,
                "packages": normalized_packages,
                "status": status,
                "created_by": str(normalized.get("created_by") or "").strip(),
                "created_at": str(created_at),
                "printed_at": normalized.get("printed_at"),
                "received_at": normalized.get("received_at"),
                "notes": str(normalized.get("notes") or "").strip(),
                "print_payload": {
                    "symbology": "Code128",
                    "display_code": execution_order_no,
                    "human_readable": execution_order_no,
                    "machine_code": machine_code,
                    "barcode_value": machine_code,
                },
            }
        )
        return normalized

    def _default_store_price_kes(self, unit_cost_kes: Optional[float]) -> Optional[float]:
        if unit_cost_kes is None:
            return None
        base_cost = float(unit_cost_kes or 0.0)
        if base_cost <= 0:
            return None
        return round(base_cost * 2.2, 2)

    def _refresh_store_dispatch_bale_summary(self, bale: dict[str, Any]) -> None:
        token_rows = [
            self.item_barcode_tokens.get(str(token_no or "").strip().upper())
            for token_no in bale.get("token_nos", [])
        ]
        token_rows = [row for row in token_rows if row]
        bale["flow_type"] = str(bale.get("flow_type") or "sorting").strip().lower() or "sorting"
        if token_rows:
            bale["item_count"] = len(token_rows)
            bale["edited_count"] = sum(
                1 for row in token_rows if row.get("selling_price_kes") is not None and str(row.get("store_rack_code") or "").strip()
            )
            bale["printed_count"] = sum(1 for row in token_rows if str(row.get("status") or "").strip().lower() in {"printed_in_store", "shelved_in_store"})
            bale["shelved_count"] = sum(1 for row in token_rows if str(row.get("status") or "").strip().lower() == "shelved_in_store")
        else:
            bale["item_count"] = max(0, int(bale.get("item_count") or 0))
            bale["edited_count"] = int(bale.get("edited_count") or 0)
            bale["printed_count"] = int(bale.get("printed_count") or 0)
            bale["shelved_count"] = int(bale.get("shelved_count") or 0)
        category_names = sorted({str(row.get("category_name") or "").strip() for row in token_rows if str(row.get("category_name") or "").strip()})
        grades = sorted({str(row.get("grade") or "").strip() for row in token_rows if str(row.get("grade") or "").strip()})
        bale["category_count"] = len(category_names)
        bale["category_summary"] = "、".join(category_names[:3]) if category_names else str(bale.get("category_name") or "").strip()
        if len(category_names) > 1:
            bale["category_name"] = "mixed categories"
        elif category_names:
            bale["category_name"] = category_names[0]
        if len(grades) > 1:
            bale["grade"] = "mixed"
        elif grades:
            bale["grade"] = grades[0]
        if bale.get("shelved_count") and bale["shelved_count"] == bale["item_count"]:
            bale["status"] = "completed"
        elif bale["printed_count"]:
            bale["status"] = "processing"
        elif str(bale.get("assigned_employee") or "").strip():
            bale["status"] = "assigned"
        elif bale.get("accepted_at"):
            bale["status"] = "received"
        elif bale.get("dispatched_at"):
            bale["status"] = "in_transit"
        elif bale.get("labelled_at"):
            bale["status"] = "labelled"
        elif bale.get("packed_at"):
            bale["status"] = "packed"
        else:
            bale["status"] = "created"
        bale["clerk_assignment"] = {
            "entity_type": "clerk_assignment",
            "bale_no": str(bale.get("bale_no") or "").strip().upper(),
            "store_code": str(bale.get("store_code") or "").strip().upper(),
            "assigned_employee": str(bale.get("assigned_employee") or "").strip(),
            "flow_type": bale["flow_type"],
            "item_count": bale["item_count"],
            "assigned_at": bale.get("assigned_at"),
            "note": str(bale.get("assignment_note") or "").strip(),
            "status": bale["status"],
        }
        bale["updated_at"] = now_iso()

    def _is_store_clerk_actor(self, actor: dict[str, Any]) -> bool:
        return str((actor or {}).get("role_code") or "").strip().lower() in {"store_clerk", "clerk", "store_staff", "sales_clerk"}

    def _enforce_store_clerk_assignment(self, actor: dict[str, Any], assigned_employee: str, scope_label: str) -> None:
        if not self._is_store_clerk_actor(actor):
            return
        normalized_assigned = str(assigned_employee or "").strip()
        if not normalized_assigned:
            raise HTTPException(status_code=409, detail=f"{scope_label} 还没绑定店员，不能开始店员上架作业")
        if normalized_assigned.lower() != str(actor.get("username") or "").strip().lower():
            raise HTTPException(status_code=403, detail=f"{scope_label} 当前绑定店员是 {normalized_assigned}，不是 {actor.get('username')}")

    def _rebuild_store_dispatch_bales(self) -> None:
        grouped_rows: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in self.item_barcode_tokens.values():
            task_no = str(row.get("task_no") or "").strip().upper()
            token_group_no = int(row.get("token_group_no") or 0)
            bale_no = str(row.get("store_dispatch_bale_no") or "").strip().upper()
            if not bale_no and task_no and token_group_no > 0:
                bale_no = self._store_dispatch_bale_no(task_no, token_group_no)
            if not bale_no:
                continue
            grouped_rows[bale_no].append(row)

        existing_keys = set()
        for bale_no, rows in grouped_rows.items():
            rows = sorted(rows, key=lambda item: int(item.get("qty_index") or 0))
            first = rows[0]
            task_no = str(first.get("task_no") or "").strip().upper()
            token_group_no = int(first.get("token_group_no") or 0)
            existing_keys.add(bale_no)
            bale = self.store_dispatch_bales.get(bale_no)
            if not bale:
                bale = {
                    "bale_no": bale_no,
                    "task_no": task_no,
                    "shipment_no": str(first.get("shipment_no") or "").strip().upper(),
                    "token_group_no": token_group_no,
                    "category_name": str(first.get("category_name") or "").strip(),
                    "grade": str(first.get("grade") or "").strip(),
                    "token_nos": [],
                    "item_count": 0,
                    "status": "created",
                    "store_code": str(first.get("store_code") or "").strip().upper(),
                    "accepted_at": first.get("accepted_at"),
                    "accepted_by": str(first.get("accepted_by") or "").strip(),
                    "accepted_note": str(first.get("accepted_note") or "").strip(),
                    "assigned_employee": str(first.get("assigned_employee") or "").strip(),
                    "assigned_at": first.get("assigned_at"),
                    "assignment_note": str(first.get("assignment_note") or "").strip(),
                    "edited_count": 0,
                    "printed_count": 0,
                    "shelved_count": 0,
                    "transfer_no": str(first.get("transfer_no") or "").strip().upper(),
                    "packed_at": first.get("packed_at"),
                    "packed_by": str(first.get("packed_by") or "").strip(),
                    "labelled_at": first.get("labelled_at"),
                    "dispatched_at": first.get("dispatched_at"),
                    "dispatched_by": str(first.get("dispatched_by") or "").strip(),
                    "category_count": 0,
                    "category_summary": "",
                    "created_at": str(first.get("created_at") or now_iso()),
                    "updated_at": str(first.get("updated_at") or now_iso()),
                }
                self.store_dispatch_bales[bale_no] = bale
            bale["task_no"] = task_no
            bale["shipment_no"] = str(first.get("shipment_no") or "").strip().upper()
            bale["token_group_no"] = token_group_no
            bale["category_name"] = str(bale.get("category_name") or first.get("category_name") or "").strip()
            bale["grade"] = str(bale.get("grade") or first.get("grade") or "").strip()
            bale["token_nos"] = [str(row.get("token_no") or "").strip().upper() for row in rows if str(row.get("token_no") or "").strip()]
            bale["transfer_no"] = str(bale.get("transfer_no") or first.get("transfer_no") or "").strip().upper()
            if not str(bale.get("store_code") or "").strip():
                bale["store_code"] = str(first.get("store_code") or "").strip().upper()
            if not str(bale.get("assigned_employee") or "").strip():
                bale["assigned_employee"] = str(first.get("assigned_employee") or "").strip()
            if not bale.get("packed_at") and first.get("packed_at"):
                bale["packed_at"] = first.get("packed_at")
            if not str(bale.get("packed_by") or "").strip() and first.get("packed_by"):
                bale["packed_by"] = str(first.get("packed_by") or "").strip()
            if not bale.get("labelled_at") and first.get("labelled_at"):
                bale["labelled_at"] = first.get("labelled_at")
            if not bale.get("dispatched_at") and first.get("dispatched_at"):
                bale["dispatched_at"] = first.get("dispatched_at")
            if not str(bale.get("dispatched_by") or "").strip() and first.get("dispatched_by"):
                bale["dispatched_by"] = str(first.get("dispatched_by") or "").strip()
            self._refresh_store_dispatch_bale_summary(bale)

        for bale_no, bale in list(self.store_dispatch_bales.items()):
            if bale_no in existing_keys:
                continue
            if str(bale.get("transfer_no") or "").strip() and not bale.get("token_nos"):
                existing_keys.add(bale_no)
                self._refresh_store_dispatch_bale_summary(bale)

        stale_keys = [key for key in self.store_dispatch_bales.keys() if key not in existing_keys]
        for key in stale_keys:
            del self.store_dispatch_bales[key]

    def _sync_transfer_dispatch_progress(self, transfer_no: str) -> None:
        normalized_transfer_no = str(transfer_no or "").strip().upper()
        if not normalized_transfer_no:
            return
        order = self.transfer_orders.get(normalized_transfer_no)
        if not order:
            return
        self._rebuild_store_dispatch_bales()
        rows = [
            bale for bale in self.store_dispatch_bales.values()
            if str(bale.get("transfer_no") or "").strip().upper() == normalized_transfer_no
        ]
        order["dispatch_bale_nos"] = [str(bale.get("bale_no") or "").strip().upper() for bale in rows]
        order["dispatch_bale_count"] = len(rows)
        order["accepted_dispatch_bale_count"] = sum(
            1 for bale in rows if str(bale.get("status") or "").strip().lower() in {"received", "assigned", "processing", "completed"}
        )
        order["completed_dispatch_bale_count"] = sum(
            1 for bale in rows if str(bale.get("status") or "").strip().lower() == "completed"
        )
        if not rows:
            return
        if order["completed_dispatch_bale_count"] == len(rows):
            order["status"] = "closed"
            order["store_receipt_status"] = "received"
            order["closed_at"] = order.get("closed_at") or now_iso()
        elif order["accepted_dispatch_bale_count"] == len(rows):
            order["status"] = "received"
            order["store_receipt_status"] = "received"
        elif order["accepted_dispatch_bale_count"] > 0:
            order["status"] = "partially_received"
            order["store_receipt_status"] = "partial"
        elif any(str(bale.get("status") or "").strip().lower() == "in_transit" for bale in rows):
            order["status"] = "shipped"
            order["store_receipt_status"] = "pending_receipt"
        elif any(str(bale.get("status") or "").strip().lower() in {"labelled", "packed", "created"} for bale in rows):
            order["status"] = "packed"
            order["store_receipt_status"] = "not_started"

    def _build_transfer_dispatch_bales(self, order: dict[str, Any], actor: str, grouping_mode: str = "by_category", max_items_per_bale: int = 30) -> list[dict[str, Any]]:
        normalized_transfer_no = str(order.get("transfer_no") or "").strip().upper()
        existing = [
            bale for bale in self.store_dispatch_bales.values()
            if str(bale.get("transfer_no") or "").strip().upper() == normalized_transfer_no
        ]
        if existing:
            for bale in existing:
                self._refresh_store_dispatch_bale_summary(bale)
            self._sync_transfer_dispatch_progress(normalized_transfer_no)
            return sorted(existing, key=lambda row: str(row.get("bale_no") or ""))

        demand_lines = [
            row for row in (order.get("demand_lines") or [])
            if int(row.get("requested_qty") or 0) > 0
        ]
        desired_count = sum(int(item.get("approved_qty") or item.get("requested_qty") or 0) for item in order.get("items", []))
        if desired_count <= 0 and demand_lines:
            desired_count = sum(int(row.get("requested_qty") or 0) for row in demand_lines)
        if desired_count <= 0:
            return []
        eligible_rows = [
            row for row in self.item_barcode_tokens.values()
            if str(row.get("status") or "").strip().lower() in {"pending_store_print", "print_failed"}
            and not str(row.get("assigned_employee") or "").strip()
            and not str(row.get("accepted_by") or "").strip()
        ]
        eligible_rows.sort(
            key=lambda row: (
                str(row.get("shipment_no") or ""),
                str(row.get("task_no") or ""),
                str(row.get("category_name") or ""),
                int(row.get("token_group_no") or 0),
                int(row.get("qty_index") or 0),
            )
        )
        selected_rows = eligible_rows[:desired_count]
        if not selected_rows:
            if demand_lines:
                normalized_grouping_mode = str(grouping_mode or "by_category").strip().lower()
                max_items = max(1, int(max_items_per_bale or 100))
                created_at = now_iso()
                created_bales: list[dict[str, Any]] = []
                bale_index = 1
                for line in demand_lines:
                    remaining_qty = int(line.get("requested_qty") or 0)
                    category_main = str(line.get("category_main") or "").strip()
                    category_sub = str(line.get("category_sub") or "").strip()
                    category_name = " / ".join(part for part in [category_main, category_sub] if part) or "mixed categories"
                    while remaining_qty > 0:
                        item_count = min(max_items, remaining_qty)
                        bale_no = self._transfer_dispatch_bale_no(normalized_transfer_no, bale_index)
                        bale = {
                            "bale_no": bale_no,
                            "task_no": "",
                            "shipment_no": "",
                            "token_group_no": 0,
                            "category_name": category_name,
                            "grade": "mixed",
                            "token_nos": [],
                            "item_count": item_count,
                            "status": "ready_dispatch",
                            "store_code": str(order.get("to_store_code") or "").strip().upper(),
                            "accepted_at": None,
                            "accepted_by": "",
                            "accepted_note": "",
                            "assigned_employee": "",
                            "assigned_at": None,
                            "assignment_note": "",
                            "edited_count": 0,
                            "printed_count": 0,
                            "shelved_count": 0,
                            "transfer_no": normalized_transfer_no,
                            "packed_at": created_at,
                            "packed_by": actor,
                            "labelled_at": created_at,
                            "dispatched_at": None,
                            "dispatched_by": "",
                            "category_count": 1,
                            "category_summary": category_name,
                            "created_at": created_at,
                            "updated_at": created_at,
                        }
                        self.store_dispatch_bales[bale_no] = bale
                        self._refresh_store_dispatch_bale_summary(bale)
                        created_bales.append(bale)
                        remaining_qty -= item_count
                        bale_index += 1
                order["dispatch_bundle_created_at"] = created_at
                order["dispatch_bundle_created_by"] = actor
                order["delivery_batch_no"] = order.get("delivery_batch_no") or self._transfer_delivery_batch_no(normalized_transfer_no)
                order["dispatch_bale_nos"] = [str(bale.get("bale_no") or "").strip().upper() for bale in created_bales]
                order["dispatch_grouping_mode"] = normalized_grouping_mode
                order["dispatch_max_items_per_bale"] = max_items
                order["status"] = "packed"
                order["store_receipt_status"] = "not_started"
                self._sync_transfer_dispatch_progress(normalized_transfer_no)
                return created_bales
            return []

        normalized_grouping_mode = str(grouping_mode or "by_category").strip().lower()
        max_items = max(1, int(max_items_per_bale or 30))
        grouped_chunks: list[list[dict[str, Any]]] = []
        if normalized_grouping_mode == "mixed":
            for index in range(0, len(selected_rows), max_items):
                grouped_chunks.append(selected_rows[index:index + max_items])
        else:
            grouped_by_category: dict[str, list[dict[str, Any]]] = defaultdict(list)
            for row in selected_rows:
                grouped_by_category[str(row.get("category_name") or "").strip() or "mixed categories"].append(row)
            for rows in grouped_by_category.values():
                for index in range(0, len(rows), max_items):
                    grouped_chunks.append(rows[index:index + max_items])

        created_at = now_iso()
        created_bales: list[dict[str, Any]] = []
        for bale_index, rows in enumerate(grouped_chunks, start=1):
            first = rows[0]
            bale_no = self._transfer_dispatch_bale_no(normalized_transfer_no, bale_index)
            bale = {
                "bale_no": bale_no,
                "task_no": str(first.get("task_no") or "").strip().upper(),
                "shipment_no": str(first.get("shipment_no") or "").strip().upper(),
                "token_group_no": 0,
                "category_name": str(first.get("category_name") or "").strip() or "mixed categories",
                "grade": str(first.get("grade") or "").strip() or "mixed",
                "token_nos": [str(row.get("token_no") or "").strip().upper() for row in rows],
                "item_count": len(rows),
                "status": "ready_dispatch",
                "store_code": str(order.get("to_store_code") or "").strip().upper(),
                "accepted_at": None,
                "accepted_by": "",
                "accepted_note": "",
                "assigned_employee": "",
                "assigned_at": None,
                "assignment_note": "",
                "edited_count": 0,
                "printed_count": 0,
                "shelved_count": 0,
                "transfer_no": normalized_transfer_no,
                "packed_at": created_at,
                "packed_by": actor,
                "labelled_at": created_at,
                "dispatched_at": None,
                "dispatched_by": "",
                "category_count": 0,
                "category_summary": "",
                "created_at": created_at,
                "updated_at": created_at,
            }
            self.store_dispatch_bales[bale_no] = bale
            for row in rows:
                row["store_dispatch_bale_no"] = bale_no
                row["store_code"] = str(order.get("to_store_code") or "").strip().upper()
                row["transfer_no"] = normalized_transfer_no
                row["packed_at"] = created_at
                row["packed_by"] = actor
                row["labelled_at"] = created_at
                row["dispatched_at"] = ""
                row["dispatched_by"] = ""
                row["updated_at"] = created_at
            self._refresh_store_dispatch_bale_summary(bale)
            created_bales.append(bale)

        order["dispatch_bundle_created_at"] = created_at
        order["dispatch_bundle_created_by"] = actor
        order["delivery_batch_no"] = order.get("delivery_batch_no") or self._transfer_delivery_batch_no(normalized_transfer_no)
        order["dispatch_bale_nos"] = [str(bale.get("bale_no") or "").strip().upper() for bale in created_bales]
        order["dispatch_grouping_mode"] = normalized_grouping_mode
        order["dispatch_max_items_per_bale"] = max_items
        order["status"] = "packed"
        order["store_receipt_status"] = "not_started"
        self._sync_transfer_dispatch_progress(normalized_transfer_no)
        return created_bales

    def _drop_sorting_item_tokens_for_task(self, task_no: str) -> None:
        normalized_task_no = str(task_no or "").strip().upper()
        if not normalized_task_no:
            return
        stale_keys = [
            token_no
            for token_no, row in self.item_barcode_tokens.items()
            if str(row.get("task_no") or "").strip().upper() == normalized_task_no
        ]
        for token_no in stale_keys:
            del self.item_barcode_tokens[token_no]
        stale_bale_keys = [
            bale_no
            for bale_no, bale in self.store_dispatch_bales.items()
            if str(bale.get("task_no") or "").strip().upper() == normalized_task_no
        ]
        for bale_no in stale_bale_keys:
            del self.store_dispatch_bales[bale_no]

    def _sorting_task_source_tokens(self, task: dict[str, Any]) -> tuple[list[str], list[str]]:
        source_bale_tokens: list[str] = []
        source_pool_tokens: list[str] = []
        for bale_barcode in task.get("bale_barcodes", []) or []:
            bale = self._find_raw_bale_by_reference_no_defaults(str(bale_barcode).strip().upper())
            if not bale:
                continue
            source_bale_token = str(bale.get("source_bale_token") or "").strip()
            if source_bale_token and source_bale_token not in source_bale_tokens:
                source_bale_tokens.append(source_bale_token)
            source_pool_token = re.sub(r"-\d{3}$", "", source_bale_token) if source_bale_token else ""
            if source_pool_token and source_pool_token not in source_pool_tokens:
                source_pool_tokens.append(source_pool_token)
        return source_bale_tokens, source_pool_tokens

    def _raw_bale_has_completed_source_cost(self, bale: dict[str, Any]) -> bool:
        source_bale_token = str(bale.get("source_bale_token") or "").strip()
        if not source_bale_token:
            return False
        raw_record, source_line = self._find_china_source_line_by_token(source_bale_token)
        if not raw_record or not source_line:
            return False
        source_record = self._build_china_source_record_response(raw_record)
        return self._china_source_cost_per_kg_kes(source_record) > 0

    def _china_source_combined_cost_kes(self, record: dict[str, Any]) -> float:
        goods_cost_kes = round(
            sum(
                _convert_amount_to_kes(
                    round(float(line.get("unit_cost_amount") or 0) * int(line.get("package_count") or 0), 2),
                    line.get("unit_cost_currency"),
                )
                for line in record.get("lines") or []
            ),
            2,
        )
        cost_entries = record.get("cost_entries") or {}
        extra_cost_kes = round(
            sum(
                _convert_amount_to_kes(
                    (cost_entries.get(key) or {}).get("amount"),
                    (cost_entries.get(key) or {}).get("currency"),
                )
                for key in ("head_transport", "customs_clearance", "tail_transport")
            ),
            2,
        )
        return round(goods_cost_kes + extra_cost_kes, 2)

    def _china_source_cost_per_kg_kes(self, record: dict[str, Any]) -> float:
        total_weight_kg = round(float(record.get("domestic_total_weight_kg") or 0), 2)
        if total_weight_kg <= 0:
            return 0.0
        return round(self._china_source_combined_cost_kes(record) / total_weight_kg, 2)

    def _sorting_selected_bale_weight_kg(
        self,
        bale: dict[str, Any],
        source_line: Optional[dict[str, Any]] = None,
    ) -> float:
        bale_weight_kg = round(float(bale.get("weight_kg") or 0), 2)
        if bale_weight_kg > 0:
            return bale_weight_kg
        if source_line:
            unit_weight_kg = round(float(source_line.get("unit_weight_kg") or 0), 2)
            if unit_weight_kg > 0:
                return unit_weight_kg
            package_count = int(source_line.get("package_count") or 0)
            total_weight_kg = round(float(source_line.get("total_weight_kg") or 0), 2)
            if package_count > 0 and total_weight_kg > 0:
                return round(total_weight_kg / package_count, 2)
        return 0.0

    def _get_sorting_standard_piece_weight_kg(self, category_name: str) -> float:
        category_main, category_sub = self._parse_sorting_category_name(category_name)
        if not category_main or not category_sub:
            return 0.0
        piece_weight = self.apparel_piece_weights.get(self._apparel_piece_weight_key(category_main, category_sub))
        if not piece_weight:
            return 0.0
        return round(float(piece_weight.get("standard_weight_kg") or 0), 2)

    def _collect_sorting_task_source_context(self, task: dict[str, Any]) -> dict[str, Any]:
        source_bale_tokens: list[str] = []
        source_pool_tokens: list[str] = []
        source_entry_map: dict[str, dict[str, Any]] = {}
        missing_source_count = 0

        for bale_barcode in task.get("bale_barcodes", []) or []:
            bale = self._find_raw_bale_by_reference_no_defaults(str(bale_barcode).strip().upper())
            if not bale:
                missing_source_count += 1
                continue
            source_bale_token = str(bale.get("source_bale_token") or "").strip()
            if not source_bale_token:
                missing_source_count += 1
                continue
            if source_bale_token not in source_bale_tokens:
                source_bale_tokens.append(source_bale_token)
            source_pool_token = re.sub(r"-\d{3}$", "", source_bale_token)
            if source_pool_token and source_pool_token not in source_pool_tokens:
                source_pool_tokens.append(source_pool_token)
            entry = source_entry_map.setdefault(
                source_bale_token,
                {
                    "source_bale_token": source_bale_token,
                    "source_pool_token": source_pool_token,
                    "selected_weight_kg": 0.0,
                    "combined_cost_kes": 0.0,
                    "has_cost_pool": False,
                },
            )
            entry["selected_weight_kg"] = round(
                float(entry.get("selected_weight_kg") or 0) + self._sorting_selected_bale_weight_kg(bale),
                2,
            )

        resolved_entries: list[dict[str, Any]] = []
        missing_pool_count = 0
        for source_bale_token in source_bale_tokens:
            entry = source_entry_map[source_bale_token]
            raw_record, source_line = self._find_china_source_line_by_token(source_bale_token)
            if not raw_record or not source_line:
                missing_source_count += 1
                continue
            source_record = self._build_china_source_record_response(raw_record)
            source_pool_token = str(source_line.get("source_pool_token") or source_record.get("source_pool_token") or entry.get("source_pool_token") or "").strip()
            if source_pool_token and source_pool_token not in source_pool_tokens:
                source_pool_tokens.append(source_pool_token)
            selected_weight_kg = entry["selected_weight_kg"]
            if selected_weight_kg <= 0:
                selected_weight_kg = self._sorting_selected_bale_weight_kg({}, source_line)
            cost_per_kg_kes = self._china_source_cost_per_kg_kes(source_record)
            has_cost_pool = cost_per_kg_kes > 0
            if not has_cost_pool:
                missing_pool_count += 1
            resolved_entries.append(
                {
                    "source_bale_token": source_bale_token,
                    "source_pool_token": source_pool_token,
                    "selected_weight_kg": round(selected_weight_kg, 2),
                    "combined_cost_kes": round(selected_weight_kg * cost_per_kg_kes, 2) if has_cost_pool else 0.0,
                    "has_cost_pool": has_cost_pool,
                }
            )

        return {
            "source_bale_tokens": source_bale_tokens,
            "source_pool_tokens": source_pool_tokens,
            "resolved_entries": resolved_entries,
            "missing_source_count": missing_source_count,
            "missing_pool_count": missing_pool_count,
        }

    def _build_sorting_task_cost_snapshot(
        self,
        task: dict[str, Any],
        result_items: list[dict[str, Any]],
        loss_record: dict[str, Any],
    ) -> dict[str, Any]:
        source_context = self._collect_sorting_task_source_context(task)
        source_bale_tokens = source_context["source_bale_tokens"]
        source_pool_tokens = source_context["source_pool_tokens"]
        resolved_entries = source_context["resolved_entries"]
        resolved_cost_entries = [entry for entry in resolved_entries if entry.get("has_cost_pool")]
        total_qty = sum(int(row.get("qty") or 0) for row in result_items or [])
        total_source_weight_kg = round(
            sum(float(entry.get("selected_weight_kg") or 0) for entry in resolved_cost_entries),
            2,
        )
        total_estimated_cost_kes = round(
            sum(float(entry.get("combined_cost_kes") or 0) for entry in resolved_cost_entries),
            2,
        )
        sellable_weight_kg = round(
            max(0.0, total_source_weight_kg - float(loss_record.get("loss_weight_kg") or 0)),
            2,
        )
        row_estimates = []
        for row_index, row in enumerate(result_items or []):
            qty = int(row.get("qty") or 0)
            actual_weight_kg = round(
                float(
                    row.get("actual_weight_kg")
                    or row.get("weight_kg")
                    or row.get("estimated_total_weight_kg")
                    or 0
                ),
                2,
            )
            row_estimates.append(
                {
                    "row_index": row_index,
                    "category_name": str(row.get("category_name") or "").strip(),
                    "qty": qty,
                    "actual_weight_kg": actual_weight_kg,
                    "estimated_total_weight_kg": actual_weight_kg,
                    "estimated_unit_cost_kes": None,
                    "estimated_total_cost_kes": None,
                    "allocation_mode": "",
                    "has_actual_weight": actual_weight_kg > 0,
                }
            )

        if not source_bale_tokens:
            return {
                "cost_status": "pending_source_link",
                "estimated_unit_cost_kes": None,
                "cost_model_code": "",
                "cost_locked_at": None,
                "source_bale_tokens": [],
                "source_pool_tokens": [],
                "row_estimates": row_estimates,
            }
        if (
            source_context["missing_source_count"] > 0
            or source_context["missing_pool_count"] > 0
            or not resolved_cost_entries
        ):
            return {
                "cost_status": "partial_source_link",
                "estimated_unit_cost_kes": None,
                "cost_model_code": "",
                "cost_locked_at": None,
                "source_bale_tokens": source_bale_tokens,
                "source_pool_tokens": source_pool_tokens,
                "row_estimates": row_estimates,
            }
        if total_qty <= 0 or total_estimated_cost_kes <= 0:
            return {
                "cost_status": "pending_allocation",
                "estimated_unit_cost_kes": None,
                "cost_model_code": "",
                "cost_locked_at": None,
                "source_bale_tokens": source_bale_tokens,
                "source_pool_tokens": source_pool_tokens,
                "row_estimates": row_estimates,
            }
        if loss_record.get("has_loss") and float(loss_record.get("loss_weight_kg") or 0) >= total_source_weight_kg:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"loss_weight_kg {round(float(loss_record.get('loss_weight_kg') or 0), 2):.2f} "
                    f"must be less than source weight {total_source_weight_kg:.2f}"
                ),
            )

        all_rows_have_weight = bool(row_estimates) and all(row["has_actual_weight"] for row in row_estimates)
        result_weight_base_kg = round(
            sum(float(row["actual_weight_kg"] or 0) for row in row_estimates),
            2,
        )
        if all_rows_have_weight:
            loss_weight_kg = round(float(loss_record.get("loss_weight_kg") or 0), 2)
            weight_gap_kg = round(total_source_weight_kg - result_weight_base_kg - loss_weight_kg, 2)
            if abs(weight_gap_kg) > 1:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"result weight {result_weight_base_kg:.2f} KG plus loss_weight_kg "
                        f"{loss_weight_kg:.2f} KG must match source weight {total_source_weight_kg:.2f} KG "
                        f"within 1.00 KG tolerance; current gap is {weight_gap_kg:.2f} KG"
                    ),
                )
            allocation_weight_base_kg = (
                sellable_weight_kg
                if loss_record.get("has_loss")
                else result_weight_base_kg
            )
            locked_row_estimates = []
            for row in row_estimates:
                estimated_total_cost_kes = (
                    round(total_estimated_cost_kes * (float(row["estimated_total_weight_kg"]) / allocation_weight_base_kg), 2)
                    if allocation_weight_base_kg > 0
                    else None
                )
                estimated_unit_cost_kes = (
                    round(estimated_total_cost_kes / row["qty"], 2)
                    if estimated_total_cost_kes is not None and row["qty"] > 0
                    else None
                )
                locked_row_estimates.append(
                    {
                        **row,
                        "estimated_unit_cost_kes": estimated_unit_cost_kes,
                        "estimated_total_cost_kes": estimated_total_cost_kes,
                        "allocation_mode": "actual_weight",
                    }
                )
            total_allocated_cost_kes = round(
                sum(float(row["estimated_total_cost_kes"] or 0) for row in locked_row_estimates),
                2,
            )
            estimated_unit_cost_kes = round(total_allocated_cost_kes / total_qty, 2) if total_qty > 0 else None
            return {
                "cost_status": "cost_locked" if estimated_unit_cost_kes is not None else "pending_allocation",
                "estimated_unit_cost_kes": estimated_unit_cost_kes,
                "cost_model_code": "sorting_actual_weight_v3" if estimated_unit_cost_kes is not None else "",
                "cost_locked_at": now_iso() if estimated_unit_cost_kes is not None else None,
                "source_bale_tokens": source_bale_tokens,
                "source_pool_tokens": source_pool_tokens,
                "row_estimates": locked_row_estimates,
            }

        return {
            "cost_status": "pending_allocation",
            "estimated_unit_cost_kes": None,
            "cost_model_code": "",
            "cost_locked_at": None,
            "source_bale_tokens": source_bale_tokens,
            "source_pool_tokens": source_pool_tokens,
            "row_estimates": row_estimates,
        }

    def _reconcile_sorting_item_tokens(self) -> bool:
        updated = False
        for task_no, raw_task in self.sorting_tasks.items():
            task = self._ensure_sorting_task_defaults(raw_task)
            task_bale_barcodes = [
                str(code).strip().upper()
                for code in task.get("bale_barcodes", []) or []
                if str(code).strip()
            ]
            task_legacy_bale_barcodes = [
                str(code).strip().upper()
                for code in task.get("legacy_bale_barcodes", []) or []
                if str(code).strip()
            ]
            shipment_no = str(task.get("shipment_no") or "").strip().upper()
            customs_notice_no = str(task.get("customs_notice_no") or "").strip().upper()
            source_bale_tokens, source_pool_tokens = self._sorting_task_source_tokens(task)
            task_generated_preview: list[str] = []
            task_generated_count = 0
            token_serial = 1

            for token_group_no, item in enumerate(task.get("result_items", []) or [], start=1):
                row_qty = int(item.get("generated_token_count") or item.get("qty") or 0)
                if row_qty <= 0:
                    continue
                category_name = str(item.get("category_name") or "").strip()
                grade = str(item.get("grade") or "").strip()
                sku_code = str(item.get("sku_code") or "").strip().upper()
                rack_code = str(item.get("rack_code") or "").strip().upper()
                default_cost_kes = (
                    round(float(item.get("default_cost_kes") or 0), 2)
                    if item.get("default_cost_kes") not in {None, ""}
                    else None
                )
                row_unit_cost_kes = (
                    round(float(item.get("unit_cost_kes") or 0), 2)
                    if item.get("unit_cost_kes") not in {None, ""}
                    else (
                        round(float(task.get("unit_cost_kes") or 0), 2)
                        if task.get("unit_cost_kes") not in {None, ""}
                        else None
                    )
                )
                existing_rows = sorted(
                    [
                        row
                        for row in self.item_barcode_tokens.values()
                        if str(row.get("task_no") or "").strip().upper() == str(task_no).strip().upper()
                        and int(row.get("token_group_no") or 0) == token_group_no
                    ],
                    key=lambda row: int(row.get("qty_index") or 0),
                )
                existing_by_index = {
                    int(row.get("qty_index") or 0): row
                    for row in existing_rows
                    if int(row.get("qty_index") or 0) > 0
                }
                existing_bale_no = next(
                    (
                        str(row.get("store_dispatch_bale_no") or "").strip().upper()
                        for row in existing_rows
                        if str(row.get("store_dispatch_bale_no") or "").strip()
                    ),
                    "",
                )
                group_bale_no = existing_bale_no or self._store_dispatch_bale_no(str(task_no), token_group_no)
                row_preview: list[str] = []

                for qty_index in range(1, row_qty + 1):
                    expected_token_no = self._sorting_item_token_no(str(task_no), token_serial)
                    token_serial += 1
                    task_generated_count += 1
                    token_row = existing_by_index.get(qty_index)
                    if token_row:
                        if not str(token_row.get("barcode_value") or "").strip():
                            token_row["barcode_value"] = self._store_item_barcode_value(str(task_no), token_serial - 1, token_row.get("created_at"))
                            token_row["updated_at"] = now_iso()
                            updated = True
                        if not str(token_row.get("store_dispatch_bale_no") or "").strip():
                            token_row["store_dispatch_bale_no"] = group_bale_no
                            token_row["updated_at"] = now_iso()
                            updated = True
                        row_preview.append(str(token_row.get("token_no") or expected_token_no).strip().upper())
                        if len(task_generated_preview) < 8:
                            task_generated_preview.append(row_preview[-1])
                        continue

                    token_no = expected_token_no
                    while token_no in self.item_barcode_tokens:
                        token_no = f"{expected_token_no}-R{len(self.item_barcode_tokens) + 1}"
                    barcode_value = self._store_item_barcode_value(str(task_no), token_serial - 1)
                    token_row = {
                        "token_no": token_no,
                        "task_no": str(task_no).strip().upper(),
                        "shipment_no": shipment_no,
                        "customs_notice_no": customs_notice_no,
                        "source_bale_barcodes": list(task_bale_barcodes),
                        "source_legacy_bale_barcodes": list(task_legacy_bale_barcodes),
                        "category_name": category_name,
                        "grade": grade,
                        "sku_code": sku_code,
                        "rack_code": rack_code,
                        "default_cost_kes": default_cost_kes,
                        "qty_index": qty_index,
                        "qty_total": row_qty,
                        "token_group_no": token_group_no,
                        "store_dispatch_bale_no": group_bale_no,
                        "identity_no": token_no,
                        "barcode_value": barcode_value,
                        "status": "pending_store_print",
                        "cost_status": str(item.get("cost_status") or task.get("cost_status") or "").strip() or "pending_allocation",
                        "unit_cost_kes": row_unit_cost_kes,
                        "cost_model_code": str(task.get("cost_model_code") or "").strip(),
                        "cost_locked_at": task.get("cost_locked_at"),
                        "source_pool_tokens": list(source_pool_tokens),
                        "source_bale_tokens": list(source_bale_tokens),
                        "suggested_price_kes": self._default_store_price_kes(row_unit_cost_kes),
                        "selling_price_kes": None,
                        "suggested_rack_code": "",
                        "store_rack_code": "",
                        "store_code": "",
                        "assigned_employee": "",
                        "created_at": now_iso(),
                        "updated_at": now_iso(),
                        "created_by": str(task.get("created_by") or "").strip(),
                    }
                    self.item_barcode_tokens[token_no] = token_row
                    row_preview.append(token_no)
                    if len(task_generated_preview) < 8:
                        task_generated_preview.append(token_no)
                    updated = True

                item["generated_token_count"] = row_qty
                item["generated_token_preview"] = row_preview[:4]

            task["generated_token_count"] = task_generated_count
            task["generated_token_preview"] = task_generated_preview

        if updated:
            self._rebuild_store_dispatch_bales()
        return updated

    def _ensure_seed_label_templates(self) -> bool:
        updated = False
        for template in LABEL_TEMPLATES:
            template_code = str(template.get("template_code") or "").strip().lower()
            if not template_code:
                continue
            template_scope = str(template.get("template_scope") or "product").strip().lower()
            if template_scope == "bale" and template_code != LOCKED_BALE_TEMPLATE_CODE:
                continue
            existing = self.label_templates.get(template_code)
            normalized = {
                "template_code": template_code,
                "name": str(template.get("name") or template_code).strip(),
                "template_scope": template_scope,
                "description": str(template.get("description") or "").strip(),
                "width_mm": int(template.get("width_mm") or 60),
                "height_mm": int(template.get("height_mm") or 40),
                "paper_preset": str(template.get("paper_preset") or self._guess_template_paper_preset(template.get("width_mm") or 60, template.get("height_mm") or 40)).strip().lower(),
                "barcode_type": str(template.get("barcode_type") or "Code128").strip() or "Code128",
                "fields": [str(field).strip() for field in template.get("fields", []) if str(field).strip()],
                "layout": self._normalize_label_template_layout(
                    str(template.get("template_scope") or "product").strip().lower(),
                    template.get("layout"),
                    int(template.get("width_mm") or 60),
                    int(template.get("height_mm") or 40),
                ),
                "is_active": bool(template.get("is_active", True)),
            }
            if existing:
                changed = False
                if template_code == "store_loose_pick_60x40":
                    existing_layout = existing.get("layout") if isinstance(existing.get("layout"), dict) else {}
                    existing_components = existing_layout.get("components") if isinstance(existing_layout.get("components"), list) else []
                    existing_component_ids = {
                        str(component.get("id") or "").strip()
                        for component in existing_components
                        if isinstance(component, dict)
                    }
                    existing_fields = existing.get("fields") if isinstance(existing.get("fields"), list) else []
                    if "store_loose_pick_packing_list" not in existing_component_ids or "packing_list" not in existing_fields:
                        existing["fields"] = list(normalized["fields"])
                        existing["layout"] = normalized["layout"]
                        existing["description"] = normalized["description"]
                        changed = True
                for key, value in normalized.items():
                    if key not in existing:
                        existing[key] = value
                        changed = True
                if "created_at" not in existing:
                    existing["created_at"] = now_iso()
                    changed = True
                if "created_by" not in existing:
                    existing["created_by"] = "system"
                    changed = True
                if changed:
                    existing["updated_at"] = now_iso()
                    existing.setdefault("updated_by", "system")
                    updated = True
            else:
                self.label_templates[template_code] = {
                    **normalized,
                    "created_at": now_iso(),
                    "created_by": "system",
                    "updated_at": now_iso(),
                    "updated_by": "system",
                }
                updated = True
        return updated

    def _normalize_apparel_grade(self, value: Any) -> str:
        normalized = str(value or "").strip().upper()
        if normalized not in {"P", "S"}:
            raise HTTPException(status_code=400, detail="grade must be P or S")
        return normalized

    def _normalize_money_two_decimals(self, value: Any, field_name: str) -> float:
        try:
            normalized = round(float(value or 0), 2)
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=400, detail=f"{field_name} must be a valid number") from exc
        if normalized <= 0:
            raise HTTPException(status_code=400, detail=f"{field_name} must be greater than 0")
        return normalized

    def _normalize_sorting_loss_record(self, payload: Any = None) -> dict[str, Any]:
        if not isinstance(payload, dict):
            return {
                "has_loss": False,
                "loss_qty": 0,
                "loss_weight_kg": 0.0,
                "note": "",
                "photos": [],
            }
        try:
            raw_loss_qty = int(payload.get("loss_qty") or 0)
        except (TypeError, ValueError):
            raw_loss_qty = 0
        try:
            raw_loss_weight_kg = round(float(payload.get("loss_weight_kg") or 0), 2)
        except (TypeError, ValueError):
            raw_loss_weight_kg = 0.0
        explicit_false = bool(
            payload.get("has_loss") is False
            or str(payload.get("has_loss") if payload.get("has_loss") is not None else "").strip().lower() == "false"
        )
        has_loss = bool(
            not explicit_false and (
            payload.get("has_loss") is True
            or str(payload.get("has_loss") or "").strip().lower() == "true"
            or raw_loss_qty > 0
            or raw_loss_weight_kg > 0
            )
        )
        if not has_loss:
            return {
                "has_loss": False,
                "loss_qty": 0,
                "loss_weight_kg": 0.0,
                "note": "",
                "photos": [],
            }
        try:
            loss_qty = int(payload.get("loss_qty") or 0)
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=400, detail="loss_qty must be an integer") from exc
        try:
            loss_weight_kg = round(float(payload.get("loss_weight_kg") or 0), 2)
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=400, detail="loss_weight_kg must be a valid number") from exc
        photos = []
        for row in payload.get("photos") or []:
            filename = str((row or {}).get("filename") or "").strip()
            data_url = str((row or {}).get("data_url") or "").strip()
            if not filename or not data_url:
                continue
            photos.append(
                {
                    "filename": filename,
                    "content_type": str((row or {}).get("content_type") or "").strip() or "image/jpeg",
                    "data_url": data_url,
                }
            )
        if loss_qty <= 0:
            raise HTTPException(status_code=400, detail="损耗品件数必须大于 0")
        if loss_weight_kg <= 0:
            raise HTTPException(status_code=400, detail="损耗品总重量必须大于 0")
        if not photos:
            raise HTTPException(status_code=400, detail="有损耗品时必须至少上传 1 张照片")
        return {
            "has_loss": True,
            "loss_qty": loss_qty,
            "loss_weight_kg": loss_weight_kg,
            "note": str(payload.get("note") or "").strip(),
            "photos": photos,
        }

    def _apparel_default_cost_key(self, category_main: str, category_sub: str, grade: str) -> str:
        return f"{str(category_main or '').strip().lower()}||{str(category_sub or '').strip().lower()}||{str(grade or '').strip().upper()}"

    def _apparel_sorting_rack_key(self, category_main: str, category_sub: str, grade: str, default_cost_kes: float) -> str:
        return (
            f"{str(category_main or '').strip().lower()}||"
            f"{str(category_sub or '').strip().lower()}||"
            f"{str(grade or '').strip().upper()}||"
            f"{round(float(default_cost_kes or 0), 2):.2f}"
        )

    def _parse_sorting_category_name(self, category_name: str) -> tuple[str, str]:
        parts = [str(part or "").strip() for part in str(category_name or "").split("/") if str(part or "").strip()]
        return parts[0] if parts else "", parts[1] if len(parts) > 1 else ""

    def _find_apparel_default_cost(self, category_main: str, category_sub: str, grade: str) -> Optional[dict[str, Any]]:
        key = self._apparel_default_cost_key(category_main, category_sub, grade)
        return self.apparel_default_costs.get(key)

    def _find_apparel_sorting_rack(
        self,
        category_main: str,
        category_sub: str,
        grade: str,
        default_cost_kes: float,
    ) -> Optional[dict[str, Any]]:
        key = self._apparel_sorting_rack_key(category_main, category_sub, grade, default_cost_kes)
        return self.apparel_sorting_racks.get(key)

    def _resolve_sorting_result_default_cost_kes(
        self,
        category_name: str,
        grade: str,
        supplied_default_cost_kes: Any = None,
    ) -> Optional[float]:
        if supplied_default_cost_kes not in {None, ""}:
            return round(float(supplied_default_cost_kes), 2)
        category_main, category_sub = self._parse_sorting_category_name(category_name)
        if not category_main or not category_sub:
            return None
        record = self._find_apparel_default_cost(category_main, category_sub, grade)
        if not record:
            return None
        return round(float(record.get("default_cost_kes") or 0), 2)

    def _resolve_sorting_result_rack_code(
        self,
        category_name: str,
        grade: str,
        default_cost_kes: Any,
        supplied_rack_code: str = "",
    ) -> str:
        supplied = str(supplied_rack_code or "").strip().upper()
        if supplied:
            return supplied
        category_main, category_sub = self._parse_sorting_category_name(category_name)
        if not category_main or not category_sub or default_cost_kes in {None, ""}:
            return ""
        record = self._find_apparel_sorting_rack(category_main, category_sub, grade, float(default_cost_kes))
        return str(record.get("rack_code") or "").strip().upper() if record else ""

    def _sorting_stock_profile_signature(self, row: dict[str, Any]) -> tuple[str, str, float]:
        return (
            str(row.get("category_name") or "").strip().lower(),
            str(row.get("grade") or "").strip().upper(),
            round(float(row.get("default_cost_kes") or 0), 2),
        )

    def _sorting_stock_token_unit_cost_kes(self, row: dict[str, Any]) -> Optional[float]:
        sku_code = str(row.get("sku_code") or "").strip().upper()
        rack_code = str(row.get("rack_code") or "").strip().upper()
        if not sku_code:
            return None
        weighted_cost = 0.0
        weighted_qty = 0
        for task in self.sorting_tasks.values():
            for result_row in task.get("result_items", []):
                if str(result_row.get("sku_code") or "").strip().upper() != sku_code:
                    continue
                if rack_code and str(result_row.get("rack_code") or "").strip().upper() != rack_code:
                    continue
                unit_cost_kes = result_row.get("unit_cost_kes")
                qty = int(result_row.get("generated_token_count") or result_row.get("qty") or 0)
                if unit_cost_kes in {None, ""} or qty <= 0:
                    continue
                weighted_cost += round(float(unit_cost_kes), 2) * qty
                weighted_qty += qty
        if weighted_qty > 0:
            return round(weighted_cost / weighted_qty, 2)
        rack_matches = [
            round(float(token.get("unit_cost_kes") or 0), 2)
            for token in self.item_barcode_tokens.values()
            if str(token.get("sku_code") or "").strip().upper() == sku_code
            and str(token.get("rack_code") or "").strip().upper() == rack_code
            and token.get("unit_cost_kes") is not None
        ]
        if rack_matches:
            return round(sum(rack_matches) / len(rack_matches), 2)
        sku_matches = [
            round(float(token.get("unit_cost_kes") or 0), 2)
            for token in self.item_barcode_tokens.values()
            if str(token.get("sku_code") or "").strip().upper() == sku_code
            and token.get("unit_cost_kes") is not None
        ]
        if not sku_matches:
            return None
        return round(sum(sku_matches) / len(sku_matches), 2)

    def _normalize_sorting_stock_cost_layers(self, row: dict[str, Any]) -> list[dict[str, Any]]:
        layers: list[dict[str, Any]] = []
        for index, layer in enumerate(row.get("cost_layers") or [], start=1):
            qty_on_hand = int((layer or {}).get("qty_on_hand") or (layer or {}).get("qty") or 0)
            if qty_on_hand <= 0:
                continue
            unit_cost_kes = (layer or {}).get("unit_cost_kes")
            total_cost_kes = (layer or {}).get("total_cost_kes")
            if unit_cost_kes not in {None, ""}:
                unit_cost_kes = round(float(unit_cost_kes), 2)
            elif total_cost_kes not in {None, ""}:
                unit_cost_kes = round(float(total_cost_kes) / qty_on_hand, 2)
            else:
                unit_cost_kes = None
            total_cost_kes = (
                round(float(total_cost_kes), 2)
                if total_cost_kes not in {None, ""}
                else (round(unit_cost_kes * qty_on_hand, 2) if unit_cost_kes is not None else None)
            )
            layers.append(
                {
                    "layer_id": str((layer or {}).get("layer_id") or f"LEGACY-{index:03d}").strip().upper(),
                    "task_no": str((layer or {}).get("task_no") or "").strip().upper(),
                    "qty_on_hand": qty_on_hand,
                    "unit_cost_kes": unit_cost_kes,
                    "total_cost_kes": total_cost_kes,
                    "source_pool_tokens": [
                        str(token or "").strip()
                        for token in ((layer or {}).get("source_pool_tokens") or [])
                        if str(token or "").strip()
                    ],
                    "source_bale_tokens": [
                        str(token or "").strip()
                        for token in ((layer or {}).get("source_bale_tokens") or [])
                        if str(token or "").strip()
                    ],
                    "created_at": str((layer or {}).get("created_at") or row.get("updated_at") or "").strip(),
                }
            )
        if layers:
            return layers
        qty_on_hand = int(row.get("qty_on_hand") or 0)
        unit_cost_kes = row.get("unit_cost_kes")
        total_cost_kes = row.get("total_cost_kes")
        if qty_on_hand <= 0 or (unit_cost_kes in {None, ""} and total_cost_kes in {None, ""}):
            return []
        if unit_cost_kes in {None, ""} and total_cost_kes not in {None, ""}:
            unit_cost_kes = round(float(total_cost_kes) / qty_on_hand, 2)
        elif unit_cost_kes not in {None, ""}:
            unit_cost_kes = round(float(unit_cost_kes), 2)
        else:
            unit_cost_kes = None
        total_cost_kes = (
            round(float(total_cost_kes), 2)
            if total_cost_kes not in {None, ""}
            else (round(unit_cost_kes * qty_on_hand, 2) if unit_cost_kes is not None else None)
        )
        return [
            {
                "layer_id": "LEGACY-001",
                "task_no": "",
                "qty_on_hand": qty_on_hand,
                "unit_cost_kes": unit_cost_kes,
                "total_cost_kes": total_cost_kes,
                "source_pool_tokens": [],
                "source_bale_tokens": [],
                "created_at": str(row.get("updated_at") or "").strip(),
            }
        ]

    def _hydrate_sorting_stock_costs(self, row: dict[str, Any]) -> dict[str, Any]:
        qty_on_hand = int(row.get("qty_on_hand") or 0)
        unit_cost_kes = row.get("unit_cost_kes")
        total_cost_kes = row.get("total_cost_kes")
        cost_layers = self._normalize_sorting_stock_cost_layers(row)
        if cost_layers:
            layer_qty = sum(int(layer.get("qty_on_hand") or 0) for layer in cost_layers)
            layer_total_cost_values = [
                float(layer.get("total_cost_kes") or 0)
                for layer in cost_layers
                if layer.get("total_cost_kes") not in {None, ""}
            ]
            qty_on_hand = layer_qty
            total_cost_kes = round(sum(layer_total_cost_values), 2) if len(layer_total_cost_values) == len(cost_layers) else None
            unit_cost_kes = (
                round(total_cost_kes / qty_on_hand, 2)
                if total_cost_kes is not None and qty_on_hand > 0
                else None
            )

        if unit_cost_kes not in {None, ""}:
            unit_cost_kes = round(float(unit_cost_kes), 2)
        else:
            unit_cost_kes = None

        if total_cost_kes not in {None, ""}:
            total_cost_kes = round(float(total_cost_kes), 2)
        else:
            total_cost_kes = None

        if unit_cost_kes is None and total_cost_kes is not None and qty_on_hand > 0:
            unit_cost_kes = round(total_cost_kes / qty_on_hand, 2)
        if total_cost_kes is None and unit_cost_kes is not None:
            total_cost_kes = round(unit_cost_kes * qty_on_hand, 2)

        if unit_cost_kes is None:
            unit_cost_kes = self._sorting_stock_token_unit_cost_kes(row)
        if total_cost_kes is None and unit_cost_kes is not None:
            total_cost_kes = round(unit_cost_kes * qty_on_hand, 2)

        normalized = {
            **row,
            "unit_cost_kes": unit_cost_kes,
            "total_cost_kes": total_cost_kes,
            "qty_on_hand": qty_on_hand,
            "cost_layers": cost_layers,
        }
        return normalized

    def _ensure_seed_apparel_default_costs(self) -> bool:
        updated = False
        for payload in DEFAULT_APPAREL_DEFAULT_COSTS:
            category_main = str(payload.get("category_main") or "").strip()
            category_sub = str(payload.get("category_sub") or "").strip()
            grade = str(payload.get("grade") or "").strip().upper()
            key = self._apparel_default_cost_key(category_main, category_sub, grade)
            if not category_main or not category_sub or grade not in {"P", "S"} or key in self.apparel_default_costs:
                continue
            self.apparel_default_costs[key] = {
                "category_main": category_main,
                "category_sub": category_sub,
                "grade": grade,
                "default_cost_kes": round(float(payload.get("default_cost_kes") or 0), 2),
                "note": str(payload.get("note") or "").strip(),
                "updated_at": now_iso(),
                "updated_by": "system",
            }
            updated = True
        return updated

    def _ensure_seed_apparel_sorting_racks(self) -> bool:
        updated = False
        stale_keys: list[str] = []
        for key, row in list(self.apparel_sorting_racks.items()):
            category_main = str(row.get("category_main") or "").strip()
            category_sub = str(row.get("category_sub") or "").strip()
            grade = str(row.get("grade") or "").strip().upper()
            try:
                stored_cost = round(float(row.get("default_cost_kes") or 0), 2)
            except (TypeError, ValueError):
                stored_cost = 0
            default_cost_row = self._find_apparel_default_cost(category_main, category_sub, grade)
            configured_cost = round(float(default_cost_row.get("default_cost_kes") or 0), 2) if default_cost_row else 0
            if not default_cost_row or configured_cost <= 0 or configured_cost != stored_cost:
                stale_keys.append(key)
        for key in stale_keys:
            del self.apparel_sorting_racks[key]
            updated = True

        for payload in DEFAULT_APPAREL_SORTING_RACKS:
            category_main = str(payload.get("category_main") or "").strip()
            category_sub = str(payload.get("category_sub") or "").strip()
            grade = str(payload.get("grade") or "").strip().upper()
            if not category_main or not category_sub or grade not in {"P", "S"}:
                continue
            default_cost_kes = round(float(payload.get("default_cost_kes") or 0), 2)
            rack_code = str(payload.get("rack_code") or "").strip().upper()
            if default_cost_kes <= 0 or not rack_code:
                continue
            default_cost_row = self._find_apparel_default_cost(category_main, category_sub, grade)
            if not default_cost_row:
                continue
            configured_cost = round(float(default_cost_row.get("default_cost_kes") or 0), 2)
            if configured_cost != default_cost_kes:
                continue
            key = self._apparel_sorting_rack_key(category_main, category_sub, grade, configured_cost)
            if key in self.apparel_sorting_racks:
                continue
            self.apparel_sorting_racks[key] = {
                "category_main": category_main,
                "category_sub": category_sub,
                "grade": grade,
                "default_cost_kes": configured_cost,
                "rack_code": rack_code,
                "note": str(payload.get("note") or "").strip(),
                "updated_at": now_iso(),
                "updated_by": "system",
            }
            updated = True

        for row in self.apparel_default_costs.values():
            category_main = str(row.get("category_main") or "").strip()
            category_sub = str(row.get("category_sub") or "").strip()
            grade = str(row.get("grade") or "").strip().upper()
            default_cost_kes = round(float(row.get("default_cost_kes") or 0), 2)
            if not category_main or not category_sub or grade not in {"P", "S"} or default_cost_kes <= 0:
                continue
            key = self._apparel_sorting_rack_key(category_main, category_sub, grade, default_cost_kes)
            if key in self.apparel_sorting_racks:
                continue
            self.apparel_sorting_racks[key] = {
                "category_main": category_main,
                "category_sub": category_sub,
                "grade": grade,
                "default_cost_kes": default_cost_kes,
                "rack_code": _derive_apparel_sorting_rack_code(category_main, category_sub, grade),
                "note": f"{category_main} / {category_sub} {grade} 档自动回填分拣库位",
                "updated_at": now_iso(),
                "updated_by": "system",
            }
            updated = True
        return updated

    def _hydrate_label_templates(self) -> bool:
        updated = False
        normalized_rows: dict[str, dict[str, Any]] = {}
        for key, row in self.label_templates.items():
            template_code = str(row.get("template_code") or key).strip().lower()
            if not template_code:
                continue
            normalized_row = dict(row)
            normalized_row["template_code"] = template_code
            normalized_row["name"] = str(normalized_row.get("name") or template_code).strip()
            normalized_row["template_scope"] = str(normalized_row.get("template_scope") or "product").strip().lower()
            if normalized_row["template_scope"] == "bale" and template_code != LOCKED_BALE_TEMPLATE_CODE:
                updated = True
                continue
            normalized_row["description"] = str(normalized_row.get("description") or "").strip()
            normalized_row["width_mm"] = int(normalized_row.get("width_mm") or 60)
            normalized_row["height_mm"] = int(normalized_row.get("height_mm") or 40)
            normalized_row["paper_preset"] = str(
                normalized_row.get("paper_preset")
                or self._guess_template_paper_preset(normalized_row["width_mm"], normalized_row["height_mm"])
            ).strip().lower()
            normalized_row["barcode_type"] = str(normalized_row.get("barcode_type") or "Code128").strip() or "Code128"
            normalized_row["fields"] = [
                str(field).strip()
                for field in normalized_row.get("fields", [])
                if str(field).strip()
            ]
            normalized_row["layout"] = self._normalize_label_template_layout(
                normalized_row["template_scope"],
                normalized_row.get("layout"),
                normalized_row["width_mm"],
                normalized_row["height_mm"],
            )
            normalized_row["is_active"] = bool(normalized_row.get("is_active", True))
            normalized_row.setdefault("created_at", now_iso())
            normalized_row.setdefault("created_by", "system")
            normalized_row.setdefault("updated_at", now_iso())
            normalized_row.setdefault("updated_by", "system")
            if key != template_code or normalized_row != row:
                updated = True
            normalized_rows[template_code] = normalized_row
        self.label_templates = normalized_rows
        return updated

    def list_label_templates(self, template_scope: Optional[str] = None) -> list[dict[str, Any]]:
        rows = list(self.label_templates.values())
        normalized_scope = str(template_scope or "").strip().lower()
        if normalized_scope:
            rows = [row for row in rows if str(row.get("template_scope") or "").strip().lower() == normalized_scope]
        if normalized_scope == "bale":
            rows = [
                row
                for row in rows
                if str(row.get("template_code") or "").strip().lower() == LOCKED_BALE_TEMPLATE_CODE
            ]
        return sorted(rows, key=lambda row: (str(row.get("template_scope") or ""), str(row.get("template_code") or "")))

    def save_label_template(self, payload: dict[str, Any], updated_by: str) -> dict[str, Any]:
        actor = self._require_user_role(updated_by, {"admin", "warehouse_supervisor"})
        template_code = str(payload.get("template_code") or "").strip().lower()
        if not template_code:
            raise HTTPException(status_code=400, detail="模板代码不能为空")
        name = str(payload.get("name") or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="模板名称不能为空")
        fields = [str(field).strip() for field in payload.get("fields", []) if str(field).strip()]
        if not fields:
            raise HTTPException(status_code=400, detail="请至少保留一个模板字段")
        current = dict(self.label_templates.get(template_code, {}))
        template_scope = str(payload.get("template_scope") or current.get("template_scope") or "bale").strip().lower()
        if template_scope == "bale" and template_code != LOCKED_BALE_TEMPLATE_CODE:
            raise HTTPException(status_code=400, detail="仓库 bale 标签模板已锁定为 warehouse_in，不允许新增或修改其他 bale 模板")
        row = {
            **current,
            "template_code": template_code,
            "name": name,
            "template_scope": template_scope,
            "description": str(payload.get("description") or "").strip(),
            "width_mm": int(payload.get("width_mm") or current.get("width_mm") or 60),
            "height_mm": int(payload.get("height_mm") or current.get("height_mm") or 40),
            "paper_preset": str(
                payload.get("paper_preset")
                or current.get("paper_preset")
                or self._guess_template_paper_preset(
                    int(payload.get("width_mm") or current.get("width_mm") or 60),
                    int(payload.get("height_mm") or current.get("height_mm") or 40),
                )
            ).strip().lower(),
            "barcode_type": str(payload.get("barcode_type") or current.get("barcode_type") or "Code128").strip() or "Code128",
            "fields": fields,
            "layout": {},
            "is_active": bool(payload.get("is_active", True)),
            "created_at": current.get("created_at") or now_iso(),
            "created_by": current.get("created_by") or actor["username"],
            "updated_at": now_iso(),
            "updated_by": actor["username"],
        }
        row["layout"] = self._normalize_label_template_layout(
            row["template_scope"],
            payload.get("layout") or current.get("layout"),
            row["width_mm"],
            row["height_mm"],
        )
        self.label_templates[template_code] = row
        self._log_event(
            event_type="settings.label_template_saved",
            entity_type="label_template",
            entity_id=template_code,
            actor=actor["username"],
            summary=f"Label template {template_code} saved",
            details={"template_scope": row["template_scope"], "fields": row["fields"], "paper_preset": row["paper_preset"]},
        )
        self._persist()
        return row

    def get_label_template(self, template_code: str, template_scope: Optional[str] = None) -> dict[str, Any]:
        normalized_code = str(template_code or "").strip().lower()
        normalized_scope = str(template_scope or "").strip().lower()
        if normalized_scope == "bale":
            normalized_code = LOCKED_BALE_TEMPLATE_CODE
        if normalized_code:
            row = self.label_templates.get(normalized_code)
            if row:
                if not template_scope or str(row.get("template_scope") or "").strip().lower() == str(template_scope).strip().lower():
                    return dict(row)
        rows = self.list_label_templates(template_scope=template_scope)
        if rows:
            return dict(rows[0])
        raise HTTPException(status_code=404, detail="找不到可用的标签模板")

    def _hydrate_products(self) -> bool:
        updated = False
        for product_id, product in self.products.items():
            if not product.get("product_code"):
                product["product_code"] = self._product_code_for_id(product_id)
                updated = True
            if "barcode" not in product or product["barcode"] is None:
                product["barcode"] = ""
                updated = True
            normalized_barcode = str(product.get("barcode", "")).strip().upper()
            if product.get("barcode", "") != normalized_barcode:
                product["barcode"] = normalized_barcode
                updated = True
            if "barcode_assigned_at" not in product:
                product["barcode_assigned_at"] = None
                updated = True
            if "barcode_assigned_by" not in product:
                product["barcode_assigned_by"] = ""
                updated = True
        return updated

    def _hydrate_suppliers(self) -> bool:
        updated = False
        normalized_rows: dict[str, dict[str, Any]] = {}
        known_names: set[str] = set()
        for key, row in self.suppliers.items():
            normalized_code = self._normalize_supplier_code(row.get("code") or key or row.get("name", ""))
            normalized_name = str(row.get("name", "")).strip()
            if not normalized_name:
                continue
            row["id"] = int(row.get("id") or next(self._supplier_ids))
            row["code"] = normalized_code
            row["name"] = normalized_name
            row.setdefault("name_zh", "")
            row.setdefault("contact_person", "")
            row.setdefault("phone", "")
            row.setdefault("note", "")
            row.setdefault("status", "active")
            row.setdefault("created_at", now_iso())
            row.setdefault("created_by", "system")
            normalized_rows[normalized_code] = row
            known_names.add(normalized_name.lower())
            if key != normalized_code:
                updated = True

        supplier_names = set()
        for product in self.products.values():
            if str(product.get("supplier_name", "")).strip():
                supplier_names.add(str(product.get("supplier_name")).strip())
        for receipt in self.goods_receipts:
            if str(receipt.get("supplier_name", "")).strip():
                supplier_names.add(str(receipt.get("supplier_name")).strip())
        for batch in self.parcel_batches.values():
            if str(batch.get("supplier_name", "")).strip():
                supplier_names.add(str(batch.get("supplier_name")).strip())

        for supplier_name in sorted(supplier_names):
            if supplier_name.lower() in known_names:
                continue
            created = self._create_supplier_record(
                {
                    "name": supplier_name,
                    "note": "从已有业务数据自动补齐的供应商",
                    "status": "active",
                },
                actor="system",
            )
            normalized_rows[created["code"]] = created
            known_names.add(created["name"].lower())
            updated = True

        if normalized_rows != self.suppliers:
            self.suppliers = normalized_rows
            updated = True
        return updated

    def _rebuild_product_barcode_index(self) -> None:
        self.product_by_barcode = {}
        for product_id, product in self.products.items():
            barcode = str(product.get("barcode", "")).strip().upper()
            if barcode:
                self.product_by_barcode[barcode] = product_id

    def _hydrate_price_rules(self) -> bool:
        updated = False
        normalized_rules: dict[str, dict[str, Any]] = {}
        for key, rule in self.price_rules.items():
            rule_no = rule.get("rule_no") or str(key)
            if rule.get("rule_no") != rule_no:
                rule["rule_no"] = rule_no
                updated = True
            rule.setdefault("status", "active")
            rule.setdefault("note", "")
            target_type = str(rule.get("target_type", "")).strip().lower()
            if rule.get("target_type") != target_type:
                rule["target_type"] = target_type
                updated = True
            target_value = str(rule.get("target_value", "")).strip()
            if target_type == "barcode":
                normalized_value = target_value.upper()
            else:
                normalized_value = target_value.lower()
            if rule.get("target_value") != normalized_value:
                rule["target_value"] = normalized_value
                updated = True
            if rule.get("store_code"):
                normalized_store = str(rule["store_code"]).strip().upper()
                if rule["store_code"] != normalized_store:
                    rule["store_code"] = normalized_store
                    updated = True
            normalized_rules[rule_no] = rule
        if normalized_rules and normalized_rules.keys() != self.price_rules.keys():
            updated = True
        if normalized_rules:
            self.price_rules = normalized_rules
        return updated

    def _find_item_token_by_barcode_value(self, barcode: str) -> Optional[dict[str, Any]]:
        normalized_barcode = str(barcode or "").strip().upper()
        if not normalized_barcode:
            return None
        direct = self.item_barcode_tokens.get(normalized_barcode)
        if direct:
            return direct
        for token in self.item_barcode_tokens.values():
            final_item_barcode = token.get("final_item_barcode") or {}
            if normalized_barcode in {
                str(token.get("token_no") or "").strip().upper(),
                str(token.get("identity_no") or "").strip().upper(),
                str(token.get("barcode_value") or "").strip().upper(),
                str(final_item_barcode.get("barcode_value") or "").strip().upper(),
            }:
                return token
        return None

    def _resolve_identity_id_for_barcode(self, barcode: str) -> str:
        normalized_barcode = str(barcode or "").strip().upper()
        if not normalized_barcode:
            return ""
        token = self._find_item_token_by_barcode_value(normalized_barcode)
        if not token:
            return normalized_barcode
        final_item_barcode = token.get("final_item_barcode") or {}
        return str(
            token.get("identity_no")
            or final_item_barcode.get("identity_id")
            or token.get("token_no")
            or normalized_barcode
        ).strip().upper()

    def _barcode_context_reject_reason(self, barcode_type: str, context: str, allowed_contexts: list[str]) -> str:
        normalized_context = str(context or "").strip()
        normalized_type = str(barcode_type or "").strip().upper()
        if not normalized_context or normalized_context in allowed_contexts:
            return ""
        if normalized_type == "STORE_PREP_BALE":
            if normalized_context == "warehouse_sorting_create":
                return "这是仓库待送店压缩包码，不是 RAW_BALE 入仓包，不能创建分拣任务。"
            if normalized_context == "pos":
                return "POS 只允许扫描 STORE_ITEM 商品码，不能扫描仓库待送店压缩包码。"
            if normalized_context == "store_receiving":
                return "这是仓库待送店压缩包码，不是正式送货执行码。请让仓库先生成送货执行单并打印正式送店 barcode。"
            if normalized_context == "store_pda":
                return "店员 PDA 只能扫描已收货/已分配流程中的正式送店执行码或 STORE_ITEM，不能直接扫描仓库待送店压缩包码。"
            if normalized_context == "b2b_bale_sales":
                return "这是待送店压缩包，不是待售卖 Bale。请切换到待售 Bale 业务页面后重试。"
        if normalized_context == "pos":
            return "POS 只允许扫描已激活的 STORE_ITEM 商品码，不能扫描仓库/送店 bale 码。"
        if normalized_context == "warehouse_sorting_create":
            return "仓库分拣创建只允许扫描 RAW_BALE 入仓包码，不能扫描商品码或送店包码。"
        if normalized_context == "store_receiving":
            return "门店签收只允许扫描正式门店送货执行码。"
        if normalized_context == "store_pda":
            return "店员 PDA 只允许扫描本人/本店相关 DISPATCH_BALE 或 STORE_ITEM。"
        return f"{barcode_type} 不允许在 {normalized_context} 场景扫描。"

    def _barcode_context_next_step(self, barcode_type: str, context: str, allowed_contexts: list[str]) -> str:
        normalized_context = str(context or "").strip()
        normalized_type = str(barcode_type or "").strip().upper()
        if not normalized_context or normalized_context in allowed_contexts:
            return ""
        if normalized_type == "STORE_PREP_BALE":
            if normalized_context in {"store_receiving", "store_pda"}:
                return "请先在仓库执行单/送货单完成正式送店并打印执行码，再由门店扫码。"
            if normalized_context == "warehouse_sorting_create":
                return "请改扫 RAW_BALE 入仓包码创建分拣任务。"
            if normalized_context == "pos":
                return "请改扫 STORE_ITEM 商品码。"
            if normalized_context == "b2b_bale_sales":
                return "请切换到待售 Bale 页面并扫描 BS/待售 Bale 条码。"
        if normalized_context == "pos":
            return "请改扫 STORE_ITEM 商品码，或转到仓库/门店收货模块处理 bale 码。"
        if normalized_context == "warehouse_sorting_create":
            return "请回到入仓包分拣创建页面并扫描 RAW_BALE 包码。"
        if normalized_context == "store_receiving":
            return "请在门店签收页面扫描正式门店送货执行码。"
        if normalized_context == "store_pda":
            return "请确认当前员工/门店后，扫描对应 DISPATCH_BALE 或 STORE_ITEM。"
        return f"请切换到允许 {barcode_type} 的业务页面后重试。"

    def _build_barcode_resolve_result(
        self,
        *,
        barcode_value: str,
        barcode_type: str,
        object_type: str,
        object_id: str,
        identity_id: str = "",
        template_scope: str = "",
        allowed_contexts: list[str],
        context: str = "",
    ) -> dict[str, Any]:
        normalized_allowed_contexts = [str(value or "").strip() for value in allowed_contexts if str(value or "").strip()]
        known_contexts = [
            "pos",
            "warehouse_sorting_create",
            "raw_bale_stock",
            "bale_sales_pool",
            "store_receiving",
            "store_manager_assign",
            "store_pda",
            "identity_ledger",
            "b2b_bale_sales",
        ]
        reject_reason = self._barcode_context_reject_reason(barcode_type, context, normalized_allowed_contexts)
        operational_next_step = self._barcode_context_next_step(barcode_type, context, normalized_allowed_contexts)
        rejected_contexts = [ctx for ctx in known_contexts if ctx not in normalized_allowed_contexts]
        business_object_kind = {
            "raw_bale": "INBOUND_BALE",
            "dispatch_bale": "DISPATCH_BALE",
            "store_prep_bale": "STORE_PREP_BALE",
            "store_item": "STORE_ITEM",
            "bale_sales_unit": "BALE_SALES_UNIT",
            "loose_pick_task": "LOOSE_PICK_TASK",
            "store_delivery_execution": "STORE_DELIVERY_EXECUTION",
        }.get(str(object_type or "").strip().lower(), str(barcode_type or "UNKNOWN").strip().upper())
        return {
            "barcode_value": str(barcode_value or "").strip().upper(),
            "barcode_type": barcode_type,
            "business_object": {
                "kind": business_object_kind,
                "id": str(object_id or "").strip().upper(),
            },
            "pos_allowed": "pos" in normalized_allowed_contexts,
            "rejected_contexts": rejected_contexts,
            "rejection_message": reject_reason,
            "operational_next_step": operational_next_step,
            "object_type": object_type,
            "object_id": str(object_id or "").strip().upper(),
            "identity_id": str(identity_id or "").strip().upper(),
            "template_scope": str(template_scope or "").strip().lower(),
            "allowed_contexts": normalized_allowed_contexts,
            "reject_reason": reject_reason,
        }

    def resolve_barcode(self, barcode: str, context: str = "") -> dict[str, Any]:
        normalized_barcode = str(barcode or "").strip().upper()
        normalized_context = str(context or "").strip()
        if not normalized_barcode:
            return {
                "barcode_value": "",
                "barcode_type": "UNKNOWN",
                "business_object": {"kind": "UNKNOWN", "id": ""},
                "pos_allowed": False,
                "rejected_contexts": [],
                "rejection_message": "Barcode is required",
                "operational_next_step": "请重新扫码；若标签损坏请补打后再试。",
                "object_type": "unknown",
                "object_id": "",
                "identity_id": "",
                "template_scope": "",
                "allowed_contexts": [],
                "reject_reason": "Barcode is required",
            }

        matches: list[dict[str, Any]] = []

        token = self._find_item_token_by_barcode_value(normalized_barcode)
        if token:
            token_no = str(token.get("token_no") or normalized_barcode).strip().upper()
            identity_id = str(token.get("identity_no") or token_no).strip().upper()
            status = str(token.get("status") or "").strip().lower()
            product_id = self.product_by_barcode.get(str(token.get("barcode_value") or "").strip().upper()) or self.product_by_barcode.get(token_no)
            allowed_contexts = ["store_pda", "identity_ledger"]
            if status in {"printed_in_store", "shelved", "sold", "returned_to_warehouse"} or product_id is not None:
                allowed_contexts.append("pos")
            matches.append(
                self._build_barcode_resolve_result(
                    barcode_value=normalized_barcode,
                    barcode_type="STORE_ITEM",
                    object_type="store_item",
                    object_id=token_no,
                    identity_id=identity_id,
                    template_scope="product",
                    allowed_contexts=allowed_contexts,
                    context=normalized_context,
                )
            )

        self._rebuild_store_dispatch_bales()
        dispatch_bale = self.store_dispatch_bales.get(normalized_barcode)
        if not dispatch_bale:
            dispatch_bale = next(
                (
                    row
                    for row in self.store_dispatch_bales.values()
                    if normalized_barcode
                    in {
                        str(row.get("bale_no") or "").strip().upper(),
                        str(row.get("bale_barcode") or "").strip().upper(),
                        str(row.get("dispatch_bale_no") or "").strip().upper(),
                    }
                ),
                None,
            )
        if dispatch_bale:
            matches.append(
                self._build_barcode_resolve_result(
                    barcode_value=normalized_barcode,
                    barcode_type="DISPATCH_BALE",
                    object_type="dispatch_bale",
                    object_id=str(dispatch_bale.get("bale_no") or normalized_barcode).strip().upper(),
                    template_scope="warehouseout_bale",
                    allowed_contexts=["store_receiving", "store_manager_assign", "store_pda", "identity_ledger"],
                    context=normalized_context,
                )
            )

        delivery_execution_order = self.store_delivery_execution_orders.get(normalized_barcode)
        if not delivery_execution_order:
            delivery_execution_order = next(
                (
                    row
                    for row in self.store_delivery_execution_orders.values()
                    if normalized_barcode
                    in {
                        str(row.get("execution_order_no") or "").strip().upper(),
                        str(row.get("official_delivery_barcode") or "").strip().upper(),
                        str(row.get("machine_code") or "").strip().upper(),
                    }
                ),
                None,
            )
        if delivery_execution_order:
            normalized_execution_order = self._normalize_store_delivery_execution_order(delivery_execution_order)
            self.store_delivery_execution_orders[normalized_execution_order["execution_order_no"]] = normalized_execution_order
            matches.append(
                self._build_barcode_resolve_result(
                    barcode_value=normalized_barcode,
                    barcode_type="STORE_DELIVERY_EXECUTION",
                    object_type="store_delivery_execution",
                    object_id=str(normalized_execution_order.get("execution_order_no") or normalized_barcode).strip().upper(),
                    template_scope="store_delivery_execution",
                    allowed_contexts=["store_receiving", "identity_ledger"],
                    context=normalized_context,
                )
            )

        prep_bale = self.store_prep_bales.get(normalized_barcode)
        if not prep_bale:
            prep_bale = next(
                (
                    row
                    for row in self.store_prep_bales.values()
                    if normalized_barcode
                    in {
                        str(row.get("bale_no") or "").strip().upper(),
                        str(row.get("bale_barcode") or "").strip().upper(),
                        str(row.get("scan_token") or "").strip().upper(),
                    }
                ),
                None,
            )
        if prep_bale:
            prep_bale = self._normalize_store_prep_bale(prep_bale)
            matches.append(
                self._build_barcode_resolve_result(
                    barcode_value=normalized_barcode,
                    barcode_type="STORE_PREP_BALE",
                    object_type="store_prep_bale",
                    object_id=str(prep_bale.get("bale_barcode") or prep_bale.get("bale_no") or normalized_barcode).strip().upper(),
                    template_scope="warehouse_store_prep_bale",
                    allowed_contexts=["warehouse_dispatch_planning", "identity_ledger"],
                    context=normalized_context,
                )
            )

        raw_bale = self._find_raw_bale_by_reference_no_defaults(normalized_barcode)
        if raw_bale:
            self._ensure_raw_bale_defaults(raw_bale)
            matches.append(
                self._build_barcode_resolve_result(
                    barcode_value=normalized_barcode,
                    barcode_type="RAW_BALE",
                    object_type="raw_bale",
                    object_id=str(raw_bale.get("bale_barcode") or raw_bale.get("scan_token") or normalized_barcode).strip().upper(),
                    template_scope="bale",
                    allowed_contexts=["warehouse_sorting_create", "raw_bale_stock", "bale_sales_pool", "identity_ledger"],
                    context=normalized_context,
                )
            )

        unique = {
            (row["barcode_type"], row["object_type"], row["object_id"]): row
            for row in matches
        }
        if len(unique) > 1:
            return {
                "barcode_value": normalized_barcode,
                "barcode_type": "UNKNOWN",
                "business_object": {"kind": "UNKNOWN", "id": normalized_barcode},
                "pos_allowed": False,
                "rejected_contexts": [],
                "rejection_message": f"Barcode {normalized_barcode} matched multiple object types; global resolver refuses ambiguous scans.",
                "operational_next_step": "请联系主管核对条码来源，确认后重新打印标准标签再扫描。",
                "object_type": "conflict",
                "object_id": normalized_barcode,
                "identity_id": "",
                "template_scope": "",
                "allowed_contexts": [],
                "reject_reason": f"Barcode {normalized_barcode} matched multiple object types; global resolver refuses ambiguous scans.",
            }
        if unique:
            return next(iter(unique.values()))
        return {
            "barcode_value": normalized_barcode,
            "barcode_type": "UNKNOWN",
            "business_object": {"kind": "UNKNOWN", "id": normalized_barcode},
            "pos_allowed": False,
            "rejected_contexts": [],
            "rejection_message": f"Unknown barcode {normalized_barcode}",
            "operational_next_step": "请先确认标签来源与业务场景；若仍无法识别，请联系主管补打或重建条码。",
            "object_type": "unknown",
            "object_id": normalized_barcode,
            "identity_id": "",
            "template_scope": "",
            "allowed_contexts": [],
            "reject_reason": f"Unknown barcode {normalized_barcode}",
        }

    def _hydrate_sales_transactions(self) -> bool:
        updated = False
        for sale in self.sales_transactions:
            if "id" not in sale:
                sale["id"] = next(self._sale_ids)
                updated = True
            sale.setdefault("sale_status", "completed")
            sale.setdefault("void_no", "")
            sale.setdefault("void_request_count", 0)
            sale.setdefault("refund_no", "")
            sale.setdefault("refund_request_count", 0)
            sale.setdefault("refund_amount_total", 0.0)
            sale.setdefault("refund_qty_total", 0)
            sale.setdefault("client_sale_id", "")
            sale.setdefault("sync_batch_no", "")
            sale.setdefault("shift_no", "")
            sale.setdefault("payment_total", sale.get("total_amount", 0.0))
            sale.setdefault("payment_status", "paid")
            sale.setdefault("amount_due", 0.0)
            sale.setdefault("amount_overpaid", 0.0)
            sale.setdefault("payment_anomaly_count", 0)
            sale.setdefault("payment_anomaly_nos", [])
            sale.setdefault("change_due", 0.0)
            sale.setdefault("total_cost", 0.0)
            sale.setdefault("total_profit", 0.0)
            sale.setdefault("power_mode", "online")
            sale.setdefault("note", "")
            sale.setdefault("override_alert_count", 0)
            sale.setdefault("policy_breach_count", 0)
            sale.setdefault("voided_at", None)
            sale.setdefault("voided_by", "")
            sale.setdefault("void_reason", "")
            sale.setdefault("refunded_at", None)
            sale.setdefault("refunded_by", "")
            sale.setdefault("refund_reason", "")
            sale.setdefault("identity_ids", [])
            sale.setdefault("payments", [{"method": "cash", "amount": sale.get("total_amount", 0.0), "reference": "", "customer_id": ""}])
            if "payments" in sale and sale["payments"]:
                for payment in sale["payments"]:
                    payment.setdefault("reference", "")
                    payment.setdefault("customer_id", "")
            for item in sale.get("items", []):
                resolved_identity_id = self._resolve_identity_id_for_barcode(item.get("barcode", ""))
                if item.get("identity_id") != resolved_identity_id:
                    item["identity_id"] = resolved_identity_id
                    updated = True
                item.setdefault("launch_price", item.get("selling_price", 0.0))
                item.setdefault("expected_price", item.get("launch_price", item.get("selling_price", 0.0)))
                item.setdefault("price_cap", None)
                item.setdefault("price_rule_no", "")
                item.setdefault("cost_price", 0.0)
                item.setdefault("average_cost_price", item.get("cost_price", 0.0))
                item.setdefault("line_profit", round(item.get("line_total", 0.0) - item.get("cost_price", 0.0) * item.get("qty", 0), 2))
                item.setdefault("price_override", False)
                item.setdefault("override_reason", "")
                item.setdefault("customer_id", "")
                item.setdefault("price_policy_breach", False)
                item.setdefault("returned_qty", 0)
                item.setdefault("returned_amount_total", 0.0)
                item.setdefault("lot_allocations", [])
                item.setdefault("returned_lot_allocations", [])
            sale_identity_ids = [
                str(item.get("identity_id") or "").strip().upper()
                for item in sale.get("items", [])
                if str(item.get("identity_id") or "").strip()
            ]
            if sale.get("identity_ids") != sale_identity_ids:
                sale["identity_ids"] = sale_identity_ids
                updated = True
        return updated

    def _hydrate_sale_void_requests(self) -> bool:
        updated = False
        normalized_rows: dict[str, dict[str, Any]] = {}
        for void_no, row in self.sale_void_requests.items():
            normalized_no = str(void_no).strip().upper()
            if row.get("void_no") != normalized_no:
                row["void_no"] = normalized_no
                updated = True
            row.setdefault("status", "pending_review")
            row.setdefault("shift_no", "")
            row.setdefault("sale_status", "completed")
            row.setdefault("payment_status", "paid")
            row.setdefault("total_profit", 0.0)
            row.setdefault("note", "")
            row.setdefault("reviewed_at", None)
            row.setdefault("reviewed_by", None)
            row.setdefault("review_note", "")
            normalized_rows[normalized_no] = row
        if normalized_rows and normalized_rows.keys() != self.sale_void_requests.keys():
            updated = True
            self.sale_void_requests = normalized_rows
        elif normalized_rows:
            self.sale_void_requests = normalized_rows
        return updated

    def _hydrate_sale_refund_requests(self) -> bool:
        updated = False
        normalized_rows: dict[str, dict[str, Any]] = {}
        for refund_no, row in self.sale_refund_requests.items():
            normalized_no = str(refund_no or row.get("refund_no", "")).strip().upper()
            if not normalized_no:
                continue
            row["refund_no"] = normalized_no
            row.setdefault("original_shift_no", "")
            row.setdefault("refund_shift_no", "")
            row.setdefault("sale_status", "completed")
            row.setdefault("payment_status", "paid")
            row.setdefault("refund_method", "cash")
            row.setdefault("total_profit", 0.0)
            row.setdefault("refund_amount_total", 0.0)
            row.setdefault("refund_cost_total", 0.0)
            row.setdefault("refund_profit_reversal_total", 0.0)
            row.setdefault("status", "pending_review")
            row.setdefault("note", "")
            row.setdefault("reviewed_at", None)
            row.setdefault("reviewed_by", "")
            row.setdefault("review_note", "")
            normalized_items = []
            for item in row.get("items", []):
                resolved_identity_id = self._resolve_identity_id_for_barcode(item.get("barcode", ""))
                if item.get("identity_id") != resolved_identity_id:
                    item["identity_id"] = resolved_identity_id
                    updated = True
                item.setdefault("note", "")
                item.setdefault("refundable_qty", item.get("requested_qty", 0))
                item.setdefault("refund_amount", 0.0)
                item.setdefault("refund_cost", 0.0)
                item.setdefault("refund_profit_reversal", round(item.get("refund_amount", 0.0) - item.get("refund_cost", 0.0), 2))
                item.setdefault("lot_allocations", [])
                normalized_items.append(item)
            row["items"] = normalized_items
            normalized_rows[normalized_no] = row
        if normalized_rows and normalized_rows.keys() != self.sale_refund_requests.keys():
            updated = True
        if normalized_rows != self.sale_refund_requests:
            updated = True
            self.sale_refund_requests = normalized_rows
        else:
            self.sale_refund_requests = normalized_rows
        return updated

    def _hydrate_return_orders(self) -> bool:
        updated = False
        normalized_rows: dict[str, dict[str, Any]] = {}
        for return_no, row in self.return_orders.items():
            normalized_no = str(return_no or row.get("return_no", "")).strip().upper()
            if not normalized_no:
                continue
            row["return_no"] = normalized_no
            row.setdefault("status", "pending_dispatch")
            row.setdefault("reason", "")
            row.setdefault("dispatched_at", None)
            row.setdefault("dispatched_by", None)
            row.setdefault("received_at", None)
            row.setdefault("received_by", None)
            row.setdefault("ret_rack_code", "")
            normalized_items = []
            for item in row.get("items", []):
                resolved_identity_id = self._resolve_identity_id_for_barcode(item.get("barcode", ""))
                if item.get("identity_id") != resolved_identity_id:
                    item["identity_id"] = resolved_identity_id
                    updated = True
                item.setdefault("returned_qty", 0)
                item.setdefault("note", "")
                item.setdefault("lot_allocations", [])
                normalized_items.append(item)
            row["items"] = normalized_items
            normalized_rows[normalized_no] = row
        if normalized_rows and normalized_rows.keys() != self.return_orders.keys():
            updated = True
        if normalized_rows != self.return_orders:
            updated = True
            self.return_orders = normalized_rows
        else:
            self.return_orders = normalized_rows
        return updated

    def _hydrate_cashier_shifts(self) -> bool:
        updated = False
        for shift_no, shift in self.cashier_shifts.items():
            if shift.get("shift_no") != shift_no:
                shift["shift_no"] = shift_no
                updated = True
            shift.setdefault("status", "open")
            shift.setdefault("opened_by", shift.get("cashier_name", ""))
            shift.setdefault("opening_float_cash", 0.0)
            shift.setdefault("closed_at", None)
            shift.setdefault("closed_by", None)
            shift.setdefault("closing_cash_counted", None)
            shift.setdefault("cash_variance", None)
            shift.setdefault("handover_status", "not_requested")
            shift.setdefault("handover_requested_at", None)
            shift.setdefault("handover_requested_by", None)
            shift.setdefault("handover_reviewed_at", None)
            shift.setdefault("handover_reviewed_by", None)
            shift.setdefault("note", "")
        return updated

    def _hydrate_cashier_handover_logs(self) -> bool:
        updated = False
        for handover_no, log in self.cashier_handover_logs.items():
            if log.get("handover_no") != handover_no:
                log["handover_no"] = handover_no
                updated = True
            log.setdefault("status", "pending_review")
            log.setdefault("note", "")
            log.setdefault("reviewed_at", None)
            log.setdefault("reviewed_by", None)
            log.setdefault("review_note", "")
        return updated

    def _hydrate_payment_anomalies(self) -> bool:
        updated = False
        normalized_rows: dict[str, dict[str, Any]] = {}
        for key, row in self.payment_anomalies.items():
            anomaly_no = str(row.get("anomaly_no") or key).strip().upper()
            if row.get("anomaly_no") != anomaly_no:
                row["anomaly_no"] = anomaly_no
                updated = True
            if row.get("store_code"):
                normalized_store = str(row["store_code"]).strip().upper()
                if row["store_code"] != normalized_store:
                    row["store_code"] = normalized_store
                    updated = True
            row.setdefault("status", "open")
            row.setdefault("order_no", "")
            row.setdefault("shift_no", "")
            row.setdefault("payment_method", "")
            row.setdefault("amount_expected", 0.0)
            row.setdefault("amount_received", 0.0)
            row.setdefault("amount_difference", 0.0)
            row.setdefault("reference", "")
            row.setdefault("customer_id", "")
            row.setdefault("source_type", "")
            row.setdefault("note", "")
            row.setdefault("created_at", now_iso())
            row.setdefault("created_by", "system")
            row.setdefault("resolved_at", None)
            row.setdefault("resolved_by", "")
            row.setdefault("resolution_note", "")
            row.setdefault("resolution_action", "")
            row.setdefault("resolution_amount", 0.0)
            row.setdefault("resolution_reference", "")
            row.setdefault("corrected_order_no", "")
            row.setdefault("corrected_store_code", "")
            row.setdefault("follow_up_status", "")
            row.setdefault("linked_receipt_no", "")
            normalized_rows[anomaly_no] = row
        if normalized_rows.keys() != self.payment_anomalies.keys():
            updated = True
        self.payment_anomalies = normalized_rows
        return updated

    def _hydrate_mpesa_collections(self) -> bool:
        updated = False
        seen_receipts: set[str] = set()
        normalized_rows: list[dict[str, Any]] = []
        for row in self.mpesa_collections:
            if "id" not in row:
                row["id"] = next(self._mpesa_collection_ids)
                updated = True
            receipt_no = str(row.get("receipt_no", "")).strip().upper()
            if row.get("receipt_no") != receipt_no:
                row["receipt_no"] = receipt_no
                updated = True
            row.setdefault("source_batch_no", "")
            row.setdefault("customer_id", "")
            row.setdefault("phone_number", "")
            row.setdefault("payer_name", "")
            row.setdefault("reference", "")
            row.setdefault("note", "")
            row.setdefault("match_status", "unmatched")
            row.setdefault("matched_order_no", "")
            row.setdefault("matched_shift_no", "")
            row.setdefault("matched_at", None)
            row.setdefault("imported_at", now_iso())
            if row.get("store_code"):
                normalized_store = str(row["store_code"]).strip().upper()
                if row["store_code"] != normalized_store:
                    row["store_code"] = normalized_store
                    updated = True
            if row.get("amount") is not None:
                normalized_amount = round(float(row["amount"]), 2)
                if row["amount"] != normalized_amount:
                    row["amount"] = normalized_amount
                    updated = True
            if receipt_no and receipt_no in seen_receipts and row["match_status"] != "duplicate":
                row["match_status"] = "duplicate"
                updated = True
            seen_receipts.add(receipt_no)
            normalized_rows.append(row)
        self.mpesa_collections = normalized_rows
        return updated

    def _hydrate_offline_sync_state(self) -> bool:
        updated = False
        normalized_batches: dict[str, dict[str, Any]] = {}
        for sync_batch_no, batch in self.offline_sync_batches.items():
            if batch.get("sync_batch_no") != sync_batch_no:
                batch["sync_batch_no"] = sync_batch_no
                updated = True
            batch.setdefault("note", "")
            batch.setdefault("accepted_count", 0)
            batch.setdefault("duplicate_count", 0)
            batch.setdefault("failed_count", 0)
            batch.setdefault("results", [])
            batch.setdefault("store_codes", [])
            normalized_batches[sync_batch_no] = batch
        if normalized_batches.keys() != self.offline_sync_batches.keys():
            updated = True
        self.offline_sync_batches = normalized_batches

        normalized_registry: dict[str, dict[str, Any]] = {}
        for client_sale_id, row in self.offline_sale_registry.items():
            if row.get("client_sale_id") != client_sale_id:
                row["client_sale_id"] = client_sale_id
                updated = True
            row.setdefault("order_no", "")
            row.setdefault("sale_id", None)
            row.setdefault("sync_batch_no", "")
            row.setdefault("synced_at", now_iso())
            normalized_registry[client_sale_id] = row
        if normalized_registry.keys() != self.offline_sale_registry.keys():
            updated = True
        self.offline_sale_registry = normalized_registry
        return updated

    def _parse_datetime(self, value: str) -> Optional[datetime]:
        text = str(value or "").strip()
        if not text:
            return None
        try:
            normalized = text.replace("Z", "+00:00")
            parsed = datetime.fromisoformat(normalized)
            if parsed.tzinfo is None:
                return parsed.replace(tzinfo=timezone.utc)
            return parsed.astimezone(timezone.utc)
        except ValueError:
            return None

    def _nairobi_day_key(self, value: Optional[str] = None) -> str:
        if value:
            parsed = self._parse_datetime(value)
            if parsed:
                return parsed.astimezone(NAIROBI_TZ).strftime("%Y-%m-%d")
        return datetime.now(NAIROBI_TZ).strftime("%Y-%m-%d")

    def _resolve_mpesa_import_actor(self, imported_by: str) -> dict[str, Any]:
        normalized = str(imported_by or "").strip()
        if not normalized:
            raise HTTPException(status_code=400, detail="Missing imported_by actor")
        try:
            return self._require_user_role(normalized, {"admin", "area_supervisor", "store_manager"})
        except HTTPException as error:
            if normalized in {"safaricom_callback", "system_mpesa"}:
                return {
                    "username": normalized,
                    "full_name": normalized,
                    "role_code": "system",
                    "store_code": None,
                }
            raise error

    def _match_mpesa_collection(self, payload: dict[str, Any]) -> dict[str, Any]:
        receipt_no = payload["receipt_no"]
        reference = payload.get("reference", "").strip()
        customer_id = payload.get("customer_id", "").strip()
        amount = round(payload["amount"], 2)
        collected_at = self._parse_datetime(payload["collected_at"])
        normalized_store = payload["store_code"].strip().upper()

        def score_sale(sale: dict[str, Any]) -> int:
            score = 0
            if sale["store_code"].strip().upper() == normalized_store:
                score += 5
            for payment in sale.get("payments", []):
                if payment["method"] != "mpesa":
                    continue
                if round(payment["amount"], 2) == amount:
                    score += 10
                if reference and payment.get("reference", "").strip().upper() == reference.upper():
                    score += 30
                if receipt_no and payment.get("reference", "").strip().upper() == receipt_no.upper():
                    score += 35
                if customer_id and payment.get("customer_id", "").strip() == customer_id:
                    score += 20
            sold_at = self._parse_datetime(sale.get("sold_at", ""))
            if collected_at and sold_at:
                delta_seconds = abs((collected_at - sold_at).total_seconds())
                if delta_seconds <= 4 * 3600:
                    score += 8
                elif delta_seconds <= 24 * 3600:
                    score += 3
            return score

        best_match: Optional[dict[str, Any]] = None
        best_score = 0
        for sale in self.sales_transactions:
            score = score_sale(sale)
            if score > best_score:
                best_score = score
                best_match = sale

        if best_match and best_score >= 15:
            return {
                "match_status": "matched",
                "matched_order_no": best_match["order_no"],
                "matched_shift_no": best_match.get("shift_no", ""),
                "matched_at": now_iso(),
            }
        return {
            "match_status": "unmatched",
            "matched_order_no": "",
            "matched_shift_no": "",
            "matched_at": None,
        }

    def _payment_anomaly_no_for_id(self, anomaly_id: int) -> str:
        return f"PAY-ANOM-{anomaly_id:06d}"

    def _create_payment_anomaly(
        self,
        *,
        anomaly_type: str,
        store_code: str,
        created_by: str,
        order_no: str = "",
        shift_no: str = "",
        payment_method: str = "",
        amount_expected: float = 0.0,
        amount_received: float = 0.0,
        amount_difference: float = 0.0,
        reference: str = "",
        customer_id: str = "",
        source_type: str = "",
        note: str = "",
        entity_id: str = "",
    ) -> dict[str, Any]:
        anomaly_id = next(self._payment_anomaly_ids)
        anomaly_no = self._payment_anomaly_no_for_id(anomaly_id)
        row = {
            "anomaly_no": anomaly_no,
            "anomaly_type": anomaly_type,
            "status": "open",
            "store_code": str(store_code).strip().upper(),
            "order_no": str(order_no).strip(),
            "shift_no": str(shift_no).strip(),
            "payment_method": str(payment_method).strip().lower(),
            "amount_expected": round(float(amount_expected or 0.0), 2),
            "amount_received": round(float(amount_received or 0.0), 2),
            "amount_difference": round(float(amount_difference or 0.0), 2),
            "reference": str(reference).strip().upper(),
            "customer_id": str(customer_id).strip(),
            "source_type": str(source_type).strip(),
            "note": str(note).strip(),
            "created_at": now_iso(),
            "created_by": created_by,
            "resolved_at": None,
            "resolved_by": "",
            "resolution_note": "",
            "resolution_action": "",
            "resolution_amount": 0.0,
            "resolution_reference": "",
            "corrected_order_no": "",
            "corrected_store_code": "",
            "follow_up_status": "",
            "linked_receipt_no": str(reference).strip().upper() if str(source_type).strip().startswith("mpesa") else "",
        }
        self.payment_anomalies[anomaly_no] = row
        self._log_event(
            event_type=f"payment.anomaly_{anomaly_type}",
            entity_type="payment_anomaly",
            entity_id=entity_id or anomaly_no,
            actor=created_by,
            summary=f"Payment anomaly {anomaly_type} detected for {store_code}",
            details={
                "anomaly_no": anomaly_no,
                "store_code": row["store_code"],
                "order_no": row["order_no"],
                "shift_no": row["shift_no"],
                "payment_method": row["payment_method"],
                "amount_expected": row["amount_expected"],
                "amount_received": row["amount_received"],
                "amount_difference": row["amount_difference"],
                "reference": row["reference"],
                "customer_id": row["customer_id"],
                "source_type": row["source_type"],
                "note": row["note"],
            },
        )
        return row

    def _find_mpesa_collection_by_receipt(self, receipt_no: str) -> Optional[dict[str, Any]]:
        normalized = str(receipt_no or "").strip().upper()
        if not normalized:
            return None
        for row in self.mpesa_collections:
            if row.get("receipt_no", "").strip().upper() == normalized:
                return row
        return None

    def _append_sale_payment(
        self,
        sale: dict[str, Any],
        *,
        method: str,
        amount: float,
        reference: str = "",
        customer_id: str = "",
    ) -> None:
        sale.setdefault("payments", []).append(
            {
                "method": str(method or "unknown").strip().lower(),
                "amount": round(float(amount or 0.0), 2),
                "reference": str(reference or "").strip().upper(),
                "customer_id": str(customer_id or "").strip(),
            }
        )

    def _recompute_sale_payment_metrics(self, sale: dict[str, Any]) -> None:
        total_amount = round(float(sale.get("total_amount", 0.0) or 0.0), 2)
        payment_total = round(
            sum(round(float(payment.get("amount", 0.0) or 0.0), 2) for payment in sale.get("payments", [])),
            2,
        )
        cash_total = round(
            sum(
                round(float(payment.get("amount", 0.0) or 0.0), 2)
                for payment in sale.get("payments", [])
                if str(payment.get("method", "")).strip().lower() == "cash"
            ),
            2,
        )
        raw_overage = round(max(payment_total - total_amount, 0.0), 2)
        change_due = round(min(cash_total, raw_overage), 2)
        amount_due = round(max(total_amount - payment_total, 0.0), 2)
        amount_overpaid = round(max(raw_overage - change_due, 0.0), 2)

        sale["payment_total"] = payment_total
        sale["change_due"] = change_due
        sale["amount_due"] = amount_due
        sale["amount_overpaid"] = amount_overpaid

        if sale.get("payment_status") in {"partially_refunded", "refunded"}:
            return

        open_anomalies = [
            self.payment_anomalies.get(anomaly_no)
            for anomaly_no in sale.get("payment_anomaly_nos", [])
            if self.payment_anomalies.get(anomaly_no) and self.payment_anomalies[anomaly_no].get("status") == "open"
        ]
        sale["payment_anomaly_count"] = len(open_anomalies)

        if any(
            row.get("anomaly_type") in {"duplicate_payment", "mpesa_duplicate"}
            for row in open_anomalies
            if row
        ):
            sale["payment_status"] = "duplicate_payment"
        elif any(row.get("anomaly_type") == "underpaid" for row in open_anomalies if row) or amount_due > 0:
            sale["payment_status"] = "partially_paid"
        elif amount_overpaid > 0:
            sale["payment_status"] = "overpaid"
        else:
            sale["payment_status"] = "paid"

    def _create_lot(
        self,
        barcode: str,
        product_name: str,
        qty_on_hand: int,
        unit_cost: float,
        source_type: str,
        source_no: str,
        rack_code: str = "",
        store_rack_code: str = "",
        note: str = "",
        lot_no: str = "",
        created_at: Optional[str] = None,
    ) -> dict[str, Any]:
        lot_id = next(self._lot_ids)
        created = created_at or now_iso()
        return {
            "id": lot_id,
            "lot_no": lot_no or f"LOT-{lot_id:06d}",
            "barcode": barcode,
            "product_name": product_name,
            "qty_on_hand": qty_on_hand,
            "original_qty": qty_on_hand,
            "unit_cost": round(unit_cost, 2),
            "source_type": source_type,
            "source_no": source_no,
            "rack_code": rack_code,
            "store_rack_code": store_rack_code,
            "note": note,
            "created_at": created,
            "updated_at": created,
        }

    def _normalize_lot_row(
        self,
        lot: dict[str, Any],
        *,
        default_barcode: str,
        default_product_name: str,
        default_unit_cost: float,
        default_source_type: str,
        default_source_no: str,
        default_rack_code: str = "",
        default_store_rack_code: str = "",
    ) -> tuple[dict[str, Any], bool]:
        updated = False
        normalized = dict(lot)
        if "id" not in normalized:
            normalized["id"] = next(self._lot_ids)
            updated = True
        if not normalized.get("lot_no"):
            normalized["lot_no"] = f"LOT-{normalized['id']:06d}"
            updated = True
        defaults = {
            "barcode": default_barcode,
            "product_name": default_product_name,
            "qty_on_hand": 0,
            "original_qty": normalized.get("qty_on_hand", 0),
            "unit_cost": round(default_unit_cost, 2),
            "source_type": default_source_type,
            "source_no": default_source_no,
            "rack_code": default_rack_code,
            "store_rack_code": default_store_rack_code,
            "note": "",
            "created_at": now_iso(),
            "updated_at": now_iso(),
        }
        for field, value in defaults.items():
            if field not in normalized:
                normalized[field] = value
                updated = True
        normalized["qty_on_hand"] = int(normalized.get("qty_on_hand", 0))
        normalized["original_qty"] = int(normalized.get("original_qty", normalized["qty_on_hand"]))
        normalized["unit_cost"] = round(float(normalized.get("unit_cost", default_unit_cost)), 2)
        return normalized, updated

    def _sync_warehouse_stock_from_lots(self, warehouse_code: str, barcode: str) -> None:
        stock_key = f"{warehouse_code}||{barcode}"
        product = self.get_product_by_barcode(barcode)
        lots = [lot for lot in self.warehouse_lots.get(stock_key, []) if lot.get("qty_on_hand", 0) > 0]
        self.warehouse_lots[stock_key] = lots
        total_qty = sum(lot["qty_on_hand"] for lot in lots)
        total_cost = sum(lot["qty_on_hand"] * lot["unit_cost"] for lot in lots)
        current = self.warehouse_stock.get(stock_key, {})
        rack_code = current.get("rack_code", product["rack_code"])
        if lots:
            latest_lot = max(lots, key=lambda lot: lot.get("updated_at", lot["created_at"]))
            rack_code = latest_lot.get("rack_code") or rack_code
        self.warehouse_stock[stock_key] = {
            "warehouse_code": warehouse_code,
            "barcode": barcode,
            "product_name": product["product_name"],
            "rack_code": rack_code,
            "qty_on_hand": total_qty,
            "cost_price": round(total_cost / total_qty, 2) if total_qty else current.get("cost_price", product["cost_price"]),
            "lot_count": len(lots),
            "updated_at": now_iso(),
        }

    def _sync_store_stock_from_lots(self, store_code: str, barcode: str) -> None:
        stock_key = f"{store_code}||{barcode}"
        product = self.get_product_by_barcode(barcode)
        lots = [lot for lot in self.store_lots.get(stock_key, []) if lot.get("qty_on_hand", 0) > 0]
        self.store_lots[stock_key] = lots
        total_qty = sum(lot["qty_on_hand"] for lot in lots)
        total_cost = sum(lot["qty_on_hand"] * lot["unit_cost"] for lot in lots)
        current = self.store_stock.get(stock_key, {})
        store_rack_code = current.get("store_rack_code", "")
        if lots:
            latest_lot = max(lots, key=lambda lot: lot.get("updated_at", lot["created_at"]))
            store_rack_code = latest_lot.get("store_rack_code") or store_rack_code
        self.store_stock[stock_key] = {
            "store_code": store_code,
            "barcode": barcode,
            "product_name": product["product_name"],
            "qty_on_hand": total_qty,
            "cost_price": round(total_cost / total_qty, 2) if total_qty else current.get("cost_price", product["cost_price"]),
            "lot_count": len(lots),
            "store_rack_code": store_rack_code,
            "updated_at": now_iso(),
        }

    def _hydrate_inventory_lots(self) -> bool:
        updated = False
        normalized_warehouse: dict[str, list[dict[str, Any]]] = defaultdict(list)
        normalized_store: dict[str, list[dict[str, Any]]] = defaultdict(list)

        for stock_key in set(list(self.warehouse_stock.keys()) + list(self.warehouse_lots.keys())):
            warehouse_code, barcode = stock_key.split("||", 1)
            row = self.warehouse_stock.get(stock_key) or {
                "barcode": barcode,
                "product_name": self.get_product_by_barcode(barcode)["product_name"],
                "cost_price": self.get_product_by_barcode(barcode)["cost_price"],
                "rack_code": self.get_product_by_barcode(barcode)["rack_code"],
                "qty_on_hand": 0,
                "updated_at": now_iso(),
            }
            lots = self.warehouse_lots.get(stock_key, [])
            if not lots and row.get("qty_on_hand", 0) > 0:
                product = self.get_product_by_barcode(barcode)
                lots = [
                    self._create_lot(
                        barcode=barcode,
                        product_name=product["product_name"],
                        qty_on_hand=row["qty_on_hand"],
                        unit_cost=row.get("cost_price", product["cost_price"]),
                        source_type="legacy_balance",
                        source_no="legacy-import",
                        rack_code=row.get("rack_code", product["rack_code"]),
                        created_at=row.get("updated_at", now_iso()),
                    )
                ]
                updated = True
            hydrated_lots: list[dict[str, Any]] = []
            for lot in lots:
                normalized_lot, lot_updated = self._normalize_lot_row(
                    lot,
                    default_barcode=barcode,
                    default_product_name=row["product_name"],
                    default_unit_cost=row.get("cost_price", self.get_product_by_barcode(barcode)["cost_price"]),
                    default_source_type="legacy_balance",
                    default_source_no="legacy-import",
                    default_rack_code=row.get("rack_code", ""),
                )
                hydrated_lots.append(normalized_lot)
                updated = updated or lot_updated
            normalized_warehouse[stock_key] = hydrated_lots

        for stock_key in set(list(self.store_stock.keys()) + list(self.store_lots.keys())):
            store_code, barcode = stock_key.split("||", 1)
            row = self.store_stock.get(stock_key) or {
                "barcode": barcode,
                "product_name": self.get_product_by_barcode(barcode)["product_name"],
                "cost_price": self.get_product_by_barcode(barcode)["cost_price"],
                "store_rack_code": "",
                "qty_on_hand": 0,
                "updated_at": now_iso(),
                "store_code": store_code,
            }
            lots = self.store_lots.get(stock_key, [])
            if not lots and row.get("qty_on_hand", 0) > 0:
                product = self.get_product_by_barcode(barcode)
                lots = [
                    self._create_lot(
                        barcode=barcode,
                        product_name=product["product_name"],
                        qty_on_hand=row["qty_on_hand"],
                        unit_cost=row.get("cost_price", product["cost_price"]),
                        source_type="legacy_balance",
                        source_no="legacy-import",
                        store_rack_code=row.get("store_rack_code", ""),
                        created_at=row.get("updated_at", now_iso()),
                    )
                ]
                updated = True
            hydrated_lots: list[dict[str, Any]] = []
            for lot in lots:
                normalized_lot, lot_updated = self._normalize_lot_row(
                    lot,
                    default_barcode=barcode,
                    default_product_name=row["product_name"],
                    default_unit_cost=row.get("cost_price", self.get_product_by_barcode(barcode)["cost_price"]),
                    default_source_type="legacy_balance",
                    default_source_no="legacy-import",
                    default_store_rack_code=row.get("store_rack_code", ""),
                )
                hydrated_lots.append(normalized_lot)
                updated = updated or lot_updated
            normalized_store[stock_key] = hydrated_lots

        self.warehouse_lots = defaultdict(list, normalized_warehouse)
        self.store_lots = defaultdict(list, normalized_store)

        for stock_key in set(list(self.warehouse_stock.keys()) + list(self.warehouse_lots.keys())):
            warehouse_code, barcode = stock_key.split("||", 1)
            self._sync_warehouse_stock_from_lots(warehouse_code, barcode)
        for stock_key in set(list(self.store_stock.keys()) + list(self.store_lots.keys())):
            store_code, barcode = stock_key.split("||", 1)
            self._sync_store_stock_from_lots(store_code, barcode)

        return updated

    def _ensure_seed_users(self) -> None:
        existing = {user["username"]: user for user in self.users.values()}
        updated = False
        for row in DEFAULT_USERS:
            current = existing.get(row["username"])
            if current:
                if not current.get("password_hash"):
                    current.update(hash_password(row.get("password", "demo1234")))
                    updated = True
                if row.get("store_code") and not current.get("store_code"):
                    current["store_code"] = row["store_code"]
                    updated = True
                continue
            user_id = next(self._user_ids)
            credentials = hash_password(row.get("password", "demo1234"))
            self.users[user_id] = {
                "id": user_id,
                "created_at": now_iso(),
                **{key: value for key, value in row.items() if key != "password"},
                **credentials,
            }
            updated = True
        if updated and self._state_file.exists() and not self._bootstrapping_from_disk:
            self._persist()

    def _ensure_seed_store_racks(self) -> bool:
        updated = False
        for store in self.stores.values():
            store_code = str(store.get("code") or "").strip().upper()
            if not store_code:
                continue
            for template in STORE_RACK_TEMPLATE:
                rack_code = str(template.get("rack_code") or "").strip().upper()
                if not rack_code:
                    continue
                rack_key = f"{store_code}||{rack_code}"
                current = self.store_rack_locations.get(rack_key)
                if current:
                    if not current.get("category_hint") and template.get("category_hint"):
                        current["category_hint"] = str(template["category_hint"]).strip()
                        current["updated_at"] = now_iso()
                        updated = True
                    if not current.get("status"):
                        current["status"] = "active"
                        current["updated_at"] = now_iso()
                        updated = True
                    continue
                self.store_rack_locations[rack_key] = {
                    "store_code": store_code,
                    "rack_code": rack_code,
                    "category_hint": str(template.get("category_hint") or "").strip(),
                    "status": "active",
                    "created_at": now_iso(),
                    "updated_at": now_iso(),
                }
                updated = True
        if updated and self._state_file.exists() and not self._bootstrapping_from_disk:
            self._persist()
        return updated

    def _normalize_supplier_code(self, value: str) -> str:
        normalized = self._normalize_code_fragment(value, "SUP")
        if normalized in {"SUPPLIER", "SUPPLI", "SUPPLIE"}:
            normalized = "SUP"
        return normalized[:10]

    def _next_available_supplier_code(self, base_name: str) -> str:
        base_code = self._normalize_supplier_code(base_name)
        if base_code not in self.suppliers:
            return base_code
        suffix = 2
        while True:
            candidate = f"{base_code[:7]}{suffix:03d}"[:10]
            if candidate not in self.suppliers:
                return candidate
            suffix += 1

    def _create_supplier_record(self, payload: dict[str, Any], actor: str) -> dict[str, Any]:
        supplier_name = str(payload.get("name") or "").strip()
        if not supplier_name:
            raise HTTPException(status_code=400, detail="Supplier name is required")
        existing = self.find_supplier_by_name(supplier_name)
        if existing:
            return existing
        requested_code = str(payload.get("code") or "").strip().upper()
        supplier_code = self._next_available_supplier_code(requested_code or supplier_name)
        if requested_code and requested_code in self.suppliers:
            raise HTTPException(status_code=409, detail=f"Supplier code {requested_code} already exists")
        supplier = {
            "id": next(self._supplier_ids),
            "code": supplier_code,
            "name": supplier_name,
            "name_zh": str(payload.get("name_zh") or "").strip(),
            "contact_person": str(payload.get("contact_person") or "").strip(),
            "phone": str(payload.get("phone") or "").strip(),
            "note": str(payload.get("note") or "").strip(),
            "status": str(payload.get("status") or "active").strip().lower() or "active",
            "created_at": now_iso(),
            "created_by": actor,
        }
        self.suppliers[supplier_code] = supplier
        return supplier

    def _ensure_supplier_exists(self, supplier_name: str, actor: str) -> dict[str, Any]:
        existing = self.find_supplier_by_name(supplier_name)
        if existing:
            return existing
        supplier = self._create_supplier_record({"name": supplier_name}, actor=actor)
        self._log_event(
            event_type="supplier.auto_created",
            entity_type="supplier",
            entity_id=supplier["code"],
            actor=actor,
            summary=f"Supplier {supplier['name']} auto-created",
            details={"code": supplier["code"]},
        )
        return supplier

    def _ensure_seed_suppliers(self) -> None:
        # Suppliers are now maintained entirely through the UI.
        # Do not auto-seed defaults on startup, otherwise a manual clear
        # immediately repopulates data the user is intentionally resetting.
        return

    def list_suppliers(self) -> list[dict[str, Any]]:
        return sorted(self.suppliers.values(), key=lambda row: (row.get("status") != "active", row["name"].lower()))

    def find_supplier_by_name(self, supplier_name: str) -> Optional[dict[str, Any]]:
        normalized_name = str(supplier_name or "").strip().lower()
        if not normalized_name:
            return None
        for supplier in self.suppliers.values():
            if str(supplier.get("name", "")).strip().lower() == normalized_name:
                return supplier
        return None

    def create_supplier(self, payload: dict[str, Any]) -> dict[str, Any]:
        actor = self._require_user_role(payload["created_by"], {"admin", "warehouse_clerk", "warehouse_supervisor", "area_supervisor"})
        existing = self.find_supplier_by_name(payload.get("name", ""))
        if existing:
            raise HTTPException(status_code=409, detail=f"Supplier {existing['name']} already exists")
        supplier = self._create_supplier_record(payload, actor=actor["username"])
        self._log_event(
            event_type="supplier.created",
            entity_type="supplier",
            entity_id=supplier["code"],
            actor=actor["username"],
            summary=f"Supplier {supplier['name']} created",
            details=supplier,
        )
        self._persist()
        return supplier

    def _normalize_cargo_type_code(self, value: str) -> str:
        normalized = self._normalize_code_fragment(value, "CARGO")
        if normalized in {"CARGO", "CARGOTYPE", "GOODS"}:
            normalized = "CARGO"
        return normalized[:12]

    def _next_available_cargo_type_code(self, base_name: str) -> str:
        base_code = self._normalize_cargo_type_code(base_name)
        if base_code not in self.cargo_types:
            return base_code
        suffix = 2
        while True:
            candidate = f"{base_code[:8]}{suffix:04d}"[:12]
            if candidate not in self.cargo_types:
                return candidate
            suffix += 1

    def _create_cargo_type_record(self, payload: dict[str, Any], actor: str) -> dict[str, Any]:
        cargo_type_name = str(payload.get("name") or "").strip()
        if not cargo_type_name:
            raise HTTPException(status_code=400, detail="Cargo type name is required")
        existing = self.find_cargo_type_by_name(cargo_type_name)
        if existing:
            return existing
        requested_code = str(payload.get("code") or "").strip().upper()
        cargo_type_code = self._next_available_cargo_type_code(requested_code or cargo_type_name)
        if requested_code and requested_code in self.cargo_types:
            raise HTTPException(status_code=409, detail=f"Cargo type code {requested_code} already exists")
        cargo_type = {
            "id": next(self._cargo_type_ids),
            "code": cargo_type_code,
            "name": cargo_type_name,
            "note": str(payload.get("note") or "").strip(),
            "status": str(payload.get("status") or "active").strip().lower() or "active",
            "created_at": now_iso(),
            "created_by": actor,
        }
        self.cargo_types[cargo_type_code] = cargo_type
        return cargo_type

    def _ensure_cargo_type_exists(self, cargo_type_name: str, actor: str) -> dict[str, Any]:
        existing = self.find_cargo_type_by_name(cargo_type_name)
        if existing:
            return existing
        cargo_type = self._create_cargo_type_record({"name": cargo_type_name}, actor=actor)
        self._log_event(
            event_type="cargo_type.auto_created",
            entity_type="cargo_type",
            entity_id=cargo_type["code"],
            actor=actor,
            summary=f"Cargo type {cargo_type['name']} auto-created",
            details={"code": cargo_type["code"]},
        )
        return cargo_type

    def _ensure_seed_cargo_types(self) -> None:
        existing_names = {row["name"].strip().lower(): row for row in self.cargo_types.values() if row.get("name")}
        updated = False
        for row in DEFAULT_CARGO_TYPES:
            current = existing_names.get(row["name"].strip().lower())
            if current:
                if not current.get("note") and row.get("note"):
                    current["note"] = row["note"]
                    updated = True
                if not current.get("created_by"):
                    current["created_by"] = "system"
                    updated = True
                continue
            cargo_type = self._create_cargo_type_record(row, actor="system")
            cargo_type["created_at"] = now_iso()
            updated = True
        if updated and self._state_file.exists() and not self._bootstrapping_from_disk:
            self._persist()

    def _hydrate_cargo_types(self) -> bool:
        normalized_rows: dict[str, dict[str, Any]] = {}
        updated = False
        for key, row in self.cargo_types.items():
            normalized_code = self._normalize_cargo_type_code(row.get("code") or key or row.get("name", ""))
            current = dict(row)
            current["id"] = int(row.get("id") or next(self._cargo_type_ids))
            current["code"] = normalized_code
            current["name"] = str(row.get("name") or "").strip()
            current["note"] = str(row.get("note") or "").strip()
            current["status"] = str(row.get("status") or "active").strip().lower() or "active"
            current["created_at"] = row.get("created_at") or now_iso()
            current["created_by"] = row.get("created_by") or "system"
            normalized_rows[normalized_code] = current
            if current != row or normalized_code != key:
                updated = True

        known_names = {row["name"].strip().lower() for row in normalized_rows.values() if row.get("name")}
        cargo_type_names = set()
        for batch in self.parcel_batches.values():
            if str(batch.get("cargo_type", "")).strip():
                cargo_type_names.add(str(batch.get("cargo_type")).strip())

        for cargo_type_name in sorted(cargo_type_names):
            if cargo_type_name.lower() in known_names:
                continue
            created = self._create_cargo_type_record({"name": cargo_type_name}, actor="system")
            normalized_rows[created["code"]] = created
            known_names.add(cargo_type_name.lower())
            updated = True

        if normalized_rows != self.cargo_types:
            self.cargo_types = normalized_rows
            updated = True
        return updated

    def list_cargo_types(self) -> list[dict[str, Any]]:
        return sorted(self.cargo_types.values(), key=lambda row: (row.get("status") != "active", row["name"].lower()))

    def find_cargo_type_by_name(self, cargo_type_name: str) -> Optional[dict[str, Any]]:
        normalized_name = str(cargo_type_name or "").strip().lower()
        if not normalized_name:
            return None
        for cargo_type in self.cargo_types.values():
            if str(cargo_type.get("name", "")).strip().lower() == normalized_name:
                return cargo_type
        return None

    def create_cargo_type(self, payload: dict[str, Any]) -> dict[str, Any]:
        actor = self._require_user_role(payload["created_by"], {"admin", "warehouse_clerk", "warehouse_supervisor", "area_supervisor"})
        existing = self.find_cargo_type_by_name(payload.get("name", ""))
        if existing:
            raise HTTPException(status_code=409, detail=f"Cargo type {existing['name']} already exists")
        cargo_type = self._create_cargo_type_record(payload, actor=actor["username"])
        self._log_event(
            event_type="cargo_type.created",
            entity_type="cargo_type",
            entity_id=cargo_type["code"],
            actor=actor["username"],
            summary=f"Cargo type {cargo_type['name']} created",
            details=cargo_type,
        )
        self._persist()
        return cargo_type

    def _public_user(self, user: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": user["id"],
            "username": user["username"],
            "full_name": user["full_name"],
            "role_code": user["role_code"],
            "store_code": user.get("store_code"),
            "is_active": user.get("is_active", True),
            "created_at": user["created_at"],
        }

    def _add_warehouse_lot(
        self,
        warehouse_code: str,
        barcode: str,
        qty: int,
        unit_cost: float,
        source_type: str,
        source_no: str,
        rack_code: str = "",
        note: str = "",
    ) -> dict[str, Any]:
        product = self.get_product_by_barcode(barcode)
        stock_key = f"{warehouse_code}||{barcode}"
        lot = self._create_lot(
            barcode=barcode,
            product_name=product["product_name"],
            qty_on_hand=qty,
            unit_cost=unit_cost,
            source_type=source_type,
            source_no=source_no,
            rack_code=rack_code or product["rack_code"],
            note=note,
        )
        self.warehouse_lots[stock_key].append(lot)
        self._sync_warehouse_stock_from_lots(warehouse_code, barcode)
        return lot

    def _add_store_lot(
        self,
        store_code: str,
        barcode: str,
        qty: int,
        unit_cost: float,
        source_type: str,
        source_no: str,
        store_rack_code: str = "",
        note: str = "",
    ) -> dict[str, Any]:
        product = self.get_product_by_barcode(barcode)
        stock_key = f"{store_code}||{barcode}"
        lot = self._create_lot(
            barcode=barcode,
            product_name=product["product_name"],
            qty_on_hand=qty,
            unit_cost=unit_cost,
            source_type=source_type,
            source_no=source_no,
            store_rack_code=store_rack_code,
            note=note,
        )
        self.store_lots[stock_key].append(lot)
        self._sync_store_stock_from_lots(store_code, barcode)
        return lot

    def _consume_lots_fifo(
        self,
        lots: list[dict[str, Any]],
        required_qty: int,
    ) -> list[dict[str, Any]]:
        remaining = required_qty
        allocations: list[dict[str, Any]] = []
        ordered_lots = sorted(lots, key=lambda row: (row.get("created_at", ""), row["id"]))
        for lot in ordered_lots:
            if remaining <= 0:
                break
            available = lot.get("qty_on_hand", 0)
            if available <= 0:
                continue
            take_qty = min(available, remaining)
            lot["qty_on_hand"] = available - take_qty
            lot["updated_at"] = now_iso()
            allocations.append(
                {
                    "lot_no": lot["lot_no"],
                    "qty": take_qty,
                    "unit_cost": round(lot["unit_cost"], 2),
                    "line_cost": round(take_qty * lot["unit_cost"], 2),
                    "source_type": lot.get("source_type", ""),
                    "source_no": lot.get("source_no", ""),
                }
            )
            remaining -= take_qty
        if remaining > 0:
            raise HTTPException(status_code=400, detail="Insufficient lot quantity for requested operation")
        return allocations

    def _restore_lot_allocations_to_warehouse(
        self,
        warehouse_code: str,
        barcode: str,
        allocations: list[dict[str, Any]],
        rack_code: str = "",
    ) -> None:
        for allocation in allocations:
            self._add_warehouse_lot(
                warehouse_code=warehouse_code,
                barcode=barcode,
                qty=allocation["qty"],
                unit_cost=allocation["unit_cost"],
                source_type="transfer_restore",
                source_no=allocation.get("source_no", ""),
                rack_code=rack_code,
                note=f"Restored from allocation {allocation['lot_no']}",
            )

    def _allocations_for_quantity(
        self,
        allocations: list[dict[str, Any]],
        required_qty: int,
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        remaining = required_qty
        used: list[dict[str, Any]] = []
        leftover: list[dict[str, Any]] = []
        for allocation in allocations:
            allocation_qty = allocation["qty"]
            if remaining <= 0:
                leftover.append(dict(allocation))
                continue
            take_qty = min(allocation_qty, remaining)
            used.append(
                {
                    **allocation,
                    "qty": take_qty,
                    "line_cost": round(take_qty * allocation["unit_cost"], 2),
                }
            )
            if allocation_qty > take_qty:
                leftover.append(
                    {
                        **allocation,
                        "qty": allocation_qty - take_qty,
                        "line_cost": round((allocation_qty - take_qty) * allocation["unit_cost"], 2),
                    }
                )
            remaining -= take_qty
        return used, leftover

    def _normalize_china_source_cost_entry(self, payload: Optional[dict[str, Any]]) -> dict[str, Any]:
        row = payload or {}
        documents = []
        for document in row.get("documents") or []:
            filename = str(document.get("filename") or "").strip()
            data_url = str(document.get("data_url") or "").strip()
            if not filename or not data_url:
                continue
            documents.append(
                {
                    "filename": filename,
                    "content_type": str(document.get("content_type") or "").strip(),
                    "data_url": data_url,
                }
            )
        return {
            "currency": str(row.get("currency") or "").strip().upper(),
            "amount": round(float(row.get("amount") or 0), 2),
            "payment_method": str(row.get("payment_method") or "").strip(),
            "payer": str(row.get("payer") or "").strip(),
            "payment_reference": str(row.get("payment_reference") or "").strip(),
            "documents": documents,
        }

    def _empty_china_source_cost_entries(self) -> dict[str, Any]:
        return {
            "head_transport": self._normalize_china_source_cost_entry({}),
            "customs_clearance": self._normalize_china_source_cost_entry({}),
            "tail_transport": self._normalize_china_source_cost_entry({}),
        }

    def _normalize_china_source_cost_entries(self, payload: Optional[dict[str, Any]]) -> dict[str, Any]:
        row = payload or {}
        return {
            "head_transport": self._normalize_china_source_cost_entry(row.get("head_transport")),
            "customs_clearance": self._normalize_china_source_cost_entry(row.get("customs_clearance")),
            "tail_transport": self._normalize_china_source_cost_entry(row.get("tail_transport")),
        }

    def _normalize_china_source_line(
        self,
        source_pool_token: str,
        payload: dict[str, Any],
        line_index: int,
        actor: str,
    ) -> dict[str, Any]:
        supplier_name = str(payload.get("supplier_name") or "").strip()
        category_main = str(payload.get("category_main") or "").strip()
        category_sub = str(payload.get("category_sub") or "").strip()
        package_count = int(payload.get("package_count") or 0)
        unit_weight_kg = round(float(payload.get("unit_weight_kg") or 0), 2)
        if not supplier_name:
            raise HTTPException(status_code=400, detail=f"China source line {line_index + 1} is missing supplier_name")
        if not category_main:
            raise HTTPException(status_code=400, detail=f"China source line {line_index + 1} is missing category_main")
        if not category_sub:
            raise HTTPException(status_code=400, detail=f"China source line {line_index + 1} is missing category_sub")
        if package_count <= 0:
            raise HTTPException(status_code=400, detail=f"China source line {line_index + 1} package_count must be greater than 0")
        if unit_weight_kg <= 0:
            raise HTTPException(status_code=400, detail=f"China source line {line_index + 1} unit_weight_kg must be greater than 0")
        self._ensure_supplier_exists(supplier_name, actor=actor)
        source_bale_token = str(payload.get("source_bale_token") or "").strip() or f"{source_pool_token}-{line_index + 1:03d}"
        package_code = str(payload.get("package_code") or "").strip() or source_bale_token
        total_weight_kg = payload.get("total_weight_kg")
        if total_weight_kg is None:
            total_weight_kg = round(package_count * unit_weight_kg, 2)
        return {
            "source_bale_token": source_bale_token,
            "supplier_name": supplier_name,
            "package_code": package_code,
            "supplier_name_zh": str(payload.get("supplier_name_zh") or "").strip(),
            "category_main": category_main,
            "category_sub": category_sub,
            "category_main_zh": str(payload.get("category_main_zh") or "").strip(),
            "category_sub_zh": str(payload.get("category_sub_zh") or "").strip(),
            "package_count": package_count,
            "unit_weight_kg": unit_weight_kg,
            "unit_cost_amount": round(float(payload.get("unit_cost_amount") or 0), 2),
            "unit_cost_currency": str(payload.get("unit_cost_currency") or "CNY").strip().upper() or "CNY",
            "total_weight_kg": round(float(total_weight_kg or 0), 2),
            "source_pool_token": source_pool_token,
        }

    def _build_china_source_record_response(self, row: dict[str, Any]) -> dict[str, Any]:
        lines = [
            {
                "source_bale_token": str(line.get("source_bale_token") or "").strip(),
                "supplier_name": str(line.get("supplier_name") or "").strip(),
                "package_code": str(line.get("package_code") or line.get("source_bale_token") or "").strip(),
                "supplier_name_zh": str(line.get("supplier_name_zh") or "").strip(),
                "category_main": str(line.get("category_main") or "").strip(),
                "category_sub": str(line.get("category_sub") or "").strip(),
                "category_main_zh": str(line.get("category_main_zh") or "").strip(),
                "category_sub_zh": str(line.get("category_sub_zh") or "").strip(),
                "package_count": int(line.get("package_count") or 0),
                "unit_weight_kg": round(float(line.get("unit_weight_kg") or 0), 2),
                "unit_cost_amount": round(float(line.get("unit_cost_amount") or 0), 2),
                "unit_cost_currency": str(line.get("unit_cost_currency") or "CNY").strip().upper() or "CNY",
                "total_weight_kg": round(float(line.get("total_weight_kg") or 0), 2),
            }
            for line in row.get("lines") or []
        ]
        supplier_names = {str(line.get("supplier_name") or "").strip().lower() for line in lines if str(line.get("supplier_name") or "").strip()}
        category_pairs = {
            f"{str(line.get('category_main') or '').strip().lower()}||{str(line.get('category_sub') or '').strip().lower()}"
            for line in lines
            if str(line.get("category_main") or "").strip() and str(line.get("category_sub") or "").strip()
        }
        return {
            "source_pool_token": str(row.get("source_pool_token") or "").strip(),
            "container_type": str(row.get("container_type") or "").strip(),
            "customs_notice_no": str(row.get("customs_notice_no") or "").strip().upper(),
            "total_bale_count": sum(int(line.get("package_count") or 0) for line in lines),
            "domestic_total_weight_kg": round(sum(float(line.get("total_weight_kg") or 0) for line in lines), 2),
            "supplier_count": len(supplier_names),
            "category_count": len(category_pairs),
            "lines": lines,
            "cost_entries": self._normalize_china_source_cost_entries(row.get("cost_entries")),
            "created_at": str(row.get("created_at") or ""),
            "updated_at": str(row.get("updated_at") or ""),
            "cost_updated_at": row.get("cost_updated_at"),
        }

    def _find_china_source_record_by_customs_notice(
        self,
        customs_notice_no: str,
        exclude_source_pool_token: str = "",
    ) -> Optional[dict[str, Any]]:
        normalized_notice = str(customs_notice_no or "").strip().upper()
        excluded_token = str(exclude_source_pool_token or "").strip()
        if not normalized_notice:
            return None
        for row in self.china_source_records.values():
            if excluded_token and str(row.get("source_pool_token") or "").strip() == excluded_token:
                continue
            if str(row.get("customs_notice_no") or "").strip().upper() == normalized_notice:
                return row
        return None

    def get_china_source_record(self, source_pool_token: str) -> dict[str, Any]:
        normalized_token = str(source_pool_token or "").strip()
        row = self.china_source_records.get(normalized_token)
        if not row:
            raise HTTPException(status_code=404, detail=f"Unknown china source record {normalized_token}")
        return self._build_china_source_record_response(row)

    def list_china_source_records(self) -> list[dict[str, Any]]:
        rows = [self._build_china_source_record_response(row) for row in self.china_source_records.values()]
        return sorted(rows, key=lambda row: (row.get("updated_at") or "", row.get("source_pool_token") or ""), reverse=True)

    def create_or_update_china_source_record(self, payload: dict[str, Any], created_by: str) -> dict[str, Any]:
        actor = self._require_user_role(created_by, {"warehouse_clerk", "warehouse_supervisor"})
        source_pool_token = str(payload.get("source_pool_token") or "").strip()
        if not source_pool_token:
            raise HTTPException(status_code=400, detail="source_pool_token is required")
        customs_notice_no = str(payload.get("customs_notice_no") or "").strip().upper()
        if not customs_notice_no:
            raise HTTPException(status_code=400, detail="customs_notice_no is required")
        existing_by_notice = self._find_china_source_record_by_customs_notice(
            customs_notice_no,
            exclude_source_pool_token=source_pool_token,
        )
        if existing_by_notice:
            raise HTTPException(status_code=409, detail=f"Customs notice {customs_notice_no} already has a china source record")
        lines_payload = payload.get("lines") or []
        if not lines_payload:
            raise HTTPException(status_code=400, detail="At least one china source line is required")
        lines = [
            self._normalize_china_source_line(source_pool_token, line, index, actor["username"])
            for index, line in enumerate(lines_payload)
        ]
        existing = self.china_source_records.get(source_pool_token, {})
        now = now_iso()
        row = {
            "source_pool_token": source_pool_token,
            "container_type": str(payload.get("container_type") or "").strip(),
            "customs_notice_no": customs_notice_no,
            "lines": lines,
            "cost_entries": self._normalize_china_source_cost_entries(existing.get("cost_entries")),
            "created_at": str(existing.get("created_at") or now),
            "updated_at": now,
            "cost_updated_at": existing.get("cost_updated_at"),
            "created_by": str(existing.get("created_by") or actor["username"]).strip(),
        }
        self.china_source_records[source_pool_token] = row
        self._log_event(
            event_type="china_source.saved",
            entity_type="china_source",
            entity_id=source_pool_token,
            actor=actor["username"],
            summary=f"China source {source_pool_token} saved",
            details={"customs_notice_no": customs_notice_no, "line_count": len(lines)},
        )
        self._persist()
        return self._build_china_source_record_response(row)

    def update_china_source_cost(self, source_pool_token: str, payload: dict[str, Any], updated_by: str) -> dict[str, Any]:
        actor = self._require_user_role(updated_by, {"warehouse_clerk", "warehouse_supervisor"})
        normalized_token = str(source_pool_token or "").strip()
        row = self.china_source_records.get(normalized_token)
        if not row:
            raise HTTPException(status_code=404, detail=f"Unknown china source record {normalized_token}")
        row["cost_entries"] = self._normalize_china_source_cost_entries(payload.get("cost_entries"))
        row["cost_updated_at"] = now_iso()
        row["updated_at"] = row["cost_updated_at"]
        self._log_event(
            event_type="china_source.cost_updated",
            entity_type="china_source",
            entity_id=normalized_token,
            actor=actor["username"],
            summary=f"China source cost updated for {normalized_token}",
            details={"customs_notice_no": str(row.get("customs_notice_no") or "").strip().upper()},
        )
        self._persist()
        return self._build_china_source_record_response(row)

    def _find_china_source_line_by_token(self, source_bale_token: str) -> tuple[Optional[dict[str, Any]], Optional[dict[str, Any]]]:
        normalized_token = str(source_bale_token or "").strip()
        if not normalized_token:
            return None, None
        for record in self.china_source_records.values():
            for line in record.get("lines") or []:
                if str(line.get("source_bale_token") or "").strip() == normalized_token:
                    return record, line
        return None, None

    def _apparel_piece_weight_key(self, category_main: str, category_sub: str) -> str:
        return f"{str(category_main or '').strip().lower()}||{str(category_sub or '').strip().lower()}"

    def list_apparel_piece_weights(self) -> list[dict[str, Any]]:
        return sorted(
            self.apparel_piece_weights.values(),
            key=lambda row: (
                str(row.get("category_main") or "").strip().lower(),
                str(row.get("category_sub") or "").strip().lower(),
            ),
        )

    def upsert_apparel_piece_weight(self, payload: dict[str, Any], updated_by: str) -> dict[str, Any]:
        actor = self._require_user_role(updated_by, {"warehouse_supervisor"})
        category_main = str(payload.get("category_main") or "").strip()
        category_sub = str(payload.get("category_sub") or "").strip()
        standard_weight_kg = round(float(payload.get("standard_weight_kg") or 0), 2)
        if not category_main or not category_sub:
            raise HTTPException(status_code=400, detail="category_main and category_sub are required")
        if standard_weight_kg <= 0:
            raise HTTPException(status_code=400, detail="standard_weight_kg must be greater than 0")
        key = self._apparel_piece_weight_key(category_main, category_sub)
        row = {
            "category_main": category_main,
            "category_sub": category_sub,
            "standard_weight_kg": standard_weight_kg,
            "note": str(payload.get("note") or "").strip(),
            "updated_at": now_iso(),
            "updated_by": actor["username"],
        }
        self.apparel_piece_weights[key] = row
        self._log_event(
            event_type="apparel_piece_weight.saved",
            entity_type="apparel_piece_weight",
            entity_id=key,
            actor=actor["username"],
            summary=f"Apparel piece weight saved for {category_main} / {category_sub}",
            details={"standard_weight_kg": standard_weight_kg},
        )
        self._persist()
        return row

    def delete_apparel_piece_weight(self, category_main: str, category_sub: str, deleted_by: str) -> None:
        actor = self._require_user_role(deleted_by, {"warehouse_supervisor"})
        key = self._apparel_piece_weight_key(category_main, category_sub)
        if key not in self.apparel_piece_weights:
            raise HTTPException(status_code=404, detail=f"Unknown apparel piece weight {category_main} / {category_sub}")
        del self.apparel_piece_weights[key]
        self._log_event(
            event_type="apparel_piece_weight.deleted",
            entity_type="apparel_piece_weight",
            entity_id=key,
            actor=actor["username"],
            summary=f"Apparel piece weight deleted for {category_main} / {category_sub}",
            details={},
        )
        self._persist()

    def list_apparel_default_costs(self) -> list[dict[str, Any]]:
        return sorted(
            self.apparel_default_costs.values(),
            key=lambda row: (
                str(row.get("category_main") or "").strip().lower(),
                str(row.get("category_sub") or "").strip().lower(),
                str(row.get("grade") or "").strip().upper(),
            ),
        )

    def upsert_apparel_default_cost(self, payload: dict[str, Any], updated_by: str) -> dict[str, Any]:
        actor = self._require_user_role(updated_by, {"warehouse_supervisor"})
        category_main = str(payload.get("category_main") or "").strip()
        category_sub = str(payload.get("category_sub") or "").strip()
        grade = self._normalize_apparel_grade(payload.get("grade"))
        default_cost_kes = round(float(payload.get("default_cost_kes") or 0), 2)
        if not category_main or not category_sub:
            raise HTTPException(status_code=400, detail="category_main and category_sub are required")
        if default_cost_kes <= 0:
            raise HTTPException(status_code=400, detail="default_cost_kes must be greater than 0")
        key = self._apparel_default_cost_key(category_main, category_sub, grade)
        existing = self.apparel_default_costs.get(key)
        row = {
            "category_main": category_main,
            "category_sub": category_sub,
            "grade": grade,
            "default_cost_kes": default_cost_kes,
            "note": str(payload.get("note") or "").strip(),
            "updated_at": now_iso(),
            "updated_by": actor["username"],
        }
        self.apparel_default_costs[key] = row
        previous_cost = round(float(existing.get("default_cost_kes") or 0), 2) if existing else 0
        if existing and previous_cost > 0 and previous_cost != default_cost_kes:
            previous_rack_key = self._apparel_sorting_rack_key(category_main, category_sub, grade, previous_cost)
            if previous_rack_key in self.apparel_sorting_racks:
                del self.apparel_sorting_racks[previous_rack_key]
        self._log_event(
            event_type="apparel_default_cost.saved",
            entity_type="apparel_default_cost",
            entity_id=key,
            actor=actor["username"],
            summary=f"Apparel default cost saved for {category_main} / {category_sub} / {grade}",
            details={"default_cost_kes": default_cost_kes},
        )
        self._persist()
        return row

    def delete_apparel_default_cost(self, category_main: str, category_sub: str, grade: str, deleted_by: str) -> None:
        actor = self._require_user_role(deleted_by, {"warehouse_supervisor"})
        normalized_grade = self._normalize_apparel_grade(grade)
        key = self._apparel_default_cost_key(category_main, category_sub, normalized_grade)
        if key not in self.apparel_default_costs:
            raise HTTPException(
                status_code=404,
                detail=f"Unknown apparel default cost {category_main} / {category_sub} / {normalized_grade}",
            )
        deleted_row = self.apparel_default_costs[key]
        del self.apparel_default_costs[key]
        linked_rack_key = self._apparel_sorting_rack_key(
            category_main,
            category_sub,
            normalized_grade,
            round(float(deleted_row.get("default_cost_kes") or 0), 2),
        )
        if linked_rack_key in self.apparel_sorting_racks:
            del self.apparel_sorting_racks[linked_rack_key]
        self._log_event(
            event_type="apparel_default_cost.deleted",
            entity_type="apparel_default_cost",
            entity_id=key,
            actor=actor["username"],
            summary=f"Apparel default cost deleted for {category_main} / {category_sub} / {normalized_grade}",
            details={},
        )
        self._persist()

    def list_apparel_sorting_racks(self) -> list[dict[str, Any]]:
        return sorted(
            self.apparel_sorting_racks.values(),
            key=lambda row: (
                str(row.get("category_main") or "").strip().lower(),
                str(row.get("category_sub") or "").strip().lower(),
                str(row.get("grade") or "").strip().upper(),
                round(float(row.get("default_cost_kes") or 0), 2),
            ),
        )

    def upsert_apparel_sorting_rack(self, payload: dict[str, Any], updated_by: str) -> dict[str, Any]:
        actor = self._require_user_role(updated_by, {"warehouse_supervisor"})
        category_main = str(payload.get("category_main") or "").strip()
        category_sub = str(payload.get("category_sub") or "").strip()
        grade = self._normalize_apparel_grade(payload.get("grade"))
        default_cost_kes = self._normalize_money_two_decimals(payload.get("default_cost_kes"), "default_cost_kes")
        rack_code = str(payload.get("rack_code") or "").strip().upper()
        if not category_main or not category_sub:
            raise HTTPException(status_code=400, detail="category_main and category_sub are required")
        if not rack_code:
            raise HTTPException(status_code=400, detail="rack_code is required")
        default_cost_row = self._find_apparel_default_cost(category_main, category_sub, grade)
        if not default_cost_row:
            raise HTTPException(status_code=409, detail="请先在 4.7 默认成本价管理里配置对应默认成本价")
        configured_cost = round(float(default_cost_row.get("default_cost_kes") or 0), 2)
        if configured_cost != default_cost_kes:
            raise HTTPException(status_code=409, detail="分拣库位必须绑定当前默认成本价，请先按 4.7 当前口径保存")
        key = self._apparel_sorting_rack_key(category_main, category_sub, grade, default_cost_kes)
        row = {
            "category_main": category_main,
            "category_sub": category_sub,
            "grade": grade,
            "default_cost_kes": default_cost_kes,
            "rack_code": rack_code,
            "note": str(payload.get("note") or "").strip(),
            "updated_at": now_iso(),
            "updated_by": actor["username"],
        }
        self.apparel_sorting_racks[key] = row
        self._log_event(
            event_type="apparel_sorting_rack.saved",
            entity_type="apparel_sorting_rack",
            entity_id=key,
            actor=actor["username"],
            summary=f"Apparel sorting rack saved for {category_main} / {category_sub} / {grade}",
            details={"default_cost_kes": default_cost_kes, "rack_code": rack_code},
        )
        self._persist()
        return row

    def delete_apparel_sorting_rack(
        self,
        category_main: str,
        category_sub: str,
        grade: str,
        default_cost_kes: float,
        deleted_by: str,
    ) -> None:
        actor = self._require_user_role(deleted_by, {"warehouse_supervisor"})
        normalized_grade = self._normalize_apparel_grade(grade)
        normalized_cost = self._normalize_money_two_decimals(default_cost_kes, "default_cost_kes")
        key = self._apparel_sorting_rack_key(category_main, category_sub, normalized_grade, normalized_cost)
        if key not in self.apparel_sorting_racks:
            raise HTTPException(
                status_code=404,
                detail=f"Unknown apparel sorting rack {category_main} / {category_sub} / {normalized_grade} / {normalized_cost:.2f}",
            )
        del self.apparel_sorting_racks[key]
        self._log_event(
            event_type="apparel_sorting_rack.deleted",
            entity_type="apparel_sorting_rack",
            entity_id=key,
            actor=actor["username"],
            summary=f"Apparel sorting rack deleted for {category_main} / {category_sub} / {normalized_grade}",
            details={"default_cost_kes": normalized_cost},
        )
        self._persist()

    def create_parcel_batch(self, payload: dict[str, Any]) -> dict[str, Any]:
        actor = self._require_user_role(payload["received_by"], {"warehouse_clerk", "warehouse_supervisor"})
        shipment = self.inbound_shipments.get(str(payload["inbound_shipment_no"]).strip().upper())
        if not shipment:
            raise HTTPException(status_code=404, detail="Inbound shipment not found")
        if shipment.get("intake_status") not in {"open", "", None}:
            raise HTTPException(status_code=409, detail="这张船单已经完成包裹入仓确认，不能继续追加包裹。")
        source_record = self._find_china_source_record_by_customs_notice(str(shipment.get("customs_notice_no") or "").strip().upper())
        if source_record:
            source_bale_token = str(payload.get("source_bale_token") or "").strip()
            if not source_bale_token:
                raise HTTPException(status_code=400, detail="这张船单已有关联的中方来源，请先选择中方预报行再录包裹入库。")
            matched_record, source_line = self._find_china_source_line_by_token(source_bale_token)
            if not matched_record or not source_line or str(matched_record.get("source_pool_token") or "").strip() != str(source_record.get("source_pool_token") or "").strip():
                raise HTTPException(status_code=409, detail=f"找不到 source bale token：{source_bale_token}")
            if str(payload.get("supplier_name") or "").strip() and str(payload.get("supplier_name") or "").strip().lower() != str(source_line.get("supplier_name") or "").strip().lower():
                raise HTTPException(status_code=409, detail="当前 supplier_name 和中方来源预报不一致，请从中方预报行带入。")
            if str(payload.get("category_main") or "").strip() and str(payload.get("category_main") or "").strip().lower() != str(source_line.get("category_main") or "").strip().lower():
                raise HTTPException(status_code=409, detail="当前 category_main 和中方来源预报不一致，请从中方预报行带入。")
            if str(payload.get("category_sub") or "").strip() and str(payload.get("category_sub") or "").strip().lower() != str(source_line.get("category_sub") or "").strip().lower():
                raise HTTPException(status_code=409, detail="当前 category_sub 和中方来源预报不一致，请从中方预报行带入。")
            payload = {
                **payload,
                "supplier_name": str(source_line.get("supplier_name") or "").strip(),
                "category_main": str(source_line.get("category_main") or "").strip(),
                "category_sub": str(source_line.get("category_sub") or "").strip(),
            }
        supplier = self._ensure_supplier_exists(payload["supplier_name"], actor=actor["username"])
        cargo_type = self._ensure_cargo_type_exists(payload["cargo_type"], actor=actor["username"])
        batch_id = next(self._parcel_batch_ids)
        supplier_code = supplier["code"]
        cargo_code = cargo_type["code"]
        date_code = datetime.now(NAIROBI_TZ).strftime("%Y%m%d")
        batch_no = f"BL-{date_code}-{supplier_code}-{cargo_code}-{batch_id:03d}"
        barcode = f"P{date_code}{batch_id:05d}"
        parcel_batch = {
            "id": batch_id,
            "batch_no": batch_no,
            "barcode": barcode,
            "intake_type": str(payload.get("intake_type") or shipment["shipment_type"]).strip().lower(),
            "inbound_shipment_no": shipment["shipment_no"],
            "source_bale_token": str(payload.get("source_bale_token") or "").strip(),
            "customs_notice_no": shipment["customs_notice_no"],
            "unload_date": shipment["unload_date"],
            "supplier_code": supplier["code"],
            "supplier_name": supplier["name"],
            "cargo_type_code": cargo_type["code"],
            "cargo_type": cargo_type["name"],
            "category_main": str(payload.get("category_main") or "").strip(),
            "category_sub": str(payload.get("category_sub") or "").strip(),
            "received_by": actor["username"],
            "package_count": int(payload["package_count"]),
            "total_weight": payload.get("total_weight"),
            "note": payload.get("note", ""),
            "status": "pending_sorting",
            "received_at": now_iso(),
            "updated_at": now_iso(),
        }
        self.parcel_batches[batch_no] = parcel_batch
        self._log_event(
            event_type="parcel_batch.created",
            entity_type="parcel_batch",
            entity_id=batch_no,
            actor=actor["username"],
            summary=f"Parcel batch {batch_no} received",
            details={
                "inbound_shipment_no": shipment["shipment_no"],
                "customs_notice_no": shipment["customs_notice_no"],
                "supplier_name": parcel_batch["supplier_name"],
                "cargo_type_code": parcel_batch["cargo_type_code"],
                "cargo_type": parcel_batch["cargo_type"],
                "category_main": parcel_batch["category_main"],
                "category_sub": parcel_batch["category_sub"],
                "package_count": parcel_batch["package_count"],
            },
        )
        self._persist()
        return parcel_batch

    def create_inbound_shipment(self, payload: dict[str, Any]) -> dict[str, Any]:
        shipment_id = next(self._inbound_shipment_ids)
        shipment_type = str(payload["shipment_type"]).strip().lower()
        customs_notice_no = str(payload["customs_notice_no"]).strip().upper()
        unload_date = _normalize_unload_date_value(payload["unload_date"])
        shipment_no = f"{customs_notice_no}-{_shipment_unload_suffix(unload_date)}"
        if shipment_no in self.inbound_shipments:
            raise HTTPException(status_code=409, detail=f"Inbound shipment {shipment_no} already exists")
        coc_documents = []
        for row in payload.get("coc_documents") or []:
            data_url = str(row.get("data_url") or "").strip()
            filename = str(row.get("filename") or "").strip()
            if not data_url or not filename:
                continue
            coc_documents.append(
                {
                    "filename": filename,
                    "content_type": str(row.get("content_type") or "").strip(),
                    "data_url": data_url,
                }
            )
        row = {
            "id": shipment_id,
            "shipment_no": shipment_no,
            "shipment_type": shipment_type,
            "customs_notice_no": customs_notice_no,
            "unload_date": unload_date,
            "coc_goods_manifest": str(payload["coc_goods_manifest"]).strip(),
            "note": str(payload.get("note") or "").strip(),
            "coc_documents": coc_documents,
            "intake_status": "open",
            "intake_confirmed_at": None,
            "intake_confirmed_by": "",
            "intake_confirmed_total_packages": 0,
            "bales_generated_at": None,
            "bales_generated_by": "",
            "created_at": now_iso(),
            "updated_at": now_iso(),
        }
        self.inbound_shipments[shipment_no] = row
        self._log_event(
            event_type="inbound_shipment.created",
            entity_type="inbound_shipment",
            entity_id=shipment_no,
            actor="system",
            summary=f"Inbound shipment {shipment_no} created",
            details={
                "shipment_no": shipment_no,
                "shipment_type": shipment_type,
                "customs_notice_no": customs_notice_no,
                "unload_date": unload_date,
                "coc_document_count": len(coc_documents),
            },
        )
        self._persist()
        return row

    def list_inbound_shipments(self, shipment_type: Optional[str] = None) -> list[dict[str, Any]]:
        rows = []
        for row in self.inbound_shipments.values():
            normalized = dict(row)
            parcel_rows = [batch for batch in self.parcel_batches.values() if batch.get("inbound_shipment_no") == row["shipment_no"]]
            normalized["coc_documents"] = [
                {
                    "filename": str(doc.get("filename") or "").strip(),
                    "content_type": str(doc.get("content_type") or "").strip(),
                    "data_url": str(doc.get("data_url") or "").strip(),
                }
                for doc in row.get("coc_documents") or []
                if str(doc.get("filename") or "").strip() and str(doc.get("data_url") or "").strip()
            ]
            normalized["total_parcel_batches"] = len(parcel_rows)
            normalized["total_packages"] = sum(int(batch.get("package_count") or 0) for batch in parcel_rows)
            rows.append(normalized)
        if shipment_type:
            normalized = str(shipment_type).strip().lower()
            rows = [row for row in rows if str(row.get("shipment_type", "")).strip().lower() == normalized]
        return sorted(rows, key=lambda row: row["created_at"], reverse=True)

    def get_inbound_shipment(self, shipment_no: str) -> dict[str, Any]:
        normalized_shipment_no = str(shipment_no or "").strip().upper()
        if not normalized_shipment_no:
            raise HTTPException(status_code=400, detail="请先选择运输主档 / 关单号")
        for row in self.list_inbound_shipments():
            if str(row.get("shipment_no") or "").strip().upper() == normalized_shipment_no:
                return row
        raise HTTPException(status_code=404, detail="运输主档不存在")

    def list_parcel_batches(self, status: Optional[str] = None, shipment_no: Optional[str] = None) -> list[dict[str, Any]]:
        rows = list(self.parcel_batches.values())
        if status:
            normalized_status = status.strip().lower()
            rows = [row for row in rows if row["status"].lower() == normalized_status]
        if shipment_no:
            normalized_shipment_no = shipment_no.strip().upper()
            rows = [row for row in rows if row.get("inbound_shipment_no", "").strip().upper() == normalized_shipment_no]
        return sorted(rows, key=lambda row: row["received_at"], reverse=True)

    def confirm_inbound_shipment_intake(self, shipment_no: str, payload: dict[str, Any]) -> dict[str, Any]:
        actor = self._require_user_role(payload["confirmed_by"], {"warehouse_supervisor"})
        normalized_shipment_no = shipment_no.strip().upper()
        shipment = self.inbound_shipments.get(normalized_shipment_no)
        if not shipment:
            raise HTTPException(status_code=404, detail="运输主档不存在")
        if shipment.get("intake_status") not in {"open", "", None}:
            raise HTTPException(status_code=409, detail="这张船单已经确认过包裹入仓")
        parcel_rows = [row for row in self.parcel_batches.values() if row.get("inbound_shipment_no", "").strip().upper() == normalized_shipment_no]
        if not parcel_rows:
            raise HTTPException(status_code=400, detail="请先完成至少一笔包裹入仓，再做总确认")
        declared_total_packages = int(payload["declared_total_packages"])
        actual_total_packages = sum(int(row.get("package_count") or 0) for row in parcel_rows)
        if declared_total_packages != actual_total_packages:
            raise HTTPException(
                status_code=409,
                detail=f"箱单总包裹数是 {declared_total_packages}，系统点数是 {actual_total_packages}，请先核对一致后再确认。",
            )
        shipment["intake_status"] = "confirmed"
        shipment["intake_confirmed_at"] = now_iso()
        shipment["intake_confirmed_by"] = actor["username"]
        shipment["intake_confirmed_total_packages"] = actual_total_packages
        shipment["updated_at"] = now_iso()
        self._log_event(
            event_type="inbound_shipment.intake_confirmed",
            entity_type="inbound_shipment",
            entity_id=normalized_shipment_no,
            actor=actor["username"],
            summary=f"Inbound shipment {normalized_shipment_no} intake confirmed",
            details={"total_packages": actual_total_packages, "note": payload.get("note", "")},
        )
        self._persist()
        return self.get_inbound_shipment(normalized_shipment_no)

    def generate_bale_barcodes(self, shipment_no: str, generated_by: str) -> list[dict[str, Any]]:
        actor = self._require_user_role(generated_by, {"warehouse_supervisor"})
        normalized_shipment_no = shipment_no.strip().upper()
        shipment = self.inbound_shipments.get(normalized_shipment_no)
        if not shipment:
            raise HTTPException(status_code=404, detail="运输主档不存在")
        if shipment.get("intake_status") != "confirmed":
            raise HTTPException(status_code=409, detail="请先完成这张船单的包裹总确认，再生成 bale barcode")
        existing = [row for row in self.bale_barcodes.values() if row.get("shipment_no") == normalized_shipment_no]
        if existing:
            raise HTTPException(status_code=409, detail="这张船单已经生成过 bale barcode")
        parcel_rows = self.list_parcel_batches(shipment_no=normalized_shipment_no)
        if not parcel_rows:
            raise HTTPException(status_code=400, detail="当前船单还没有包裹批次，不能生成 bale barcode")
        created_rows: list[dict[str, Any]] = []
        for batch in parcel_rows:
            batch_package_count = int(batch.get("package_count") or 0)
            for serial_no in range(1, batch_package_count + 1):
                row_id = next(self._bale_barcode_ids)
                legacy_bale_barcode = f"BALE-{batch['batch_no']}-{serial_no:03d}"
                row = {
                    "id": row_id,
                    "bale_barcode": "",
                    "legacy_bale_barcode": legacy_bale_barcode,
                    "scan_token": "",
                    "shipment_no": normalized_shipment_no,
                    "parcel_batch_no": batch["batch_no"],
                    "source_bale_token": str(batch.get("source_bale_token") or "").strip(),
                    "customs_notice_no": batch["customs_notice_no"],
                    "unload_date": batch["unload_date"],
                    "supplier_name": batch["supplier_name"],
                    "cargo_type": batch["cargo_type"],
                    "category_main": batch.get("category_main", ""),
                    "category_sub": batch.get("category_sub", ""),
                    "serial_no": serial_no,
                    "weight_kg": batch.get("total_weight"),
                    "status": "ready_for_sorting",
                    "destination_judgement": "pending",
                    "current_location": "warehouse_raw_bale_stock",
                    "occupied_by_task_no": "",
                    "entered_bale_sales_pool_at": None,
                    "entered_bale_sales_pool_by": "",
                    "printed_at": None,
                    "printed_by": "",
                    "created_at": now_iso(),
                    "updated_at": now_iso(),
                }
                self._ensure_raw_bale_defaults(row)
                self.bale_barcodes[str(row.get("bale_barcode") or "").strip().upper()] = row
                created_rows.append(row)
        shipment["intake_status"] = "bales_ready"
        shipment["bales_generated_at"] = now_iso()
        shipment["bales_generated_by"] = actor["username"]
        shipment["updated_at"] = now_iso()
        self._log_event(
            event_type="inbound_shipment.bales_generated",
            entity_type="inbound_shipment",
            entity_id=normalized_shipment_no,
            actor=actor["username"],
            summary=f"Bale barcode generated for {normalized_shipment_no}",
            details={"bale_count": len(created_rows)},
        )
        self._persist()
        return created_rows

    def list_bale_barcodes(
        self,
        shipment_no: Optional[str] = None,
        status: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        rows = []
        for row in self.bale_barcodes.values():
            normalized = dict(row)
            self._ensure_raw_bale_defaults(normalized)
            printed_jobs = [
                job for job in self.print_jobs
                if str(job.get("job_type") or "") == "bale_barcode_label"
                and self._raw_bale_matches_reference(
                    normalized,
                    str(job.get("barcode") or "").strip().upper(),
                )
                and str(job.get("status") or "").strip().lower() == "printed"
            ]
            latest_print_job = max(printed_jobs, key=lambda job: str(job.get("printed_at") or job.get("created_at") or "")) if printed_jobs else None
            normalized["printed_at"] = latest_print_job.get("printed_at") if latest_print_job else None
            normalized["printed_by"] = latest_print_job.get("printed_by", "") if latest_print_job else ""
            rows.append(normalized)
        if shipment_no:
            normalized_shipment_no = shipment_no.strip().upper()
            rows = [row for row in rows if row.get("shipment_no", "").strip().upper() == normalized_shipment_no]
        if status:
            normalized_status = status.strip().lower()
            rows = [row for row in rows if row.get("status", "").strip().lower() == normalized_status]
        return sorted(rows, key=lambda row: (row["shipment_no"], row["parcel_batch_no"], row["serial_no"]))

    def list_raw_bales(
        self,
        shipment_no: Optional[str] = None,
        status: Optional[str] = None,
        destination_judgement: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        rows = [self._build_raw_bale_row(row) for row in self.bale_barcodes.values()]
        if shipment_no:
            normalized_shipment_no = shipment_no.strip().upper()
            rows = [row for row in rows if str(row.get("shipment_no") or "").strip().upper() == normalized_shipment_no]
        if status:
            normalized_status = status.strip().lower()
            rows = [row for row in rows if str(row.get("status") or "").strip().lower() == normalized_status]
        if destination_judgement:
            normalized_destination = destination_judgement.strip().lower()
            rows = [
                row
                for row in rows
                if str(row.get("destination_judgement") or "").strip().lower() == normalized_destination
            ]
        return sorted(rows, key=lambda row: (row["shipment_no"], row["parcel_batch_no"], row["serial_no"]))

    def route_raw_bale_to_sorting(self, bale_barcode: str, payload: dict[str, Any]) -> dict[str, Any]:
        actor = self._require_user_role(payload["updated_by"], {"warehouse_supervisor"})
        bale = self._get_raw_bale_or_raise(bale_barcode)
        status = str(bale.get("status") or "").strip().lower()
        if status in {"sorting_in_progress", "sorted"} or str(bale.get("occupied_by_task_no") or "").strip():
            raise HTTPException(status_code=409, detail=f"{bale['bale_barcode']} 已被主流程占用，不能重新判定去向。")
        if status == "in_bale_sales_pool":
            raise HTTPException(status_code=409, detail=f"{bale['bale_barcode']} 已移交整包销售池，不能再进入分拣。")
        bale["destination_judgement"] = "sorting"
        bale["status"] = "ready_for_sorting"
        bale["current_location"] = "warehouse_raw_bale_stock"
        bale["updated_at"] = now_iso()
        self._ensure_raw_bale_defaults(bale)
        self._log_event(
            event_type="raw_bale.routed_to_sorting",
            entity_type="raw_bale",
            entity_id=bale["bale_barcode"],
            actor=actor["username"],
            summary=f"Raw bale {bale['bale_barcode']} routed to sorting",
            details={"shipment_no": bale["shipment_no"], "note": payload.get("note", "")},
        )
        self._persist()
        return self._build_raw_bale_row(bale)

    def route_raw_bale_to_bale_sales_pool(self, bale_barcode: str, payload: dict[str, Any]) -> dict[str, Any]:
        actor = self._require_user_role(payload["updated_by"], {"warehouse_supervisor"})
        bale = self._get_raw_bale_or_raise(bale_barcode)
        status = str(bale.get("status") or "").strip().lower()
        if status in {"sorting_in_progress", "sorted"} or str(bale.get("occupied_by_task_no") or "").strip():
            raise HTTPException(status_code=409, detail=f"{bale['bale_barcode']} 已被主流程占用，不能移交整包销售池。")
        bale["destination_judgement"] = "bale_sales_pool"
        bale["status"] = "in_bale_sales_pool"
        bale["entered_bale_sales_pool_at"] = now_iso()
        bale["entered_bale_sales_pool_by"] = actor["username"]
        bale["updated_at"] = now_iso()
        self._ensure_raw_bale_defaults(bale)
        self._log_event(
            event_type="raw_bale.routed_to_bale_sales_pool",
            entity_type="raw_bale",
            entity_id=bale["bale_barcode"],
            actor=actor["username"],
            summary=f"Raw bale {bale['bale_barcode']} moved to bale sales pool",
            details={"shipment_no": bale["shipment_no"], "note": payload.get("note", "")},
        )
        self._persist()
        return self._build_raw_bale_row(bale)

    def _bale_sales_entry_id(self, source_type: str, reference: str) -> str:
        return f"{str(source_type or '').strip().lower()}__{str(reference or '').strip().upper()}"

    def _bale_sales_order_no(self, order_index: int) -> str:
        return f"BLS-{datetime.now(NAIROBI_TZ).strftime('%Y%m%d')}-{int(order_index or 0):03d}"

    def _float_or_default(self, value: Any, default: float = 0.0) -> float:
        try:
            return float(value)
        except (TypeError, ValueError):
            return float(default)

    def _raw_bale_sales_source_cost_kes(self, bale: dict[str, Any]) -> float:
        source_bale_token = str(bale.get("source_bale_token") or "").strip()
        parcel_batch_no = str(bale.get("parcel_batch_no") or "").strip().upper()
        weight_kg = 0.0
        if not source_bale_token:
            return 0.0
        raw_record, source_line = self._find_china_source_line_by_token(source_bale_token)
        if not raw_record:
            return 0.0
        if source_line:
            unit_weight_kg = round(self._float_or_default(source_line.get("unit_weight_kg"), 0), 2)
            if unit_weight_kg > 0:
                weight_kg = unit_weight_kg
            else:
                line_package_count = int(source_line.get("package_count") or 0)
                line_total_weight_kg = round(self._float_or_default(source_line.get("total_weight_kg"), 0), 2)
                if line_package_count > 0 and line_total_weight_kg > 0:
                    weight_kg = round(line_total_weight_kg / line_package_count, 2)
        if weight_kg <= 0:
            parcel_batch = self.parcel_batches.get(parcel_batch_no)
            if parcel_batch:
                batch_package_count = int(parcel_batch.get("package_count") or 0)
                batch_total_weight = round(self._float_or_default(parcel_batch.get("total_weight"), 0), 2)
                if batch_package_count > 0 and batch_total_weight > 0:
                    weight_kg = round(batch_total_weight / batch_package_count, 2)
        if weight_kg <= 0:
            weight_kg = round(self._float_or_default(bale.get("weight_kg"), 0), 2)
        if weight_kg <= 0:
            return 0.0
        source_record = self._build_china_source_record_response(raw_record)
        cost_per_kg_kes = self._china_source_cost_per_kg_kes(source_record)
        if cost_per_kg_kes <= 0:
            return 0.0
        return round(weight_kg * cost_per_kg_kes, 2)

    def _normalize_bale_sales_pricing_profile(self, entry_id: str, source_cost_kes: float) -> dict[str, Any]:
        profile = dict(self.bale_sales_pricing_profiles.get(entry_id) or {})
        editable_cost_kes = round(
            self._float_or_default(profile.get("editable_cost_kes"), source_cost_kes),
            2,
        )
        downstream_cost_kes = round(
            self._float_or_default(profile.get("downstream_cost_kes"), 0),
            2,
        )
        total_cost_kes = round(editable_cost_kes + downstream_cost_kes, 2)
        margin_rate_raw = profile.get("margin_rate")
        target_sale_price_raw = profile.get("target_sale_price_kes")
        margin_rate = (
            round(self._float_or_default(margin_rate_raw, 0), 4)
            if margin_rate_raw not in {None, ""}
            else None
        )
        if target_sale_price_raw not in {None, ""}:
            target_sale_price_kes = round(self._float_or_default(target_sale_price_raw, 0), 2)
        elif margin_rate is not None and total_cost_kes > 0:
            target_sale_price_kes = round(total_cost_kes * (1 + margin_rate), 2)
        else:
            target_sale_price_kes = 0.0
        if margin_rate is None:
            if total_cost_kes > 0 and target_sale_price_kes > 0:
                margin_rate = round(max(target_sale_price_kes / total_cost_kes - 1, 0.0), 4)
            else:
                margin_rate = 0.0
        return {
            "editable_cost_kes": editable_cost_kes,
            "downstream_cost_kes": downstream_cost_kes,
            "total_cost_kes": total_cost_kes,
            "margin_rate": margin_rate,
            "target_sale_price_kes": target_sale_price_kes,
            "note": str(profile.get("note") or "").strip(),
            "updated_at": profile.get("updated_at"),
            "updated_by": str(profile.get("updated_by") or "").strip(),
        }

    def _build_bale_sales_candidate_from_raw(self, bale: dict[str, Any]) -> dict[str, Any]:
        self._ensure_raw_bale_defaults(bale)
        entry_id = self._bale_sales_entry_id("raw_direct_sale", str(bale.get("bale_barcode") or "").strip().upper())
        source_cost_kes = self._raw_bale_sales_source_cost_kes(bale)
        pricing = self._normalize_bale_sales_pricing_profile(entry_id, source_cost_kes)
        raw_status = str(bale.get("status") or "").strip().lower()
        outbound_order_no = str(bale.get("bale_sales_order_no") or "").strip().upper()
        if outbound_order_no:
            status = "sold"
        elif raw_status == "in_bale_sales_pool":
            status = "available"
        else:
            status = "unavailable"
        return {
            "entry_id": entry_id,
            "source_type": "raw_direct_sale",
            "source_label": "原始未分拣 bale 直售",
            "bale_barcode": str(bale.get("bale_barcode") or "").strip().upper(),
            "shipment_no": str(bale.get("shipment_no") or "").strip().upper(),
            "parcel_batch_no": str(bale.get("parcel_batch_no") or "").strip().upper(),
            "source_bale_token": str(bale.get("source_bale_token") or "").strip(),
            "supplier_name": str(bale.get("supplier_name") or "").strip(),
            "category_main": str(bale.get("category_main") or "").strip(),
            "category_sub": str(bale.get("category_sub") or "").strip(),
            "weight_kg": round(self._float_or_default(bale.get("weight_kg"), 0), 2),
            "package_count": 1,
            "entered_sales_pool_at": bale.get("entered_bale_sales_pool_at"),
            "status": status,
            "raw_status": raw_status,
            "is_available": status == "available",
            "outbound_order_no": outbound_order_no,
            "source_cost_kes": source_cost_kes,
            "editable_cost_kes": pricing["editable_cost_kes"],
            "downstream_cost_kes": pricing["downstream_cost_kes"],
            "total_cost_kes": pricing["total_cost_kes"],
            "margin_rate": pricing["margin_rate"],
            "target_sale_price_kes": pricing["target_sale_price_kes"],
            "pricing_note": pricing["note"],
            "pricing_updated_at": pricing["updated_at"],
            "pricing_updated_by": pricing["updated_by"],
        }

    def _get_bale_sales_candidate_or_raise(self, entry_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
        normalized_entry_id = str(entry_id or "").strip()
        if normalized_entry_id.lower().startswith("raw_direct_sale__"):
            bale_reference = normalized_entry_id.split("__", 1)[1]
            bale = self._get_raw_bale_or_raise(bale_reference)
            destination = str(bale.get("destination_judgement") or "").strip().lower()
            if destination != "bale_sales_pool":
                raise HTTPException(status_code=409, detail=f"{bale_reference} 还没有进入整包销售池")
            return self._build_bale_sales_candidate_from_raw(bale), bale
        raise HTTPException(status_code=404, detail=f"Unknown bale sales entry: {normalized_entry_id}")

    def list_bale_sales_candidates(
        self,
        shipment_no: Optional[str] = None,
        status: Optional[str] = None,
        source_type: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        normalized_shipment_no = str(shipment_no or "").strip().upper()
        normalized_status = str(status or "").strip().lower()
        normalized_source_type = str(source_type or "").strip().lower()
        for bale in self.bale_barcodes.values():
            destination = str(bale.get("destination_judgement") or "").strip().lower()
            if destination != "bale_sales_pool":
                continue
            candidate = self._build_bale_sales_candidate_from_raw(bale)
            if normalized_shipment_no and candidate["shipment_no"] != normalized_shipment_no:
                continue
            if normalized_status and candidate["status"] != normalized_status:
                continue
            if normalized_source_type and candidate["source_type"] != normalized_source_type:
                continue
            rows.append(candidate)
        return sorted(
            rows,
            key=lambda row: (
                0 if row["status"] == "available" else 1,
                str(row.get("shipment_no") or ""),
                str(row.get("bale_barcode") or ""),
            ),
        )

    def update_bale_sales_candidate_pricing(self, entry_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        self._require_user_role(payload["updated_by"], {"admin", "warehouse_supervisor", "area_supervisor"})
        candidate, _bale = self._get_bale_sales_candidate_or_raise(entry_id)
        if not candidate["is_available"]:
            raise HTTPException(status_code=409, detail=f"{candidate['bale_barcode']} 当前不可编辑销售定价")
        profile = dict(self.bale_sales_pricing_profiles.get(candidate["entry_id"]) or {})
        current = self._normalize_bale_sales_pricing_profile(candidate["entry_id"], candidate["source_cost_kes"])
        editable_cost_kes = round(
            self._float_or_default(
                payload.get("editable_cost_kes"),
                current["editable_cost_kes"],
            ),
            2,
        )
        downstream_cost_kes = round(
            self._float_or_default(
                payload.get("downstream_cost_kes"),
                current["downstream_cost_kes"],
            ),
            2,
        )
        total_cost_kes = round(editable_cost_kes + downstream_cost_kes, 2)
        if payload.get("margin_rate") not in {None, ""}:
            margin_rate = round(self._float_or_default(payload.get("margin_rate"), current["margin_rate"]), 4)
            target_sale_price_kes = round(total_cost_kes * (1 + margin_rate), 2) if total_cost_kes > 0 else 0.0
        elif payload.get("target_sale_price_kes") not in {None, ""}:
            target_sale_price_kes = round(
                self._float_or_default(payload.get("target_sale_price_kes"), current["target_sale_price_kes"]),
                2,
            )
            margin_rate = round(max(target_sale_price_kes / total_cost_kes - 1, 0.0), 4) if total_cost_kes > 0 else 0.0
        else:
            margin_rate = current["margin_rate"]
            target_sale_price_kes = (
                round(total_cost_kes * (1 + margin_rate), 2)
                if margin_rate > 0 and total_cost_kes > 0
                else current["target_sale_price_kes"]
            )
        profile.update(
            {
                "editable_cost_kes": editable_cost_kes,
                "downstream_cost_kes": downstream_cost_kes,
                "margin_rate": margin_rate,
                "target_sale_price_kes": round(target_sale_price_kes, 2),
                "note": str(payload.get("note") or profile.get("note") or "").strip(),
                "updated_at": now_iso(),
                "updated_by": str(payload.get("updated_by") or "").strip(),
            }
        )
        self.bale_sales_pricing_profiles[candidate["entry_id"]] = profile
        self._persist()
        updated_candidate, _ = self._get_bale_sales_candidate_or_raise(candidate["entry_id"])
        return updated_candidate

    def create_bale_sales_order(self, payload: dict[str, Any]) -> dict[str, Any]:
        actor = self._require_user_role(payload["created_by"], {"admin", "warehouse_supervisor", "area_supervisor"})
        selected_entry_ids: set[str] = set()
        selected_rows: list[tuple[dict[str, Any], dict[str, Any], float]] = []
        for item in payload.get("items", []) or []:
            entry_id = str(item.get("entry_id") or "").strip()
            if not entry_id:
                raise HTTPException(status_code=400, detail="entry_id is required")
            if entry_id in selected_entry_ids:
                raise HTTPException(status_code=400, detail=f"Duplicated bale sales entry: {entry_id}")
            selected_entry_ids.add(entry_id)
            candidate, bale = self._get_bale_sales_candidate_or_raise(entry_id)
            if not candidate["is_available"]:
                raise HTTPException(status_code=409, detail=f"{candidate['bale_barcode']} 当前不可出库")
            sale_price_kes = round(
                self._float_or_default(
                    item.get("sale_price_kes"),
                    candidate.get("target_sale_price_kes") or candidate.get("total_cost_kes") or 0,
                ),
                2,
            )
            selected_rows.append((candidate, bale, sale_price_kes))

        order_no = self._bale_sales_order_no(next(self._bale_sales_order_ids))
        completed_at = now_iso()
        items: list[dict[str, Any]] = []
        total_cost_kes = 0.0
        total_amount_kes = 0.0
        for candidate, bale, sale_price_kes in selected_rows:
            total_cost = round(self._float_or_default(candidate.get("total_cost_kes"), 0), 2)
            profit = round(sale_price_kes - total_cost, 2)
            items.append(
                {
                    "entry_id": candidate["entry_id"],
                    "bale_barcode": candidate["bale_barcode"],
                    "shipment_no": candidate["shipment_no"],
                    "supplier_name": candidate["supplier_name"],
                    "category_main": candidate["category_main"],
                    "category_sub": candidate["category_sub"],
                    "weight_kg": candidate["weight_kg"],
                    "source_cost_kes": candidate["source_cost_kes"],
                    "total_cost_kes": total_cost,
                    "sale_price_kes": sale_price_kes,
                    "profit_kes": profit,
                }
            )
            total_cost_kes = round(total_cost_kes + total_cost, 2)
            total_amount_kes = round(total_amount_kes + sale_price_kes, 2)
            bale["status"] = "sold_via_bale_sales"
            bale["bale_sales_order_no"] = order_no
            bale["bale_sales_sold_at"] = completed_at
            bale["bale_sales_sold_by"] = str(payload.get("sold_by") or "").strip()
            bale["bale_sales_customer_name"] = str(payload.get("customer_name") or "").strip()
            bale["bale_sales_customer_contact"] = str(payload.get("customer_contact") or "").strip()
            bale["bale_sales_payment_method"] = str(payload.get("payment_method") or "").strip()
            bale["updated_at"] = completed_at
        order = {
            "order_no": order_no,
            "status": "completed",
            "sold_by": str(payload.get("sold_by") or "").strip(),
            "customer_name": str(payload.get("customer_name") or "").strip(),
            "customer_contact": str(payload.get("customer_contact") or "").strip(),
            "payment_method": str(payload.get("payment_method") or "").strip(),
            "note": str(payload.get("note") or "").strip(),
            "created_by": actor["username"],
            "created_at": completed_at,
            "completed_at": completed_at,
            "total_cost_kes": total_cost_kes,
            "total_amount_kes": total_amount_kes,
            "total_profit_kes": round(total_amount_kes - total_cost_kes, 2),
            "items": items,
        }
        self.bale_sales_orders[order_no] = order
        self._log_event(
            event_type="bale_sales.outbound_completed",
            entity_type="bale_sales_order",
            entity_id=order_no,
            actor=actor["username"],
            summary=f"Bale sales outbound {order_no} completed",
            details={
                "sold_by": order["sold_by"],
                "customer_name": order["customer_name"],
                "payment_method": order["payment_method"],
                "bale_count": len(items),
            },
        )
        self._persist()
        return order

    def list_bale_sales_orders(self) -> list[dict[str, Any]]:
        return sorted(
            [dict(row) for row in self.bale_sales_orders.values()],
            key=lambda row: str(row.get("completed_at") or ""),
            reverse=True,
        )

    def get_bale_sales_order(self, order_no: str) -> dict[str, Any]:
        normalized_order_no = str(order_no or "").strip().upper()
        if not normalized_order_no:
            raise HTTPException(status_code=400, detail="order_no is required")
        row = self.bale_sales_orders.get(normalized_order_no)
        if not row:
            raise HTTPException(status_code=404, detail=f"找不到 bale sales order：{normalized_order_no}")
        return dict(row)

    def _ensure_sorting_task_defaults(self, task: dict[str, Any]) -> dict[str, Any]:
        canonical_bale_barcodes, legacy_bale_barcodes = self._canonicalize_bale_reference_list(task.get("bale_barcodes", []) or [])
        if canonical_bale_barcodes:
            task["bale_barcodes"] = canonical_bale_barcodes
        task["legacy_bale_barcodes"] = legacy_bale_barcodes
        task["loss_record"] = self._normalize_sorting_loss_record(task.get("loss_record"))
        shipment_nos = [
            str(value).strip().upper()
            for value in task.get("shipment_nos", []) or []
            if str(value).strip()
        ]
        customs_notice_nos = [
            str(value).strip().upper()
            for value in task.get("customs_notice_nos", []) or []
            if str(value).strip()
        ]
        if not shipment_nos or not customs_notice_nos:
            for bale_barcode in task.get("bale_barcodes", []) or []:
                bale = self._find_raw_bale_by_reference_no_defaults(str(bale_barcode).strip().upper())
                if not bale:
                    continue
                shipment_no = str(bale.get("shipment_no") or "").strip().upper()
                customs_notice_no = str(bale.get("customs_notice_no") or "").strip().upper()
                if shipment_no and shipment_no not in shipment_nos:
                    shipment_nos.append(shipment_no)
                if customs_notice_no and customs_notice_no not in customs_notice_nos:
                    customs_notice_nos.append(customs_notice_no)
        if not shipment_nos:
            shipment_no = str(task.get("shipment_no") or "").strip().upper()
            if shipment_no and shipment_no != "MULTI":
                shipment_nos.append(shipment_no)
        if not customs_notice_nos:
            customs_notice_no = str(task.get("customs_notice_no") or "").strip().upper()
            if customs_notice_no and customs_notice_no != "MULTI":
                customs_notice_nos.append(customs_notice_no)
        task["shipment_nos"] = shipment_nos
        task["customs_notice_nos"] = customs_notice_nos
        task["shipment_no"] = shipment_nos[0] if len(shipment_nos) == 1 else "MULTI" if shipment_nos else ""
        task["customs_notice_no"] = customs_notice_nos[0] if len(customs_notice_nos) == 1 else "MULTI" if customs_notice_nos else ""
        return task

    def create_sorting_task(self, payload: dict[str, Any]) -> dict[str, Any]:
        actor = self._require_user_role(payload["created_by"], {"warehouse_clerk", "warehouse_supervisor"})
        requested_references = [str(code).strip().upper() for code in payload.get("bale_barcodes") or [] if str(code).strip()]
        if not requested_references:
            raise HTTPException(status_code=400, detail="请至少选择一包 bale barcode 再创建分拣任务")
        handler_names = [str(name).strip() for name in payload["handler_names"] if str(name).strip()]
        if not handler_names:
            raise HTTPException(status_code=400, detail="请至少填写一位分拣处理人")
        for handler_name in handler_names:
            occupied_assignment = self._find_open_warehouse_employee_assignment(handler_name)
            if occupied_assignment:
                raise HTTPException(
                    status_code=409,
                    detail=f"{handler_name} 当前正在处理{occupied_assignment['status_label']} {occupied_assignment['task_no']}，请先完成这张任务。",
                )
        category_filters = [str(value).strip() for value in payload.get("category_filters") or [] if str(value).strip()]
        bale_barcodes: list[str] = []
        legacy_bale_barcodes: list[str] = []
        parcel_batch_nos: list[str] = []
        shipment_nos: list[str] = []
        customs_notice_nos: list[str] = []
        for bale_reference in requested_references:
            bale = self._get_raw_bale_or_raise(bale_reference)
            bale_barcode = str(bale.get("bale_barcode") or "").strip().upper()
            legacy_bale_barcode = str(bale.get("legacy_bale_barcode") or "").strip().upper()
            if bale["status"] not in {"ready_for_sorting"}:
                raise HTTPException(status_code=409, detail=f"{bale_reference} 当前状态是 {bale['status']}，不能再加入新分拣单")
            if not self._raw_bale_has_completed_source_cost(bale):
                raise HTTPException(status_code=409, detail="该 Bale 来源成本未完成，不能创建分拣任务。请先补齐中方来源与三段成本。")
            if category_filters:
                category_key = f"{bale.get('category_main', '')} / {bale.get('category_sub', '')}".strip()
                if category_key not in category_filters:
                    raise HTTPException(status_code=409, detail=f"{bale_reference} 不在当前选中的品类范围内")
            if bale_barcode not in bale_barcodes:
                bale_barcodes.append(bale_barcode)
            if legacy_bale_barcode and legacy_bale_barcode not in legacy_bale_barcodes:
                legacy_bale_barcodes.append(legacy_bale_barcode)
            parcel_batch_nos.append(bale["parcel_batch_no"])
            shipment_no = str(bale.get("shipment_no") or "").strip().upper()
            customs_notice_no = str(bale.get("customs_notice_no") or "").strip().upper()
            if shipment_no and shipment_no not in shipment_nos:
                shipment_nos.append(shipment_no)
            if customs_notice_no and customs_notice_no not in customs_notice_nos:
                customs_notice_nos.append(customs_notice_no)

        task_id = next(self._sorting_task_ids)
        task_no = f"ST-{datetime.now(NAIROBI_TZ).strftime('%Y%m%d')}-{task_id:03d}"
        started_at = now_iso()
        task = {
            "id": task_id,
            "task_no": task_no,
            "shipment_no": shipment_nos[0] if len(shipment_nos) == 1 else "MULTI" if shipment_nos else "",
            "customs_notice_no": customs_notice_nos[0] if len(customs_notice_nos) == 1 else "MULTI" if customs_notice_nos else "",
            "shipment_nos": shipment_nos,
            "customs_notice_nos": customs_notice_nos,
            "parcel_batch_nos": sorted(set(parcel_batch_nos)),
            "bale_barcodes": bale_barcodes,
            "legacy_bale_barcodes": legacy_bale_barcodes,
            "category_filters": category_filters,
            "handler_names": handler_names,
            "started_at": started_at,
            "completed_at": None,
            "note": payload.get("note", ""),
            "status": "open",
            "loss_record": self._normalize_sorting_loss_record(),
            "result_items": [],
            "generated_token_count": 0,
            "generated_token_preview": [],
            "updated_at": started_at,
            "created_by": actor["username"],
        }
        self.sorting_tasks[task_no] = task
        for batch_no in task["parcel_batch_nos"]:
            if batch_no in self.parcel_batches:
                self.parcel_batches[batch_no]["status"] = "sorting_in_progress"
                self.parcel_batches[batch_no]["updated_at"] = now_iso()
        for bale_barcode in bale_barcodes:
            self.bale_barcodes[bale_barcode]["status"] = "sorting_in_progress"
            self.bale_barcodes[bale_barcode]["occupied_by_task_no"] = task_no
            self.bale_barcodes[bale_barcode]["current_location"] = f"sorting_task:{task_no}"
            self.bale_barcodes[bale_barcode]["updated_at"] = now_iso()
        self._log_event(
            event_type="sorting_task.created",
            entity_type="sorting_task",
            entity_id=task_no,
            actor=actor["username"],
            summary=f"Sorting task {task_no} created",
            details={
                "shipment_nos": shipment_nos,
                "bale_barcodes": bale_barcodes,
                "legacy_bale_barcodes": legacy_bale_barcodes,
                "handler_names": handler_names,
            },
        )
        self._persist()
        return task

    def list_sorting_tasks(self, status: Optional[str] = None) -> list[dict[str, Any]]:
        rows = list(self.sorting_tasks.values())
        if status:
            normalized_status = status.strip().lower()
            rows = [row for row in rows if row["status"].lower() == normalized_status]
        rows = [self._ensure_sorting_task_defaults(row) for row in rows]
        return sorted(rows, key=lambda row: row["started_at"], reverse=True)

    def _split_category_name_parts(self, category_name: str) -> tuple[str, str]:
        normalized = str(category_name or "").strip()
        if not normalized:
            return "", ""
        parts = [str(part or "").strip() for part in normalized.split("/", 1)]
        main = parts[0]
        sub = parts[1] if len(parts) > 1 else parts[0]
        return main, sub

    def _normalize_store_prep_grade_requirements(self, rows: Any) -> list[dict[str, Any]]:
        grouped: dict[str, int] = defaultdict(int)
        for row in rows or []:
            grade = str((row or {}).get("grade") or "").strip().upper()
            qty = int((row or {}).get("qty") or 0)
            if grade not in {"P", "S"} or qty <= 0:
                continue
            grouped[grade] += qty
        return [{"grade": grade, "qty": grouped[grade]} for grade in ("P", "S") if grouped.get(grade)]

    def _normalize_store_prep_grade_ratios(self, rows: Any) -> list[dict[str, Any]]:
        grouped: dict[str, float] = defaultdict(float)
        for row in rows or []:
            grade = str((row or {}).get("grade") or "").strip().upper()
            ratio_pct = float((row or {}).get("ratio_pct") or 0)
            if grade not in {"P", "S"} or ratio_pct <= 0:
                continue
            grouped[grade] += ratio_pct
        return [{"grade": grade, "ratio_pct": round(grouped[grade], 2)} for grade in ("P", "S") if grouped.get(grade)]

    def _format_store_prep_grade_summary(self, rows: list[dict[str, Any]]) -> str:
        normalized = self._normalize_store_prep_grade_requirements(rows)
        return " / ".join(f"{row['grade']} {int(row['qty'])} 件" for row in normalized)

    def _format_store_prep_ratio_summary(self, rows: list[dict[str, Any]]) -> str:
        normalized = self._normalize_store_prep_grade_ratios(rows)
        return " / ".join(
            f"{row['grade']}{int(row['ratio_pct']) if float(row['ratio_pct']).is_integer() else row['ratio_pct']}%"
            for row in normalized
        )

    def _count_store_prep_tokens_by_grade(self, rows: list[dict[str, Any]]) -> dict[str, int]:
        counts = {"P": 0, "S": 0}
        for row in rows:
            grade = str(row.get("grade") or "").strip().upper()
            if grade in counts:
                counts[grade] += 1
        return counts

    def _resolve_store_prep_category_main(
        self,
        category_sub: str,
        candidate_rows: Optional[list[dict[str, Any]]] = None,
    ) -> str:
        normalized_sub = str(category_sub or "").strip().lower()
        if not normalized_sub:
            return ""
        candidate_mains: set[str] = set()
        for row in candidate_rows or []:
            row_main, row_sub = self._split_category_name_parts(str(row.get("category_name") or ""))
            if row_main and row_sub.strip().lower() == normalized_sub:
                candidate_mains.add(row_main)
        if len(candidate_mains) == 1:
            return sorted(candidate_mains)[0]
        for row in self.sorting_stock.values():
            row_main, row_sub = self._split_category_name_parts(str(row.get("category_name") or ""))
            if row_main and row_sub.strip().lower() == normalized_sub:
                candidate_mains.add(row_main)
        if len(candidate_mains) == 1:
            return sorted(candidate_mains)[0]
        for row in self.apparel_piece_weights.values():
            row_main = str(row.get("category_main") or "").strip()
            row_sub = str(row.get("category_sub") or "").strip().lower()
            if row_main and row_sub == normalized_sub:
                candidate_mains.add(row_main)
        return sorted(candidate_mains)[0] if len(candidate_mains) == 1 else ""

    def _estimate_store_prep_sale_mix(
        self,
        target_weight_kg: float,
        standard_piece_weight_kg: float,
        grade_ratios: list[dict[str, Any]],
    ) -> tuple[int, list[dict[str, Any]], str]:
        normalized_ratios = self._normalize_store_prep_grade_ratios(grade_ratios)
        if target_weight_kg <= 0:
            raise HTTPException(status_code=400, detail="请先选择有效的待售卖 bale 目标重量。")
        if standard_piece_weight_kg <= 0:
            raise HTTPException(status_code=409, detail="当前小类还没配置标准克重，不能自动预估待售卖 bale 件数。")
        if not normalized_ratios:
            raise HTTPException(status_code=400, detail="请先配置待售卖 bale 的 P/S 比例。")
        ratio_total = sum(float(row["ratio_pct"]) for row in normalized_ratios)
        if ratio_total <= 0:
            raise HTTPException(status_code=400, detail="待售卖 bale 的 P/S 比例必须大于 0。")
        target_qty = max(1, int(math.ceil(float(target_weight_kg) / float(standard_piece_weight_kg))))
        allocations: list[dict[str, Any]] = []
        remaining_qty = target_qty
        for row in normalized_ratios:
            exact_qty = target_qty * (float(row["ratio_pct"]) / ratio_total)
            base_qty = int(math.floor(exact_qty))
            allocations.append(
                {
                    "grade": row["grade"],
                    "qty": base_qty,
                    "fraction": exact_qty - base_qty,
                }
            )
            remaining_qty -= base_qty
        allocations.sort(key=lambda row: (-float(row["fraction"]), row["grade"]))
        for index in range(remaining_qty):
            allocations[index % len(allocations)]["qty"] += 1
        requirements = [
            {"grade": row["grade"], "qty": int(row["qty"])}
            for row in sorted(allocations, key=lambda item: item["grade"])
            if int(row["qty"]) > 0
        ]
        return target_qty, requirements, self._format_store_prep_ratio_summary(normalized_ratios)

    def _select_store_prep_tokens_for_task(
        self,
        task: dict[str, Any],
        available_tokens: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        normalized_task = self._normalize_store_prep_bale_task(task)
        grade_requirements = normalized_task["grade_requirements"]
        if not grade_requirements:
            target_qty = int(normalized_task.get("target_qty") or 0)
            if target_qty <= 0:
                raise HTTPException(status_code=400, detail="请填写有效的压包件数。")
            if len(available_tokens) < target_qty:
                raise HTTPException(
                    status_code=409,
                    detail=f"{normalized_task['category_sub']} 当前只剩 {len(available_tokens)} 件可打包，不能完成这张任务。",
                )
            return available_tokens[:target_qty]
        tokens_by_grade: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in available_tokens:
            grade = str(row.get("grade") or "").strip().upper()
            tokens_by_grade[grade].append(row)
        selected_tokens: list[dict[str, Any]] = []
        for requirement in grade_requirements:
            grade = str(requirement["grade"]).strip().upper()
            qty = int(requirement["qty"] or 0)
            candidates = tokens_by_grade.get(grade, [])
            if len(candidates) < qty:
                raise HTTPException(
                    status_code=409,
                    detail=f"{normalized_task['category_sub']} 当前只有 {len(candidates)} 件 {grade} 级可压包，不能完成这张任务。",
                )
            selected_tokens.extend(candidates[:qty])
        return self._sort_store_prep_tokens(selected_tokens)

    def _sort_store_prep_tokens(self, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return sorted(
            rows,
            key=lambda row: (
                str(row.get("category_name") or ""),
                str(row.get("grade") or ""),
                str(row.get("task_no") or ""),
                int(row.get("token_group_no") or 0),
                int(row.get("qty_index") or 0),
            ),
        )

    def _reserve_store_prep_tokens_for_task(
        self,
        task_no: str,
        task_type: str,
        tokens: list[dict[str, Any]],
        updated_at: str,
    ) -> list[str]:
        normalized_task_no = str(task_no or "").strip().upper()
        normalized_task_type = str(task_type or "store_dispatch").strip().lower() or "store_dispatch"
        reserved_status = "reserved_waiting_bale_sale" if normalized_task_type == "sale" else "reserved_waiting_store_dispatch"
        reserved_token_nos: list[str] = []
        for row in self._sort_store_prep_tokens(tokens):
            token_no = str(row.get("token_no") or "").strip().upper()
            if not token_no:
                continue
            if normalized_task_type == "sale":
                row["sale_prep_task_no"] = normalized_task_no
            else:
                row["store_prep_task_no"] = normalized_task_no
            row["store_prep_reserved_from_status"] = str(row.get("status") or "").strip().lower() or "pending_store_print"
            row["status"] = reserved_status
            row["updated_at"] = updated_at
            reserved_token_nos.append(token_no)
        return reserved_token_nos

    def _get_reserved_store_prep_tokens_for_task(self, task: dict[str, Any]) -> list[dict[str, Any]]:
        normalized_task = self._normalize_store_prep_bale_task(task)
        token_nos = normalized_task["reserved_token_nos"]
        if not token_nos:
            return []
        reserved_rows: list[dict[str, Any]] = []
        missing_token_nos: list[str] = []
        for token_no in token_nos:
            token = self.item_barcode_tokens.get(token_no)
            if not token:
                missing_token_nos.append(token_no)
                continue
            reserved_rows.append(token)
        if missing_token_nos:
            raise HTTPException(
                status_code=409,
                detail=f"{normalized_task['task_no']} 有 {len(missing_token_nos)} 件已悬挂 token 丢失，请先检查数据后再完成任务。",
            )
        return self._sort_store_prep_tokens(reserved_rows)

    def _restore_store_prep_released_tokens(
        self,
        task_type: str,
        tokens: list[dict[str, Any]],
        updated_at: str,
    ) -> None:
        normalized_task_type = str(task_type or "store_dispatch").strip().lower() or "store_dispatch"
        for row in tokens:
            previous_status = str(row.get("store_prep_reserved_from_status") or "").strip().lower() or "pending_store_print"
            if normalized_task_type == "sale":
                row["sale_prep_task_no"] = ""
            else:
                row["store_prep_task_no"] = ""
            row["store_prep_reserved_from_status"] = ""
            row["status"] = previous_status
            row["updated_at"] = updated_at

    def _find_open_warehouse_employee_assignment(self, employee_name: str) -> Optional[dict[str, str]]:
        normalized_employee = str(employee_name or "").strip().lower()
        if not normalized_employee:
            return None
        for row in self.list_store_prep_bale_tasks(status="open"):
            if str(row.get("assigned_employee") or "").strip().lower() != normalized_employee:
                continue
            task_type = str(row.get("task_type") or "store_dispatch").strip().lower()
            status_label = "压缩工单进行中" if task_type == "store_dispatch" else "待售卖压缩工单进行中"
            return {
                "task_no": str(row.get("task_no") or "").strip().upper(),
                "status_label": status_label,
                "task_kind": "compression",
            }
        for row in self.list_sorting_tasks(status="open"):
            handler_names = [str(name or "").strip().lower() for name in row.get("handler_names", []) or [] if str(name or "").strip()]
            if normalized_employee not in handler_names:
                continue
            return {
                "task_no": str(row.get("task_no") or "").strip().upper(),
                "status_label": "分拣任务进行中",
                "task_kind": "sorting",
            }
        return None

    def _list_available_store_prep_tokens(self, category_sub: str) -> list[dict[str, Any]]:
        normalized_sub = str(category_sub or "").strip().lower()
        if not normalized_sub:
            return []
        rows: list[dict[str, Any]] = []
        for row in self.item_barcode_tokens.values():
            status = str(row.get("status") or "").strip().lower()
            if status not in {"pending_store_print", "print_failed"}:
                continue
            if str(row.get("store_prep_bale_no") or "").strip():
                continue
            if str(row.get("sale_prep_bale_no") or "").strip():
                continue
            if str(row.get("store_prep_task_no") or "").strip():
                continue
            if str(row.get("sale_prep_task_no") or "").strip():
                continue
            if str(row.get("store_dispatch_bale_no") or "").strip() and str(row.get("transfer_no") or "").strip():
                continue
            _, row_sub = self._split_category_name_parts(str(row.get("category_name") or ""))
            if row_sub.strip().lower() != normalized_sub:
                continue
            rows.append(row)
        return sorted(
            rows,
            key=lambda row: (
                str(row.get("category_name") or ""),
                str(row.get("task_no") or ""),
                int(row.get("token_group_no") or 0),
                int(row.get("qty_index") or 0),
            ),
        )

    def _deduct_store_prep_tokens_from_sorting_stock(self, tokens: list[dict[str, Any]], task_no: str, actor: str) -> None:
        deduction_map: dict[str, dict[str, Any]] = {}
        for token in tokens:
            rack_code = str(token.get("rack_code") or "").strip().upper()
            sku_code = str(token.get("sku_code") or "").strip().upper()
            if not rack_code or not sku_code:
                continue
            stock_key = f"{rack_code}||{sku_code}"
            detail = deduction_map.setdefault(stock_key, {"qty": 0, "cost": 0.0, "token": token})
            detail["qty"] += 1
            detail["cost"] = round(float(detail["cost"]) + float(token.get("unit_cost_kes") or 0), 2)
        for stock_key, detail in deduction_map.items():
            stock_row = self.sorting_stock.get(stock_key)
            if not stock_row:
                continue
            stock_row = self._hydrate_sorting_stock_costs(stock_row)
            cost_layers = self._normalize_sorting_stock_cost_layers(stock_row)
            for token in [
                row for row in tokens
                if f"{str(row.get('rack_code') or '').strip().upper()}||{str(row.get('sku_code') or '').strip().upper()}" == stock_key
            ]:
                layer_id = str(token.get("sorting_cost_layer_id") or "").strip().upper()
                matched_layer = next(
                    (
                        layer for layer in cost_layers
                        if int(layer.get("qty_on_hand") or 0) > 0
                        and layer_id
                        and str(layer.get("layer_id") or "").strip().upper() == layer_id
                    ),
                    None,
                )
                if matched_layer is None:
                    matched_layer = next((layer for layer in cost_layers if int(layer.get("qty_on_hand") or 0) > 0), None)
                if matched_layer is None:
                    continue
                matched_layer["qty_on_hand"] = int(matched_layer.get("qty_on_hand") or 0) - 1
                if matched_layer.get("unit_cost_kes") not in {None, ""}:
                    matched_layer["total_cost_kes"] = round(
                        float(matched_layer.get("unit_cost_kes") or 0) * int(matched_layer.get("qty_on_hand") or 0),
                        2,
                    )
            cost_layers = [layer for layer in cost_layers if int(layer.get("qty_on_hand") or 0) > 0]
            next_qty = sum(int(layer.get("qty_on_hand") or 0) for layer in cost_layers)
            next_total_cost = (
                round(sum(float(layer.get("total_cost_kes") or 0) for layer in cost_layers), 2)
                if cost_layers and all(layer.get("total_cost_kes") not in {None, ""} for layer in cost_layers)
                else None
            )
            if next_qty <= 0:
                del self.sorting_stock[stock_key]
            else:
                stock_row["qty_on_hand"] = next_qty
                stock_row["total_cost_kes"] = max(next_total_cost, 0) if next_total_cost is not None else None
                stock_row["unit_cost_kes"] = (
                    round(stock_row["total_cost_kes"] / next_qty, 2)
                    if stock_row.get("total_cost_kes") not in {None, ""} and next_qty > 0
                    else stock_row.get("unit_cost_kes")
                )
                stock_row["cost_layers"] = cost_layers
                stock_row["updated_at"] = now_iso()
                self.sorting_stock[stock_key] = stock_row
            token = detail["token"]
            self._record_inventory_movement(
                movement_type="sorting_stock_pack_to_store_prep",
                barcode=str(token.get("sku_code") or "").strip().upper(),
                product_name=str(token.get("category_name") or "").strip() or "sorted inventory",
                quantity_delta=-(int(detail["qty"] or 0)),
                location_type="warehouse_sorting",
                location_code=str(token.get("rack_code") or "").strip().upper(),
                reference_type="store_prep_bale_task",
                reference_no=task_no,
                actor=actor,
                note="Moved loose sorted inventory into waiting store-prep bale",
                details={"category_sub": self._split_category_name_parts(str(token.get("category_name") or ""))[1]},
            )

    def list_store_prep_bale_tasks(self, status: Optional[str] = None) -> list[dict[str, Any]]:
        rows = [self._normalize_store_prep_bale_task(row) for row in self.store_prep_bale_tasks.values()]
        if status:
            normalized_status = str(status or "").strip().lower()
            rows = [row for row in rows if str(row.get("status") or "").strip().lower() == normalized_status]
        return sorted(rows, key=lambda row: str(row.get("created_at") or ""), reverse=True)

    def create_store_prep_bale_task(self, payload: dict[str, Any]) -> dict[str, Any]:
        actor = self._require_user_role(payload["created_by"], {"warehouse_supervisor"})
        category_sub = str(payload.get("category_sub") or "").strip()
        if not category_sub:
            raise HTTPException(status_code=400, detail="请先选择要压包的小类。")
        task_type = str(payload.get("task_type") or "store_dispatch").strip().lower() or "store_dispatch"
        if task_type not in {"store_dispatch", "sale"}:
            raise HTTPException(status_code=400, detail="未知的压缩任务类型。")
        assigned_employee = str(payload.get("assigned_employee") or "").strip()
        if not assigned_employee:
            raise HTTPException(status_code=400, detail="请先选择负责压缩 bale 的员工。")
        occupied_assignment = self._find_open_warehouse_employee_assignment(assigned_employee)
        if occupied_assignment:
            raise HTTPException(
                status_code=409,
                detail=f"{assigned_employee} 当前正在处理{occupied_assignment['status_label']} {occupied_assignment['task_no']}，请先完成这张任务。",
            )
        available_tokens = self._list_available_store_prep_tokens(category_sub)
        available_qty_by_grade = self._count_store_prep_tokens_by_grade(available_tokens)
        category_main = self._resolve_store_prep_category_main(category_sub, available_tokens)
        grade_requirements = self._normalize_store_prep_grade_requirements(payload.get("grade_requirements") or [])
        grade_ratios = self._normalize_store_prep_grade_ratios(payload.get("grade_ratios") or [])
        ratio_label = ""
        ratio_summary = ""
        target_weight_kg = None
        estimated_piece_weight_kg = None
        pieces_per_bale = 0
        bale_count = 1
        if task_type == "sale":
            target_weight_kg = round(float(payload.get("target_weight_kg") or 0), 2)
            ratio_label = str(payload.get("ratio_label") or "").strip().upper()
            estimated_piece_weight_kg = self._get_sorting_standard_piece_weight_kg(f"{category_main} / {category_sub}")
            target_qty, grade_requirements, ratio_summary = self._estimate_store_prep_sale_mix(
                target_weight_kg=target_weight_kg,
                standard_piece_weight_kg=estimated_piece_weight_kg,
                grade_ratios=grade_ratios,
            )
        else:
            explicit_target_qty = int(payload.get("target_qty") or 0)
            pieces_per_bale = int(payload.get("pieces_per_bale") or 0)
            bale_count = max(1, int(payload.get("bale_count") or 1))
            if grade_requirements:
                grade_total_qty = sum(int(row["qty"]) for row in grade_requirements)
            else:
                grade_total_qty = 0
            if pieces_per_bale <= 0:
                pieces_per_bale = explicit_target_qty or grade_total_qty
            if pieces_per_bale not in {100, 200}:
                raise HTTPException(status_code=400, detail="待送店 bale 每包件数只能选择 100 或 200 件。")
            if bale_count < 1 or bale_count > 5:
                raise HTTPException(status_code=400, detail="待送店 bale 本次包数只能选择 1-5 包。")
            target_qty = pieces_per_bale * bale_count
            if grade_total_qty and grade_total_qty != target_qty:
                raise HTTPException(
                    status_code=400,
                    detail=f"本次压包总件数应为 {target_qty} 件，请让 P/S 等级件数合计等于每包件数 × 包数。",
                )
            if target_qty <= 0:
                raise HTTPException(status_code=400, detail="请填写有效的压包件数。")
        if len(available_tokens) < target_qty:
            bale_label = "待售卖 bale" if task_type == "sale" else "待送店 bale"
            raise HTTPException(
                status_code=409,
                detail=f"{category_sub} 当前只有 {len(available_tokens)} 件可打包，不能创建 {target_qty} 件的{bale_label}任务。",
            )
        for requirement in grade_requirements:
            grade = str(requirement["grade"]).strip().upper()
            required_qty = int(requirement["qty"] or 0)
            if available_qty_by_grade.get(grade, 0) < required_qty:
                raise HTTPException(
                    status_code=409,
                    detail=f"{category_sub} 当前只有 {available_qty_by_grade.get(grade, 0)} 件 {grade} 级可压包，不能创建当前任务。",
                )
        grade_summary = self._format_store_prep_grade_summary(grade_requirements)
        label_parts = [category_sub]
        if task_type == "sale":
            if ratio_label:
                label_parts.append(ratio_label)
            if ratio_summary:
                label_parts.append(ratio_summary)
            label_parts.append(f"{target_qty} 件")
            if target_weight_kg:
                label_parts.append(f"{target_weight_kg:g} KG")
        elif grade_summary:
            label_parts.append(grade_summary)
        else:
            label_parts.append(f"{target_qty} 件")
        if task_type != "sale" and bale_count > 1:
            label_parts.append(f"{bale_count} 包")
        task_id = next(self._store_prep_bale_task_ids)
        task_no = self._store_prep_bale_task_no(task_id)
        created_at = now_iso()
        selected_tokens = self._select_store_prep_tokens_for_task(
            {
                "task_no": task_no,
                "task_type": task_type,
                "category_sub": category_sub,
                "target_qty": target_qty,
                "grade_requirements": grade_requirements,
            },
            available_tokens,
        )
        reserved_token_nos = self._reserve_store_prep_tokens_for_task(task_no, task_type, selected_tokens, created_at)
        task = self._normalize_store_prep_bale_task(
            {
                "id": task_id,
                "task_no": task_no,
                "task_type": task_type,
                "category_main": category_main,
                "category_sub": category_sub,
                "target_qty": target_qty,
                "pieces_per_bale": pieces_per_bale if task_type != "sale" else target_qty,
                "bale_count": bale_count if task_type != "sale" else 1,
                "target_weight_kg": target_weight_kg,
                "estimated_piece_weight_kg": estimated_piece_weight_kg,
                "ratio_label": ratio_label,
                "ratio_summary": ratio_summary,
                "grade_requirements": grade_requirements,
                "grade_ratios": grade_ratios,
                "grade_summary": grade_summary,
                "assigned_employee": assigned_employee,
                "available_qty": max(len(available_tokens) - len(reserved_token_nos), 0),
                "reserved_token_nos": reserved_token_nos,
                "packed_qty": 0,
                "prepared_bale_no": "",
                "prepared_bale_nos": [],
                "status": "open",
                "unit_cost_kes": None,
                "total_cost_kes": None,
                "label_summary": " · ".join(part for part in label_parts if str(part).strip()),
                "created_at": created_at,
                "completed_at": None,
                "updated_at": created_at,
                "created_by": actor["username"],
                "completed_by": "",
                "note": str(payload.get("note") or "").strip(),
            }
        )
        self.store_prep_bale_tasks[task_no] = task
        self._log_event(
            event_type="store_prep_bale_task.created",
            entity_type="store_prep_bale_task",
            entity_id=task_no,
            actor=actor["username"],
            summary=f"Store prep bale task {task_no} created",
            details={
                "task_type": task_type,
                "category_sub": category_sub,
                "target_qty": target_qty,
                "pieces_per_bale": task.get("pieces_per_bale"),
                "bale_count": task.get("bale_count"),
                "target_weight_kg": target_weight_kg,
                "ratio_label": ratio_label,
                "grade_requirements": grade_requirements,
                "reserved_token_nos": reserved_token_nos,
            },
        )
        self._persist()
        return task

    def complete_store_prep_bale_task(self, task_no: str, payload: dict[str, Any]) -> dict[str, Any]:
        actor = self._require_user_role(payload["updated_by"], {"warehouse_supervisor"})
        normalized_task_no = str(task_no or "").strip().upper()
        task = self.store_prep_bale_tasks.get(normalized_task_no)
        if not task:
            raise HTTPException(status_code=404, detail=f"Unknown store prep bale task {normalized_task_no}")
        task = self._normalize_store_prep_bale_task(task)
        if task["status"] == "completed":
            return task
        selected_tokens = self._get_reserved_store_prep_tokens_for_task(task)
        if not selected_tokens:
            available_tokens = self._list_available_store_prep_tokens(task["category_sub"])
            selected_tokens = self._select_store_prep_tokens_for_task(task, available_tokens)
        else:
            available_tokens = self._list_available_store_prep_tokens(task["category_sub"])
        task_type = str(task.get("task_type") or "store_dispatch").strip().lower() or "store_dispatch"
        actual_qty = int(payload.get("actual_qty") or len(selected_tokens) or 0)
        if actual_qty <= 0:
            raise HTTPException(status_code=400, detail="请先填写有效的实际件数。")
        if actual_qty > len(selected_tokens):
            raise HTTPException(
                status_code=409,
                detail=f"实际件数 {actual_qty} 不能大于当前已悬挂的 {len(selected_tokens)} 件。",
            )
        actual_weight_kg = (
            round(float(payload.get("actual_weight_kg") or 0), 2)
            if payload.get("actual_weight_kg") not in {None, ""}
            else None
        )
        if task_type == "sale" and (actual_weight_kg is None or actual_weight_kg <= 0):
            raise HTTPException(status_code=400, detail="待售卖 bale 验收时请填写实际重量。")
        packed_tokens = self._sort_store_prep_tokens(selected_tokens)[:actual_qty]
        released_tokens = self._sort_store_prep_tokens(selected_tokens)[actual_qty:]
        total_cost_kes = round(sum(float(row.get("unit_cost_kes") or 0) for row in packed_tokens), 2)
        task_unit_cost_kes = round(total_cost_kes / len(packed_tokens), 2) if packed_tokens else None
        category_mains = {
            self._split_category_name_parts(str(row.get("category_name") or ""))[0]
            for row in packed_tokens
            if self._split_category_name_parts(str(row.get("category_name") or ""))[0]
        }
        created_at = now_iso()
        bale_status = "waiting_bale_sale" if task_type == "sale" else "waiting_store_dispatch"
        staging_area = "warehouse_waiting_bale_sale" if task_type == "sale" else "warehouse_waiting_store_dispatch"
        pieces_per_bale = int(task.get("pieces_per_bale") or task.get("target_qty") or actual_qty or 0)
        bale_count = int(task.get("bale_count") or 1)
        if task_type == "sale":
            pieces_per_bale = len(packed_tokens)
            bale_count = 1
        elif pieces_per_bale <= 0 or bale_count <= 0:
            raise HTTPException(status_code=400, detail="请先提供有效的每包件数和包数。")
        grade_requirements = self._normalize_store_prep_grade_requirements(
            [{"grade": str(row.get("grade") or "").strip().upper(), "qty": 1} for row in packed_tokens]
        )
        grade_summary = self._format_store_prep_grade_summary(grade_requirements)
        actual_bale_count = 1 if task_type == "sale" else max(1, int(math.ceil(actual_qty / pieces_per_bale)))
        token_chunks = [packed_tokens] if task_type == "sale" else [
            packed_tokens[index * pieces_per_bale:(index + 1) * pieces_per_bale]
            for index in range(actual_bale_count)
            if packed_tokens[index * pieces_per_bale:(index + 1) * pieces_per_bale]
        ]
        created_bales: list[dict[str, Any]] = []
        for bale_index, bale_tokens in enumerate(token_chunks, start=1):
            bale_id = next(self._store_prep_bale_ids)
            bale_no = self._store_prep_bale_no(bale_id)
            bale_total_cost_kes = round(sum(float(row.get("unit_cost_kes") or 0) for row in bale_tokens), 2)
            bale_unit_cost_kes = round(bale_total_cost_kes / len(bale_tokens), 2) if bale_tokens else None
            bale_grade_requirements = self._normalize_store_prep_grade_requirements(
                [{"grade": str(row.get("grade") or "").strip().upper(), "qty": 1} for row in bale_tokens]
            )
            bale_grade_summary = self._format_store_prep_grade_summary(bale_grade_requirements)
            label_parts = [task["category_sub"]]
            if task_type == "sale":
                if task.get("ratio_label"):
                    label_parts.append(str(task["ratio_label"]))
                if task.get("ratio_summary"):
                    label_parts.append(str(task["ratio_summary"]))
            elif bale_count > 1:
                label_parts.append(f"第 {bale_index}/{bale_count} 包")
            if bale_grade_summary:
                label_parts.append(bale_grade_summary)
            label_parts.append(f"{len(bale_tokens)} 件")
            if task_type == "sale" and actual_weight_kg:
                label_parts.append(f"{actual_weight_kg:g} KG")
            store_prep_bale = self._normalize_store_prep_bale(
                {
                    "id": bale_id,
                    "bale_no": bale_no,
                    "task_no": normalized_task_no,
                    "task_type": task_type,
                    "category_main": sorted(category_mains)[0] if len(category_mains) == 1 else "",
                    "category_sub": task["category_sub"],
                    "qty": len(bale_tokens),
                    "target_weight_kg": task.get("target_weight_kg"),
                    "actual_weight_kg": actual_weight_kg,
                    "estimated_piece_weight_kg": task.get("estimated_piece_weight_kg"),
                    "ratio_label": task.get("ratio_label") or "",
                    "ratio_summary": task.get("ratio_summary") or "",
                    "grade_requirements": bale_grade_requirements,
                    "grade_summary": bale_grade_summary,
                    "assigned_employee": task.get("assigned_employee") or "",
                    "token_nos": [str(row.get("token_no") or "").strip().upper() for row in bale_tokens],
                    "status": bale_status,
                    "unit_cost_kes": bale_unit_cost_kes,
                    "total_cost_kes": bale_total_cost_kes,
                    "label_summary": " · ".join(part for part in label_parts if str(part).strip()),
                    "staging_area": staging_area,
                    "created_at": created_at,
                    "updated_at": created_at,
                }
            )
            self.store_prep_bales[bale_no] = store_prep_bale
            created_bales.append(store_prep_bale)
            for row in bale_tokens:
                if task_type == "sale":
                    row["sale_prep_bale_no"] = bale_no
                    row["sale_prep_task_no"] = normalized_task_no
                    row["status"] = "packed_waiting_bale_sale"
                else:
                    row["store_prep_bale_no"] = bale_no
                    row["store_prep_task_no"] = normalized_task_no
                    row["status"] = "packed_waiting_store_dispatch"
                row["store_prep_reserved_from_status"] = ""
                row["updated_at"] = created_at
        self._restore_store_prep_released_tokens(task_type, released_tokens, created_at)
        if task_type != "sale":
            self._deduct_store_prep_tokens_from_sorting_stock(packed_tokens, normalized_task_no, actor["username"])
        task["available_qty"] = len(self._list_available_store_prep_tokens(task["category_sub"]))
        task["reserved_token_nos"] = []
        task["packed_qty"] = len(packed_tokens)
        task["pieces_per_bale"] = pieces_per_bale
        task["bale_count"] = len(created_bales)
        task["prepared_bale_nos"] = [str(row.get("bale_no") or "").strip().upper() for row in created_bales]
        task["prepared_bale_barcodes"] = [str(row.get("bale_barcode") or "").strip().upper() for row in created_bales]
        task["prepared_bale_no"] = task["prepared_bale_nos"][0] if task["prepared_bale_nos"] else ""
        task["prepared_bale_barcode"] = task["prepared_bale_barcodes"][0] if task["prepared_bale_barcodes"] else ""
        task["status"] = "completed"
        task["grade_requirements"] = grade_requirements
        task["grade_summary"] = grade_summary
        task["actual_weight_kg"] = actual_weight_kg
        task["unit_cost_kes"] = task_unit_cost_kes
        task["total_cost_kes"] = total_cost_kes
        task["completed_at"] = created_at
        task["completed_by"] = actor["username"]
        task["updated_at"] = created_at
        task["note"] = str(payload.get("note") or task.get("note") or "").strip()
        self.store_prep_bale_tasks[normalized_task_no] = task
        for store_prep_bale in created_bales:
            bale_no = str(store_prep_bale.get("bale_no") or "").strip().upper()
            if task_type == "sale":
                self._record_inventory_movement(
                    movement_type="store_prep_sale_bale_created",
                    barcode=str(store_prep_bale.get("bale_barcode") or "").strip().upper() or bale_no,
                    product_name=f"{task['category_sub']} waiting bale sale",
                    quantity_delta=0,
                    location_type="warehouse_store_prep",
                    location_code="warehouse_waiting_bale_sale",
                    reference_type="store_prep_bale_task",
                    reference_no=normalized_task_no,
                    actor=actor["username"],
                    note="Packed loose sorted clothes into waiting bale-sale bundle without deducting sorting stock",
                    details={
                        "category_sub": task["category_sub"],
                        "bale_no": bale_no,
                        "ratio_label": task.get("ratio_label") or "",
                        "ratio_summary": task.get("ratio_summary") or "",
                        "actual_weight_kg": actual_weight_kg,
                    },
                )
            else:
                self._record_inventory_movement(
                    movement_type="store_prep_bale_created",
                    barcode=str(store_prep_bale.get("bale_barcode") or "").strip().upper() or bale_no,
                    product_name=f"{task['category_sub']} waiting store dispatch bale",
                    quantity_delta=int(store_prep_bale.get("qty") or 0),
                    location_type="warehouse_store_prep",
                    location_code="warehouse_waiting_store_dispatch",
                    reference_type="store_prep_bale_task",
                    reference_no=normalized_task_no,
                    actor=actor["username"],
                    note="Packed loose sorted clothes into waiting store-dispatch bale",
                    details={
                        "category_sub": task["category_sub"],
                        "bale_no": bale_no,
                    },
                )
        self._log_event(
            event_type="store_prep_bale_task.completed",
            entity_type="store_prep_bale_task",
            entity_id=normalized_task_no,
            actor=actor["username"],
            summary=f"Store prep bale task {normalized_task_no} completed",
            details={
                "task_type": task_type,
                "prepared_bale_no": task["prepared_bale_no"],
                "prepared_bale_barcode": task["prepared_bale_barcode"],
                "prepared_bale_nos": task["prepared_bale_nos"],
                "prepared_bale_barcodes": task["prepared_bale_barcodes"],
                "packed_qty": len(packed_tokens),
                "pieces_per_bale": task.get("pieces_per_bale"),
                "bale_count": task.get("bale_count"),
                "grade_summary": grade_summary,
                "actual_weight_kg": actual_weight_kg,
                "released_qty": len(released_tokens),
            },
        )
        self._persist()
        return task

    def queue_store_prep_bale_print_job(
        self,
        bale_no: str,
        requested_by: str,
        printer_name: str = "Deli DL-720C",
        template_code: str = "",
        copies: int = 1,
    ) -> dict[str, Any]:
        actor = self._require_user_role(requested_by, {"warehouse_clerk", "warehouse_supervisor"})
        normalized_bale_no = str(bale_no or "").strip().upper()
        if not normalized_bale_no:
            raise HTTPException(status_code=400, detail="请先提供压缩 bale 编号。")
        bale = self.store_prep_bales.get(normalized_bale_no)
        if not bale:
            raise HTTPException(status_code=404, detail=f"Unknown store prep bale {normalized_bale_no}")
        bale = self._normalize_store_prep_bale(bale)
        task_type = str(bale.get("task_type") or "store_dispatch").strip().lower() or "store_dispatch"
        default_template_code = "wait_for_sale" if task_type == "sale" else "wait_for_transtoshop"
        resolved_template_code = str(template_code or default_template_code).strip().lower() or default_template_code
        template = self.get_label_template(resolved_template_code, template_scope="warehouseout_bale")
        label_size = f"{int(template.get('width_mm') or 60)}x{int(template.get('height_mm') or 40)}"
        category_display = " / ".join(part for part in [bale.get("category_main"), bale.get("category_sub")] if str(part or "").strip()) or "-"
        package_label = f"{int(bale.get('qty') or 0)} 件"
        if bale.get("actual_weight_kg") not in {None, ""} and float(bale.get("actual_weight_kg") or 0) > 0:
            package_label = f"{package_label} · {float(bale.get('actual_weight_kg') or 0):g} KG"
        status_text = "WAIT FOR SALE" if task_type == "sale" else "WAITING FOR STORE DISPATCH"
        barcode_value = str(bale.get("scan_token") or bale.get("bale_barcode") or "").strip().upper()
        machine_code = barcode_value
        job = {
            "id": next(self._print_job_ids),
            "job_type": "bale_barcode_label",
            "status": "queued",
            "created_at": now_iso(),
            "product_id": None,
            "document_no": str(bale.get("task_no") or "").strip().upper() or normalized_bale_no,
            "barcode": str(bale.get("bale_barcode") or "").strip().upper(),
            "product_name": category_display,
            "template_code": template["template_code"],
            "label_size": label_size,
            "copies": int(copies or 1),
            "printer_name": printer_name,
            "requested_by": actor["username"],
            "printed_at": None,
            "printed_by": "",
            "error_message": "",
            "print_payload": {
                "symbology": "Code128",
                "barcode_value": machine_code,
                "scan_token": machine_code,
                "bale_barcode": str(bale.get("bale_barcode") or "").strip().upper(),
                "legacy_bale_barcode": "",
                "human_readable": barcode_value,
                "display_code": barcode_value,
                "machine_code": machine_code,
                "supplier_name": "SORTED STOCK",
                "category_main": str(bale.get("category_main") or "").strip(),
                "category_sub": str(bale.get("category_sub") or "").strip(),
                "category_display": category_display,
                "package_position_label": package_label,
                "serial_no": 1,
                "total_packages": 1,
                "shipment_no": str(bale.get("task_no") or "").strip().upper(),
                "parcel_batch_no": normalized_bale_no,
                "unload_date": str(bale.get("updated_at") or bale.get("created_at") or "").strip(),
                "received_at": str(bale.get("created_at") or "").strip(),
                "dispatch_bale_no": machine_code,
                "status": status_text,
                "cat": str(bale.get("category_main") or "").strip(),
                "sub": str(bale.get("category_sub") or "").strip(),
                "grade": str(bale.get("grade_summary") or "").strip(),
                "qty": str(int(bale.get("qty") or 0)),
                "weight": (
                    f"{float(bale.get('actual_weight_kg') or 0):g} KG"
                    if bale.get("actual_weight_kg") not in {None, ""} and float(bale.get("actual_weight_kg") or 0) > 0
                    else ""
                ),
                "code": barcode_value,
                "template_code": template["template_code"],
                "template_name": template.get("name", ""),
                "template_scope": template.get("template_scope", "warehouseout_bale"),
                "template_fields": template.get("fields", []),
                "label_size": label_size,
                "paper_preset": str(template.get("paper_preset") or "").strip().lower(),
                "width_mm": int(template.get("width_mm") or 60),
                "height_mm": int(template.get("height_mm") or 40),
                "layout": self._normalize_label_template_layout(
                    str(template.get("template_scope") or "warehouseout_bale").strip().lower(),
                    template.get("layout"),
                    int(template.get("width_mm") or 60),
                    int(template.get("height_mm") or 40),
                ),
            },
        }
        self.print_jobs.append(job)
        self._log_event(
            event_type="print.store_prep_bale_label_queued",
            entity_type="print_job",
            entity_id=str(job["id"]),
            actor=actor["username"],
            summary=f"Store prep bale label print queued for {job['barcode']}",
            details={**job["print_payload"], "copies": copies, "bale_no": normalized_bale_no},
        )
        self._persist()
        return job

    def list_store_prep_bales(self, status: Optional[str] = None) -> list[dict[str, Any]]:
        rows = [self._normalize_store_prep_bale(row) for row in self.store_prep_bales.values()]
        if status:
            normalized_status = str(status or "").strip().lower()
            rows = [row for row in rows if str(row.get("status") or "").strip().lower() == normalized_status]
        return sorted(rows, key=lambda row: str(row.get("created_at") or ""), reverse=True)

    def get_warehouse_inventory_summary(self) -> dict[str, Any]:
        raw_bale_status_counts: dict[str, int] = defaultdict(int)
        for row in self.list_raw_bales():
            status = str(row.get("status") or "").strip().lower() or "unknown"
            raw_bale_status_counts[status] += 1

        sorting_task_status_counts: dict[str, int] = defaultdict(int)
        for row in self.list_sorting_tasks():
            status = str(row.get("status") or "").strip().lower() or "unknown"
            sorting_task_status_counts[status] += 1

        sorted_stock_rows = self.list_sorting_stock()
        sorted_stock_qty = sum(int(row.get("qty_on_hand") or 0) for row in sorted_stock_rows)

        waiting_store_rows = self.list_store_prep_bales(status="waiting_store_dispatch")
        waiting_store_qty = sum(int(row.get("qty") or 0) for row in waiting_store_rows)

        waiting_sale_rows = self.list_store_prep_bales(status="waiting_bale_sale")
        waiting_sale_qty = sum(int(row.get("qty") or 0) for row in waiting_sale_rows)

        b2b_candidates = self.list_bale_sales_candidates()
        b2b_candidate_status_counts: dict[str, int] = defaultdict(int)
        for row in b2b_candidates:
            status = str(row.get("status") or "").strip().lower() or "unknown"
            b2b_candidate_status_counts[status] += 1

        store_stock_rows = self.list_store_stock()
        store_pos_qty = sum(int(row.get("qty_on_hand") or 0) for row in store_stock_rows)

        return {
            "raw_bale_status_counts": dict(raw_bale_status_counts),
            "sorting_task_status_counts": dict(sorting_task_status_counts),
            "sorted_stock": {
                "bale_count": len(sorted_stock_rows),
                "qty": sorted_stock_qty,
            },
            "waiting_store": {
                "bale_count": len(waiting_store_rows),
                "qty": waiting_store_qty,
            },
            "waiting_sale": {
                "bale_count": len(waiting_sale_rows),
                "qty": waiting_sale_qty,
            },
            "b2b_bale_sales_candidates": {
                "total": len(b2b_candidates),
                **dict(b2b_candidate_status_counts),
            },
            "store_pos_inventory": {
                "bale_count": len(store_stock_rows),
                "qty": store_pos_qty,
            },
        }

    def list_item_barcode_tokens(
        self,
        status: Optional[str] = None,
        task_no: Optional[str] = None,
        shipment_no: Optional[str] = None,
        store_dispatch_bale_no: Optional[str] = None,
        store_code: Optional[str] = None,
        assigned_employee: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        rows = list(self.item_barcode_tokens.values())
        if status:
            normalized_status = status.strip().lower()
            rows = [row for row in rows if str(row.get("status") or "").strip().lower() == normalized_status]
        if task_no:
            normalized_task_no = task_no.strip().upper()
            rows = [row for row in rows if str(row.get("task_no") or "").strip().upper() == normalized_task_no]
        if shipment_no:
            normalized_shipment_no = shipment_no.strip().upper()
            rows = [row for row in rows if str(row.get("shipment_no") or "").strip().upper() == normalized_shipment_no]
        if store_dispatch_bale_no:
            normalized_bale_no = store_dispatch_bale_no.strip().upper()
            rows = [row for row in rows if str(row.get("store_dispatch_bale_no") or "").strip().upper() == normalized_bale_no]
        if store_code:
            normalized_store_code = store_code.strip().upper()
            rows = [row for row in rows if str(row.get("store_code") or "").strip().upper() == normalized_store_code]
        if assigned_employee:
            normalized_employee = assigned_employee.strip().lower()
            rows = [row for row in rows if str(row.get("assigned_employee") or "").strip().lower() == normalized_employee]
        return sorted(
            rows,
            key=lambda row: (
                str(row.get("shipment_no") or ""),
                str(row.get("task_no") or ""),
                int(row.get("token_group_no") or 0),
                int(row.get("qty_index") or 0),
            ),
        )

    def get_item_identity_ledger(self, identity_no: str) -> dict[str, Any]:
        normalized_identity_no = str(identity_no or "").strip().upper()
        if not normalized_identity_no:
            raise HTTPException(status_code=400, detail="Identity no is required")

        token = self.item_barcode_tokens.get(normalized_identity_no)
        product = None
        if token:
            product_id = self.product_by_barcode.get(str(token.get("token_no") or normalized_identity_no).strip().upper())
            if product_id is not None:
                product = self.products.get(product_id)
        else:
            product_id = self.product_by_barcode.get(normalized_identity_no)
            if product_id is not None:
                product = self.products.get(product_id)
                token = self.item_barcode_tokens.get(str(product.get("barcode") or normalized_identity_no).strip().upper())

        if not token and not product:
            raise HTTPException(status_code=404, detail=f"Unknown item identity {normalized_identity_no}")

        barcode = str(
            (token or {}).get("token_no")
            or (token or {}).get("identity_no")
            or (product or {}).get("barcode")
            or normalized_identity_no
        ).strip().upper()
        if not product and barcode:
            product_id = self.product_by_barcode.get(barcode)
            if product_id is not None:
                product = self.products.get(product_id)
        if not token and barcode:
            token = self.item_barcode_tokens.get(barcode)

        shipment_no = str((token or {}).get("shipment_no") or "").strip().upper()
        task_no = str((token or {}).get("task_no") or "").strip().upper()
        store_dispatch_bale_no = str((token or {}).get("store_dispatch_bale_no") or "").strip().upper()
        source_bale_codes = [
            str(code or "").strip().upper()
            for code in ((token or {}).get("source_bale_barcodes") or [])
            if str(code or "").strip()
        ]
        source_legacy_bale_codes = [
            str(code or "").strip().upper()
            for code in ((token or {}).get("source_legacy_bale_barcodes") or [])
            if str(code or "").strip()
        ]

        source_bales: list[dict[str, Any]] = []
        supplier_names: list[str] = []
        supplier_seen: set[str] = set()
        for bale_code in source_bale_codes:
            bale = self._find_raw_bale_by_reference_no_defaults(bale_code)
            if not bale:
                continue
            supplier_name = str(bale.get("supplier_name") or "").strip()
            if supplier_name and supplier_name.lower() not in supplier_seen:
                supplier_names.append(supplier_name)
                supplier_seen.add(supplier_name.lower())
            source_bales.append(
                {
                    "bale_barcode": bale_code,
                    "legacy_bale_barcode": str(bale.get("legacy_bale_barcode") or "").strip().upper(),
                    "source_bale_token": str(bale.get("source_bale_token") or "").strip(),
                    "parcel_batch_no": str(bale.get("parcel_batch_no") or "").strip().upper(),
                    "supplier_name": supplier_name,
                    "category_main": str(bale.get("category_main") or "").strip(),
                    "category_sub": str(bale.get("category_sub") or "").strip(),
                    "status": str(bale.get("status") or "").strip(),
                }
            )

        self._rebuild_store_dispatch_bales()
        dispatch_bale = None
        if store_dispatch_bale_no:
            dispatch_bale = self.store_dispatch_bales.get(store_dispatch_bale_no)
            if dispatch_bale:
                self._refresh_store_dispatch_bale_summary(dispatch_bale)

        warehouse_locations = [
            {
                "location_type": "warehouse",
                "location_code": str(row.get("warehouse_code") or "").strip().upper(),
                "rack_code": str(row.get("rack_code") or "").strip().upper(),
                "qty_on_hand": int(row.get("qty_on_hand") or 0),
                "updated_at": str(row.get("updated_at") or ""),
            }
            for row in self.warehouse_stock.values()
            if str(row.get("barcode") or "").strip().upper() == barcode and int(row.get("qty_on_hand") or 0) > 0
        ]
        store_locations = [
            {
                "location_type": "store",
                "location_code": str(row.get("store_code") or "").strip().upper(),
                "rack_code": str(row.get("store_rack_code") or "").strip().upper(),
                "qty_on_hand": int(row.get("qty_on_hand") or 0),
                "updated_at": str(row.get("updated_at") or ""),
            }
            for row in self.store_stock.values()
            if str(row.get("barcode") or "").strip().upper() == barcode and int(row.get("qty_on_hand") or 0) > 0
        ]

        identity_keys = {
            str(value).strip().upper()
            for value in [
                normalized_identity_no,
                barcode,
                (token or {}).get("identity_no"),
                (token or {}).get("token_no"),
                ((token or {}).get("final_item_barcode") or {}).get("barcode_value"),
            ]
            if str(value or "").strip()
        }

        sales_history: list[dict[str, Any]] = []
        sale_order_nos: set[str] = set()
        for sale in self.sales_transactions:
            for item in sale.get("items", []):
                item_identity_id = str(item.get("identity_id") or "").strip().upper()
                item_barcode = str(item.get("barcode") or "").strip().upper()
                if item_identity_id not in identity_keys and item_barcode not in identity_keys:
                    continue
                sales_history.append(
                    {
                        "identity_id": item_identity_id or self._resolve_identity_id_for_barcode(item_barcode),
                        "order_no": str(sale.get("order_no") or "").strip().upper(),
                        "store_code": str(sale.get("store_code") or "").strip().upper(),
                        "sold_at": str(sale.get("sold_at") or sale.get("created_at") or ""),
                        "cashier_name": str(sale.get("cashier_name") or "").strip(),
                        "qty": int(item.get("qty") or 0),
                        "selling_price": round(float(item.get("selling_price") or 0.0), 2),
                        "line_total": round(float(item.get("line_total") or 0.0), 2),
                        "line_profit": round(float(item.get("line_profit") or 0.0), 2),
                        "sale_status": str(sale.get("sale_status") or "").strip(),
                        "payment_status": str(sale.get("payment_status") or "").strip(),
                        "returned_qty": int(item.get("returned_qty") or 0),
                        "refund_amount_total": round(float(item.get("returned_amount_total") or 0.0), 2),
                    }
                )
                sale_order_nos.add(str(sale.get("order_no") or "").strip().upper())
        sales_history = sorted(sales_history, key=lambda row: row["sold_at"], reverse=True)

        refund_history: list[dict[str, Any]] = []
        refund_nos: set[str] = set()
        for refund in self.sale_refund_requests.values():
            for item in refund.get("items", []):
                item_identity_id = str(item.get("identity_id") or "").strip().upper()
                item_barcode = str(item.get("barcode") or "").strip().upper()
                if item_identity_id not in identity_keys and item_barcode not in identity_keys:
                    continue
                refund_history.append(
                    {
                        "identity_id": item_identity_id or self._resolve_identity_id_for_barcode(item_barcode),
                        "refund_no": str(refund.get("refund_no") or "").strip().upper(),
                        "order_no": str(refund.get("order_no") or "").strip().upper(),
                        "status": str(refund.get("status") or "").strip(),
                        "store_code": str(refund.get("store_code") or "").strip().upper(),
                        "refund_method": str(refund.get("refund_method") or "").strip().lower(),
                        "requested_qty": int(item.get("requested_qty") or 0),
                        "refund_amount": round(float(item.get("refund_amount") or 0.0), 2),
                        "reason": str(refund.get("reason") or "").strip(),
                        "requested_at": str(refund.get("requested_at") or ""),
                        "reviewed_at": refund.get("reviewed_at"),
                    }
                )
                refund_nos.add(str(refund.get("refund_no") or "").strip().upper())
        refund_history = sorted(
            refund_history,
            key=lambda row: str(row.get("reviewed_at") or row.get("requested_at") or ""),
            reverse=True,
        )

        return_history: list[dict[str, Any]] = []
        return_nos: set[str] = set()
        for order in self.return_orders.values():
            for item in order.get("items", []):
                item_identity_id = str(item.get("identity_id") or "").strip().upper()
                item_barcode = str(item.get("barcode") or "").strip().upper()
                if item_identity_id not in identity_keys and item_barcode not in identity_keys:
                    continue
                return_history.append(
                    {
                        "identity_id": item_identity_id or self._resolve_identity_id_for_barcode(item_barcode),
                        "return_no": str(order.get("return_no") or "").strip().upper(),
                        "status": str(order.get("status") or "").strip(),
                        "from_store_code": str(order.get("from_store_code") or "").strip().upper(),
                        "to_warehouse_code": str(order.get("to_warehouse_code") or "").strip().upper(),
                        "reason": str(order.get("reason") or "").strip(),
                        "requested_qty": int(item.get("requested_qty") or 0),
                        "returned_qty": int(item.get("returned_qty") or 0),
                        "created_at": str(order.get("created_at") or ""),
                        "dispatched_at": order.get("dispatched_at"),
                        "received_at": order.get("received_at"),
                    }
                )
                return_nos.add(str(order.get("return_no") or "").strip().upper())
        return_history = sorted(return_history, key=lambda row: row["created_at"], reverse=True)

        price_history: list[dict[str, Any]] = []
        rack_history: list[dict[str, Any]] = []

        timeline: list[dict[str, Any]] = []
        timeline_seen: set[tuple[str, str, str]] = set()

        def append_timeline(source_type: str, occurred_at: str, title: str, actor: str = "", reference_no: str = "", status: str = "", details: Optional[dict[str, Any]] = None) -> None:
            key = (source_type, occurred_at or "", reference_no or title)
            if key in timeline_seen:
                return
            timeline_seen.add(key)
            timeline.append(
                {
                    "source_type": source_type,
                    "occurred_at": occurred_at or "",
                    "title": title,
                    "actor": actor,
                    "reference_no": reference_no,
                    "status": status,
                    "details": details or {},
                }
            )

        for movement in self.inventory_movements:
            if str(movement.get("barcode") or "").strip().upper() != barcode:
                continue
            append_timeline(
                "inventory",
                str(movement.get("created_at") or ""),
                f"库存动作：{movement.get('movement_type') or '-'}",
                actor=str(movement.get("actor") or ""),
                reference_no=str(movement.get("reference_no") or ""),
                status=str(movement.get("location_type") or ""),
                details={
                    "location_code": movement.get("location_code", ""),
                    "quantity_delta": movement.get("quantity_delta", 0),
                    "note": movement.get("note", ""),
                },
            )

        for event in self.audit_events:
            entity_type = str(event.get("entity_type") or "").strip()
            entity_id = str(event.get("entity_id") or "").strip().upper()
            details = event.get("details") or {}
            detail_barcode = str(details.get("barcode") or "").strip().upper()
            detail_token_no = str(details.get("token_no") or "").strip().upper()
            detail_barcode_value = str(details.get("barcode_value") or "").strip().upper()
            detail_identity_id = str(details.get("identity_id") or "").strip().upper()
            if not any(
                [
                    entity_type == "item_barcode_token" and entity_id == barcode,
                    entity_type == "product" and product and entity_id == str(product.get("product_code") or "").strip().upper(),
                    entity_type == "store_dispatch_bale" and store_dispatch_bale_no and entity_id == store_dispatch_bale_no,
                    entity_type == "sorting_task" and task_no and entity_id == task_no,
                    entity_type == "sale" and entity_id in sale_order_nos,
                    entity_type == "sale_refund_request" and entity_id in refund_nos,
                    entity_type == "return_order" and entity_id in return_nos,
                    detail_barcode == barcode,
                    detail_token_no == barcode,
                    detail_barcode_value == barcode,
                    detail_identity_id in identity_keys,
                ]
            ):
                continue
            append_timeline(
                "audit",
                str(event.get("created_at") or ""),
                str(event.get("summary") or "").strip() or str(event.get("event_type") or "").strip(),
                actor=str(event.get("actor") or ""),
                reference_no=entity_id,
                status=str(event.get("event_type") or "").strip(),
                details=details,
            )
            event_type = str(event.get("event_type") or "").strip().lower()
            if event_type == "item_token.store_edited":
                price_history.append(
                    {
                        "occurred_at": str(event.get("created_at") or ""),
                        "actor": str(event.get("actor") or ""),
                        "source_type": "store_edit",
                        "reference_no": entity_id,
                        "previous_price_kes": (
                            round(float(details.get("previous_selling_price_kes") or 0.0), 2)
                            if details.get("previous_selling_price_kes") is not None
                            else None
                        ),
                        "current_price_kes": (
                            round(float(details.get("selling_price_kes") or 0.0), 2)
                            if details.get("selling_price_kes") is not None
                            else None
                        ),
                        "note": str(details.get("note") or "").strip(),
                    }
                )
                rack_history.append(
                    {
                        "occurred_at": str(event.get("created_at") or ""),
                        "actor": str(event.get("actor") or ""),
                        "source_type": "store_edit",
                        "reference_no": entity_id,
                        "previous_rack_code": str(details.get("previous_store_rack_code") or "").strip().upper(),
                        "current_rack_code": str(details.get("store_rack_code") or "").strip().upper(),
                        "note": str(details.get("note") or "").strip(),
                    }
                )
            elif event_type == "store.rack_assigned":
                rack_history.append(
                    {
                        "occurred_at": str(event.get("created_at") or ""),
                        "actor": str(event.get("actor") or ""),
                        "source_type": "rack_assign",
                        "reference_no": entity_id,
                        "previous_rack_code": str(details.get("previous_rack_code") or "").strip().upper(),
                        "current_rack_code": str(details.get("rack_code") or "").strip().upper(),
                        "note": "",
                    }
                )
            elif event_type == "store_token_receiving.batch_recorded":
                rack_history.append(
                    {
                        "occurred_at": str(event.get("created_at") or ""),
                        "actor": str(event.get("actor") or ""),
                        "source_type": "shelving",
                        "reference_no": entity_id,
                        "previous_rack_code": str(details.get("previous_rack_code") or "").strip().upper(),
                        "current_rack_code": str(details.get("rack_code") or "").strip().upper(),
                        "note": str(details.get("token_no") or "").strip().upper(),
                    }
                )

        for row in sales_history:
            append_timeline(
                "sale",
                row["sold_at"],
                f"销售出单 {row['order_no']}",
                actor=row["cashier_name"],
                reference_no=row["order_no"],
                status=row["sale_status"],
                details={
                    "store_code": row["store_code"],
                    "identity_id": row["identity_id"],
                    "selling_price": row["selling_price"],
                    "line_total": row["line_total"],
                    "returned_qty": row["returned_qty"],
                },
            )

        for row in refund_history:
            append_timeline(
                "refund",
                row["reviewed_at"] or row["requested_at"],
                f"退款单 {row['refund_no']}",
                reference_no=row["refund_no"],
                status=row["status"],
                details={
                    "store_code": row["store_code"],
                    "identity_id": row["identity_id"],
                    "order_no": row["order_no"],
                    "requested_qty": row["requested_qty"],
                    "refund_amount": row["refund_amount"],
                },
            )

        for row in return_history:
            append_timeline(
                "return",
                row["received_at"] or row["dispatched_at"] or row["created_at"],
                f"退仓单 {row['return_no']}",
                reference_no=row["return_no"],
                status=row["status"],
                details={
                    "identity_id": row["identity_id"],
                    "from_store_code": row["from_store_code"],
                    "to_warehouse_code": row["to_warehouse_code"],
                    "requested_qty": row["requested_qty"],
                    "returned_qty": row["returned_qty"],
                },
            )

        timeline = sorted(timeline, key=lambda row: row["occurred_at"], reverse=True)
        price_history = sorted(price_history, key=lambda row: row["occurred_at"], reverse=True)
        rack_history = sorted(rack_history, key=lambda row: row["occurred_at"], reverse=True)

        current_stage = "未激活"
        latest_location_code = ""
        latest_rack_code = ""
        if store_locations:
            current_stage = "门店在架"
            latest_location_code = store_locations[0]["location_code"]
            latest_rack_code = store_locations[0]["rack_code"]
        elif warehouse_locations:
            current_stage = "仓库在库"
            latest_location_code = warehouse_locations[0]["location_code"]
            latest_rack_code = warehouse_locations[0]["rack_code"]
        elif sales_history:
            current_stage = "已售出"
            latest_location_code = sales_history[0]["store_code"]
        elif str((token or {}).get("status") or "").strip():
            status_map = {
                "pending_store_print": "待门店贴码",
                "reserved_waiting_store_dispatch": "已悬挂待压缩待送店",
                "reserved_waiting_bale_sale": "已悬挂待压缩待售卖",
                "print_queued": "打印排队中",
                "printed_in_store": "已打印待上架",
                "shelved_in_store": "已门店上架",
                "print_failed": "打印失败待处理",
            }
            current_stage = status_map.get(str(token.get("status") or "").strip().lower(), str(token.get("status") or "").strip())

        return {
            "identity_no": str((token or {}).get("identity_no") or barcode or normalized_identity_no).strip().upper(),
            "token_no": str((token or {}).get("token_no") or barcode or normalized_identity_no).strip().upper(),
            "barcode": barcode,
            "product_code": str((product or {}).get("product_code") or "").strip().upper(),
            "product_name": str((product or {}).get("product_name") or "").strip(),
            "category_name": str((token or {}).get("category_name") or "").strip(),
            "category_main": str((product or {}).get("category_main") or (source_bales[0]["category_main"] if source_bales else "")).strip(),
            "category_sub": str((product or {}).get("category_sub") or (source_bales[0]["category_sub"] if source_bales else "")).strip(),
            "grade": str((token or {}).get("grade") or "").strip(),
            "sku_code": str((token or {}).get("sku_code") or "").strip().upper(),
            "cost_status": str((token or {}).get("cost_status") or "").strip(),
            "unit_cost_kes": (round(float((token or {}).get("unit_cost_kes") or (product or {}).get("cost_price") or 0.0), 2) if ((token or {}).get("unit_cost_kes") is not None or (product or {}).get("cost_price") is not None) else None),
            "cost_model_code": str((token or {}).get("cost_model_code") or "").strip(),
            "cost_locked_at": (token or {}).get("cost_locked_at"),
            "source_pool_tokens": [str(code).strip() for code in ((token or {}).get("source_pool_tokens") or []) if str(code).strip()],
            "suggested_price_kes": (round(float((token or {}).get("suggested_price_kes") or 0.0), 2) if (token or {}).get("suggested_price_kes") is not None else None),
            "selling_price_kes": (round(float((token or {}).get("selling_price_kes") or 0.0), 2) if (token or {}).get("selling_price_kes") is not None else None),
            "suggested_rack_code": str((token or {}).get("suggested_rack_code") or "").strip().upper(),
            "store_rack_code": str((token or {}).get("store_rack_code") or (product or {}).get("rack_code") or "").strip().upper(),
            "shipment_no": shipment_no,
            "customs_notice_no": str((token or {}).get("customs_notice_no") or "").strip().upper(),
            "task_no": task_no,
            "source_bale_barcodes": source_bale_codes,
            "source_legacy_bale_barcodes": source_legacy_bale_codes,
            "supplier_names": supplier_names,
            "store_dispatch_bale_no": store_dispatch_bale_no,
            "store_dispatch_bale_status": str((dispatch_bale or {}).get("status") or "").strip(),
            "assigned_employee": str((token or {}).get("assigned_employee") or (dispatch_bale or {}).get("assigned_employee") or "").strip(),
            "store_code": str((token or {}).get("store_code") or (dispatch_bale or {}).get("store_code") or "").strip().upper(),
            "printed_at": (token or {}).get("printed_at"),
            "edited_at": (token or {}).get("edited_at"),
            "shelved_at": (token or {}).get("shelved_at"),
            "location": {
                "current_stage": current_stage,
                "warehouse_locations": warehouse_locations,
                "store_locations": store_locations,
                "latest_location_code": latest_location_code,
                "latest_rack_code": latest_rack_code,
            },
            "source_bales": source_bales,
            "price_history": price_history,
            "rack_history": rack_history,
            "sales_history": sales_history,
            "refund_history": refund_history,
            "return_history": return_history,
            "timeline": timeline,
        }

    def list_store_dispatch_bales(
        self,
        store_code: Optional[str] = None,
        task_no: Optional[str] = None,
        shipment_no: Optional[str] = None,
        status: Optional[str] = None,
        assigned_employee: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        self._rebuild_store_dispatch_bales()
        rows = list(self.store_dispatch_bales.values())
        if store_code:
            normalized_store_code = store_code.strip().upper()
            rows = [row for row in rows if str(row.get("store_code") or "").strip().upper() == normalized_store_code]
        if task_no:
            normalized_task_no = task_no.strip().upper()
            rows = [row for row in rows if str(row.get("task_no") or "").strip().upper() == normalized_task_no]
        if shipment_no:
            normalized_shipment_no = shipment_no.strip().upper()
            rows = [row for row in rows if str(row.get("shipment_no") or "").strip().upper() == normalized_shipment_no]
        if status:
            normalized_status = status.strip().lower()
            rows = [row for row in rows if str(row.get("status") or "").strip().lower() == normalized_status]
        if assigned_employee:
            normalized_employee = assigned_employee.strip().lower()
            rows = [row for row in rows if str(row.get("assigned_employee") or "").strip().lower() == normalized_employee]
        return sorted(
            rows,
            key=lambda row: (
                str(row.get("shipment_no") or ""),
                str(row.get("task_no") or ""),
                int(row.get("token_group_no") or 0),
            ),
        )

    def get_store_dispatch_bale(self, bale_no: str) -> dict[str, Any]:
        self._rebuild_store_dispatch_bales()
        normalized_bale_no = str(bale_no or "").strip().upper()
        bale = self.store_dispatch_bales.get(normalized_bale_no)
        if not bale:
            raise HTTPException(status_code=404, detail=f"Unknown store dispatch bale {normalized_bale_no}")
        self._refresh_store_dispatch_bale_summary(bale)
        return bale

    def accept_store_dispatch_bale(self, bale_no: str, payload: dict[str, Any]) -> dict[str, Any]:
        actor = self._require_user_role(payload["accepted_by"], {"store_manager"})
        bale = self.get_store_dispatch_bale(bale_no)
        requested_store_code = str(payload.get("store_code") or "").strip().upper()
        expected_store_code = str(bale.get("store_code") or "").strip().upper()
        if not requested_store_code:
            raise HTTPException(status_code=400, detail="Store code is required")
        if expected_store_code and expected_store_code != requested_store_code:
            raise HTTPException(
                status_code=409,
                detail=f"Scanned dispatch bale {str(bale.get('bale_no') or '').strip().upper()} belongs to {expected_store_code}, not {requested_store_code}",
            )
        requested_transfer_no = str(payload.get("transfer_no") or "").strip().upper()
        expected_transfer_no = str(bale.get("transfer_no") or "").strip().upper()
        if expected_transfer_no:
            if not requested_transfer_no:
                raise HTTPException(status_code=400, detail="请先选择调拨单，再验收这张调拨单下的门店配货 bale")
            if requested_transfer_no != expected_transfer_no:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"Scanned dispatch bale {str(bale.get('bale_no') or '').strip().upper()} "
                        f"belongs to transfer {expected_transfer_no}, not {requested_transfer_no}"
                    ),
                )
        bale["store_code"] = expected_store_code or requested_store_code
        bale["accepted_at"] = now_iso()
        bale["accepted_by"] = actor["username"]
        bale["accepted_note"] = str(payload.get("note") or "").strip()
        bale["updated_at"] = bale["accepted_at"]
        for token_no in bale.get("token_nos", []):
            token = self.item_barcode_tokens.get(str(token_no or "").strip().upper())
            if not token:
                continue
            token["store_code"] = bale["store_code"]
            token["accepted_at"] = bale["accepted_at"]
            token["accepted_by"] = actor["username"]
            token["accepted_note"] = bale["accepted_note"]
            if not str(token.get("suggested_rack_code") or "").strip():
                suggestion = self._build_item_token_placement_suggestion(bale["store_code"], token["token_no"])
                token["suggested_rack_code"] = str((suggestion.get("suggested_rack_codes") or [""])[0] or "").strip().upper()
            token["updated_at"] = bale["accepted_at"]
        self._refresh_store_dispatch_bale_summary(bale)
        self._log_event(
            event_type="store_dispatch_bale.accepted",
            entity_type="store_dispatch_bale",
            entity_id=bale["bale_no"],
            actor=actor["username"],
            summary=f"Store dispatch bale {bale['bale_no']} accepted",
            details={"store_code": bale["store_code"], "note": bale["accepted_note"]},
        )
        self._sync_transfer_dispatch_progress(str(bale.get("transfer_no") or ""))
        self._persist()
        return bale

    def assign_store_dispatch_bale(self, bale_no: str, payload: dict[str, Any]) -> dict[str, Any]:
        actor = self._require_user_role(payload["assigned_by"], {"store_manager", "area_supervisor"})
        bale = self.get_store_dispatch_bale(bale_no)
        if not bale.get("accepted_at"):
            raise HTTPException(status_code=400, detail="请先完成门店验收，再分配店员")
        previous_employee = str(bale.get("assigned_employee") or "").strip()
        bale["assigned_employee"] = str(payload.get("employee_name") or "").strip()
        if not bale["assigned_employee"]:
            raise HTTPException(status_code=400, detail="Employee name is required")
        if (
            previous_employee
            and previous_employee.lower() != bale["assigned_employee"].lower()
            and any(int(bale.get(field) or 0) > 0 for field in ("edited_count", "printed_count", "shelved_count"))
        ):
            raise HTTPException(status_code=409, detail=f"{bale['bale_no']} 已开始处理，不能再改派给其他店员")
        bale["assigned_at"] = now_iso()
        bale["assignment_note"] = str(payload.get("note") or "").strip()
        bale["updated_at"] = bale["assigned_at"]
        for token_no in bale.get("token_nos", []):
            token = self.item_barcode_tokens.get(str(token_no or "").strip().upper())
            if not token:
                continue
            token["store_code"] = bale["store_code"]
            token["store_dispatch_bale_no"] = bale["bale_no"]
            token["assigned_employee"] = bale["assigned_employee"]
            token["assigned_at"] = bale["assigned_at"]
            token["assignment_note"] = bale["assignment_note"]
            token["updated_at"] = bale["assigned_at"]
        self._refresh_store_dispatch_bale_summary(bale)
        self._log_event(
            event_type="store_dispatch_bale.assigned",
            entity_type="store_dispatch_bale",
            entity_id=bale["bale_no"],
            actor=actor["username"],
            summary=f"Store dispatch bale {bale['bale_no']} assigned to {bale['assigned_employee']}",
            details={"store_code": bale["store_code"], "employee_name": bale["assigned_employee"], "note": bale["assignment_note"]},
        )
        self._sync_transfer_dispatch_progress(str(bale.get("transfer_no") or ""))
        self._persist()
        return bale

    def get_store_dispatch_bale_tokens(self, bale_no: str) -> list[dict[str, Any]]:
        bale = self.get_store_dispatch_bale(bale_no)
        rows = [
            self.item_barcode_tokens.get(str(token_no or "").strip().upper())
            for token_no in bale.get("token_nos", [])
        ]
        rows = [row for row in rows if row]
        return sorted(rows, key=lambda row: int(row.get("qty_index") or 0))

    def update_item_barcode_token_store_edit(self, token_no: str, payload: dict[str, Any]) -> dict[str, Any]:
        actor = self._require_user_role(payload["updated_by"], {"store_manager", "store_clerk", "area_supervisor"})
        normalized_token_no = str(token_no or "").strip().upper()
        token = self.item_barcode_tokens.get(normalized_token_no)
        if not token:
            raise HTTPException(status_code=404, detail=f"Unknown item token {normalized_token_no}")
        self._enforce_store_clerk_assignment(
            actor,
            str(token.get("assigned_employee") or "").strip(),
            f"门店配货 bale {str(token.get('store_dispatch_bale_no') or '').strip().upper() or normalized_token_no}",
        )
        previous_selling_price_kes = token.get("selling_price_kes")
        previous_store_rack_code = str(token.get("store_rack_code") or "").strip().upper()
        token["store_code"] = str(payload.get("store_code") or token.get("store_code") or "").strip().upper()
        token["selling_price_kes"] = round(float(payload.get("selling_price_kes") or 0.0), 2)
        token["store_rack_code"] = str(payload.get("store_rack_code") or "").strip().upper()
        token["edited_at"] = now_iso()
        token["edited_by"] = actor["username"]
        token["updated_at"] = token["edited_at"]
        token.setdefault("identity_no", normalized_token_no)
        token_barcode_value = str(token.get("barcode_value") or normalized_token_no).strip().upper()
        product_id = self.product_by_barcode.get(token_barcode_value) or self.product_by_barcode.get(normalized_token_no)
        if product_id is not None:
            product = self.products[product_id]
            product["launch_price"] = token["selling_price_kes"]
            product["rack_code"] = token["store_rack_code"]
            product["updated_at"] = token["edited_at"]
        bale_no = str(token.get("store_dispatch_bale_no") or "").strip().upper()
        if bale_no and bale_no in self.store_dispatch_bales:
            self._refresh_store_dispatch_bale_summary(self.store_dispatch_bales[bale_no])
        self._log_event(
            event_type="item_token.store_edited",
            entity_type="item_barcode_token",
            entity_id=normalized_token_no,
            actor=actor["username"],
            summary=f"Item token {normalized_token_no} edited in store",
            details={
                "store_code": token["store_code"],
                "previous_selling_price_kes": previous_selling_price_kes,
                "selling_price_kes": token["selling_price_kes"],
                "previous_store_rack_code": previous_store_rack_code,
                "store_rack_code": token["store_rack_code"],
                "note": str(payload.get("note") or "").strip(),
            },
        )
        self._persist()
        return token

    def submit_sorting_task_results(self, task_no: str, payload: dict[str, Any]) -> dict[str, Any]:
        actor = self._require_user_role(payload["created_by"], {"warehouse_clerk", "warehouse_supervisor"})
        normalized_task_no = task_no.strip().upper()
        task = self.sorting_tasks.get(normalized_task_no)
        if not task:
            raise HTTPException(status_code=404, detail=f"Unknown sorting task {normalized_task_no}")
        task = self._ensure_sorting_task_defaults(task)

        self._drop_sorting_item_tokens_for_task(normalized_task_no)
        result_items: list[dict[str, Any]] = []
        generated_token_count = 0
        generated_token_preview: list[str] = []
        task_bale_barcodes = [str(code).strip().upper() for code in task.get("bale_barcodes", []) if str(code).strip()]
        task_legacy_bale_barcodes = [str(code).strip().upper() for code in task.get("legacy_bale_barcodes", []) if str(code).strip()]
        shipment_no = str(task.get("shipment_no") or "").strip().upper()
        customs_notice_no = str(task.get("customs_notice_no") or "").strip().upper()
        loss_record = self._normalize_sorting_loss_record(payload.get("loss_record"))
        cost_snapshot = self._build_sorting_task_cost_snapshot(task, payload["result_items"], loss_record)
        source_bale_tokens = cost_snapshot["source_bale_tokens"]
        source_pool_tokens = cost_snapshot["source_pool_tokens"]
        estimated_unit_cost_kes = cost_snapshot["estimated_unit_cost_kes"]
        cost_model_code = cost_snapshot["cost_model_code"]
        cost_status = cost_snapshot["cost_status"]
        cost_locked_at = cost_snapshot["cost_locked_at"]
        row_estimate_map = {
            int(row.get("row_index") or 0): row
            for row in cost_snapshot["row_estimates"]
        }
        token_serial = 1
        for row_index, item in enumerate(payload["result_items"]):
            category_name = item["category_name"].strip()
            grade = item["grade"].strip()
            normalized_grade = grade.upper()
            confirm_to_inventory = bool(item.get("confirm_to_inventory", True))
            requires_default_cost_profile = not (
                cost_status == "cost_locked"
                and int(item.get("qty") or 0) > 0
                and float((row_estimate_map.get(row_index) or {}).get("actual_weight_kg") or 0) > 0
            )
            default_cost_kes = self._resolve_sorting_result_default_cost_kes(
                category_name,
                grade,
                item.get("default_cost_kes"),
            )
            if confirm_to_inventory and requires_default_cost_profile and default_cost_kes in {None, ""}:
                raise HTTPException(
                    status_code=400,
                    detail=f"{category_name} / {normalized_grade} 还没有配置默认成本价，请先完成 4.7 默认成本价管理",
                )
            rack_code = self._resolve_sorting_result_rack_code(
                category_name,
                grade,
                default_cost_kes,
                item.get("rack_code"),
            )
            if confirm_to_inventory and not rack_code:
                default_cost_label = f"{float(default_cost_kes):.2f}" if default_cost_kes not in {None, ""} else "-"
                raise HTTPException(
                    status_code=400,
                    detail=f"{category_name} / {normalized_grade} / {default_cost_label} 还没有配置分拣库位，请先完成 4.8 分拣库位管理",
                )
            sku_code = self._sorting_sku_code(category_name, grade, default_cost_kes)
            row_token_preview: list[str] = []
            row_token_count = int(item["qty"])
            row_estimate = row_estimate_map.get(row_index, {})
            row_unit_cost_kes = row_estimate.get("estimated_unit_cost_kes")
            row_total_cost_kes = row_estimate.get("estimated_total_cost_kes")
            row_unit_cost_kes = round(float(row_unit_cost_kes), 2) if row_unit_cost_kes is not None else None
            row_total_cost_kes = round(float(row_total_cost_kes), 2) if row_total_cost_kes is not None else None
            token_group_no = len(result_items) + 1
            sorting_cost_layer_id = f"{normalized_task_no}-{token_group_no:03d}"
            store_dispatch_bale_no = self._store_dispatch_bale_no(normalized_task_no, token_group_no)
            row = {
                "category_name": category_name,
                "grade": grade,
                "sku_code": sku_code,
                "actual_weight_kg": row_estimate.get("actual_weight_kg"),
                "qty": row_token_count,
                "rack_code": rack_code,
                "confirm_to_inventory": confirm_to_inventory,
                "default_cost_kes": default_cost_kes,
                "generated_token_count": row_token_count,
                "generated_token_preview": row_token_preview,
                "cost_status": cost_status,
                "unit_cost_kes": row_unit_cost_kes,
                "total_cost_kes": row_total_cost_kes,
            }
            if row["confirm_to_inventory"]:
                conflicting_rack_row = next(
                    (
                        stock_row
                        for stock_row in self.sorting_stock.values()
                        if str(stock_row.get("rack_code") or "").strip().upper() == rack_code
                        and self._sorting_stock_profile_signature(stock_row) != self._sorting_stock_profile_signature(row)
                    ),
                    None,
                )
                if conflicting_rack_row:
                    raise HTTPException(
                        status_code=409,
                        detail=(
                            f"Rack {rack_code} 已绑定 "
                            f"{conflicting_rack_row['category_name']} / {str(conflicting_rack_row.get('grade') or '').strip().upper()} / "
                            f"KES {round(float(conflicting_rack_row.get('default_cost_kes') or 0), 2):.2f}，当前非贴码模式不能混放。"
                        ),
                    )
                stock_key = f"{rack_code}||{sku_code}"
                existing = self.sorting_stock.get(stock_key)
                if existing and (
                    self._sorting_stock_profile_signature(existing) != self._sorting_stock_profile_signature(row)
                ):
                    raise HTTPException(
                        status_code=409,
                        detail=f"Rack {rack_code} already stores {existing['sku_code']}, cannot mix with {sku_code}",
                    )
                current_qty = existing["qty_on_hand"] if existing else 0
                existing = self._hydrate_sorting_stock_costs(existing) if existing else None
                existing_cost_layers = list((existing or {}).get("cost_layers") or [])
                if row_total_cost_kes is not None and row_unit_cost_kes is not None and row["qty"] > 0:
                    existing_cost_layers.append(
                        {
                            "layer_id": sorting_cost_layer_id,
                            "task_no": normalized_task_no,
                            "qty_on_hand": row["qty"],
                            "unit_cost_kes": row_unit_cost_kes,
                            "total_cost_kes": row_total_cost_kes,
                            "source_pool_tokens": list(source_pool_tokens),
                            "source_bale_tokens": list(source_bale_tokens),
                            "created_at": now_iso(),
                        }
                    )
                existing_total_cost_kes = (
                    round(float(existing.get("total_cost_kes") or 0), 2)
                    if existing and existing.get("total_cost_kes") not in {None, ""}
                    else None
                )
                next_qty = current_qty + row["qty"]
                next_total_cost_kes = (
                    round(existing_total_cost_kes + row_total_cost_kes, 2)
                    if existing_total_cost_kes is not None and row_total_cost_kes is not None
                    else (
                        row_total_cost_kes
                        if existing_total_cost_kes in {None} and row_total_cost_kes is not None and current_qty == 0
                        else None
                    )
                )
                next_unit_cost_kes = (
                    round(next_total_cost_kes / next_qty, 2)
                    if next_total_cost_kes is not None and next_qty > 0
                    else row_unit_cost_kes
                )
                self.sorting_stock[stock_key] = {
                    "rack_code": rack_code,
                    "category_name": category_name,
                    "grade": grade,
                    "sku_code": sku_code,
                    "default_cost_kes": default_cost_kes,
                    "unit_cost_kes": next_unit_cost_kes,
                    "total_cost_kes": next_total_cost_kes,
                    "qty_on_hand": next_qty,
                    "cost_layers": existing_cost_layers,
                    "updated_at": now_iso(),
                }
                self._record_inventory_movement(
                    movement_type="sorting_confirm_in",
                    barcode=sku_code,
                    product_name=f"{category_name} ({grade})",
                    quantity_delta=row["qty"],
                    location_type="warehouse_sorting",
                    location_code=rack_code,
                    reference_type="sorting_task",
                    reference_no=normalized_task_no,
                    actor=actor["username"],
                    note="Sorting result confirmed into warehouse category stock",
                    details={"category_name": category_name, "grade": grade},
                )
            for item_index in range(1, row_token_count + 1):
                token_no = self._sorting_item_token_no(normalized_task_no, token_serial)
                barcode_value = self._store_item_barcode_value(normalized_task_no, token_serial)
                token_row = {
                    "token_no": token_no,
                    "task_no": normalized_task_no,
                    "shipment_no": shipment_no,
                    "customs_notice_no": customs_notice_no,
                    "source_bale_barcodes": list(task_bale_barcodes),
                    "source_legacy_bale_barcodes": list(task_legacy_bale_barcodes),
                    "category_name": category_name,
                    "grade": grade,
                    "sku_code": sku_code,
                    "rack_code": rack_code,
                    "default_cost_kes": default_cost_kes,
                    "qty_index": item_index,
                    "qty_total": row_token_count,
                    "token_group_no": token_group_no,
                    "store_dispatch_bale_no": store_dispatch_bale_no,
                    "identity_no": token_no,
                    "barcode_value": barcode_value,
                    "status": "pending_store_print",
                    "cost_status": cost_status,
                    "unit_cost_kes": row_unit_cost_kes,
                    "sorting_cost_layer_id": sorting_cost_layer_id,
                    "cost_model_code": cost_model_code,
                    "cost_locked_at": cost_locked_at,
                    "source_pool_tokens": list(source_pool_tokens),
                    "source_bale_tokens": list(source_bale_tokens),
                    "suggested_price_kes": self._default_store_price_kes(row_unit_cost_kes),
                    "selling_price_kes": None,
                    "suggested_rack_code": "",
                    "store_rack_code": "",
                    "store_code": "",
                    "assigned_employee": "",
                    "created_at": now_iso(),
                    "updated_at": now_iso(),
                    "created_by": actor["username"],
                }
                self.item_barcode_tokens[token_no] = token_row
                row_token_preview.append(token_no)
                if len(generated_token_preview) < 8:
                    generated_token_preview.append(token_no)
                generated_token_count += 1
                token_serial += 1
            row["generated_token_preview"] = row_token_preview[:4]
            result_items.append(row)

        task["result_items"] = result_items
        task["generated_token_count"] = generated_token_count
        task["generated_token_preview"] = generated_token_preview
        task["note"] = payload.get("note", task.get("note", ""))
        task["cost_status"] = cost_status
        task["unit_cost_kes"] = estimated_unit_cost_kes
        task["cost_model_code"] = cost_model_code
        task["source_bale_token_count"] = len(set(source_bale_tokens))
        task["source_pool_token_count"] = len(set(source_pool_tokens))
        task["cost_locked_at"] = cost_locked_at
        task["loss_record"] = loss_record
        task["updated_at"] = now_iso()
        if payload.get("mark_task_completed", True):
            task["status"] = "confirmed"
            task["completed_at"] = task["updated_at"]
            for bale_barcode in task.get("bale_barcodes", []):
                bale = self._find_raw_bale_by_reference_no_defaults(bale_barcode)
                if bale:
                    bale["status"] = "sorted"
                    bale["current_location"] = "sorted_inventory"
                    bale["updated_at"] = now_iso()
            for batch_no in task["parcel_batch_nos"]:
                if batch_no in self.parcel_batches:
                    batch_bales = [
                        row for row in self.bale_barcodes.values()
                        if row.get("parcel_batch_no") == batch_no
                    ]
                    all_sorted = batch_bales and all(row.get("status") == "sorted" for row in batch_bales)
                    self.parcel_batches[batch_no]["status"] = "sorted" if all_sorted else "sorting_in_progress"
                    self.parcel_batches[batch_no]["updated_at"] = now_iso()
        else:
            task["completed_at"] = None
        self._log_event(
            event_type="sorting_task.results_confirmed",
            entity_type="sorting_task",
            entity_id=normalized_task_no,
            actor=actor["username"],
            summary=f"Sorting task {normalized_task_no} results confirmed",
            details={
                "result_count": len(result_items),
                "generated_token_count": generated_token_count,
                "completed": payload.get("mark_task_completed", True),
                "has_loss": loss_record["has_loss"],
                "loss_qty": loss_record["loss_qty"],
                "loss_weight_kg": loss_record["loss_weight_kg"],
            },
        )
        self._rebuild_store_dispatch_bales()
        self._persist()
        return task

    def _build_item_token_print_job(
        self,
        token_no: str,
        copies: int,
        printer_name: str,
        requested_by: str,
        template_code: str = "apparel_40x30",
    ) -> dict[str, Any]:
        normalized_token_no = str(token_no or "").strip().upper()
        token = self.item_barcode_tokens.get(normalized_token_no)
        if not token:
            raise HTTPException(status_code=404, detail=f"Unknown item token {normalized_token_no}")
        if token.get("selling_price_kes") is None:
            raise HTTPException(status_code=409, detail=f"Token {normalized_token_no} 还没填写门店售价，不能打印")
        if not str(token.get("store_rack_code") or "").strip():
            raise HTTPException(status_code=409, detail=f"Token {normalized_token_no} 还没填写货架位，不能打印")
        category_name = str(token.get("category_name") or "").strip()
        category_main, _, category_sub = category_name.partition("/")
        template_row = self.label_templates.get(str(template_code or "").strip().lower()) or {}
        label_size = (
            f"{int(template_row.get('width_mm') or 40)}x{int(template_row.get('height_mm') or 30)}"
            if template_row
            else "40x30"
        )
        display_name = f"{category_name} · {str(token.get('grade') or '').strip()}".strip(" ·")
        barcode_value = str(token.get("barcode_value") or "").strip().upper()
        if not barcode_value:
            barcode_value = self._store_item_barcode_value(str(token.get("task_no") or ""), int(token.get("qty_index") or 1), token.get("created_at"))
            token["barcode_value"] = barcode_value
        token["barcode_value"] = barcode_value
        job = {
            "id": next(self._print_job_ids),
            "job_type": "item_token_label",
            "status": "queued",
            "created_at": now_iso(),
            "product_id": None,
            "barcode": normalized_token_no,
            "product_name": display_name,
            "template_code": str(template_code or "apparel_40x30").strip() or "apparel_40x30",
            "label_size": label_size,
            "document_no": str(token.get("task_no") or ""),
            "printed_at": None,
            "printed_by": "",
            "error_message": "",
            "print_payload": {
                "symbology": "Code128",
                "barcode_value": barcode_value,
                "token_no": normalized_token_no,
                "human_readable": barcode_value,
                "product_name": display_name[:24],
                "category_main": category_main.strip(),
                "category_sub": category_sub.strip(),
                "grade": str(token.get("grade") or "").strip(),
                "shipment_no": str(token.get("shipment_no") or "").strip(),
                "price": token.get("selling_price_kes"),
                "short_suffix": str(token.get("store_rack_code") or token.get("suggested_rack_code") or "").strip().upper(),
                "template_code": str(template_code or "apparel_40x30").strip() or "apparel_40x30",
                "template_scope": str(template_row.get("template_scope") or "product").strip().lower(),
                "label_size": label_size,
            },
            "copies": copies,
            "printer_name": printer_name,
            "requested_by": requested_by,
        }
        self.print_jobs.append(job)
        token["status"] = "print_queued"
        token["updated_at"] = now_iso()
        self._log_event(
            event_type="print.item_token_label_queued",
            entity_type="print_job",
            entity_id=str(job["id"]),
            actor=requested_by,
            summary=f"Item token label queued for {normalized_token_no}",
            details={**job["print_payload"], "copies": copies},
        )
        return job

    def queue_item_barcode_token_print_jobs(self, payload: dict[str, Any]) -> list[dict[str, Any]]:
        actor = self._require_user_role(payload["requested_by"], {"store_manager", "store_clerk", "area_supervisor"})
        requested_tokens = [
            str(token_no or "").strip().upper()
            for token_no in payload.get("token_nos", [])
            if str(token_no or "").strip()
        ]
        if not requested_tokens:
            raise HTTPException(status_code=400, detail="At least one item token is required")
        jobs: list[dict[str, Any]] = []
        for token_no in requested_tokens:
            token = self.item_barcode_tokens.get(token_no)
            if not token:
                raise HTTPException(status_code=404, detail=f"Unknown item token {token_no}")
            self._enforce_store_clerk_assignment(
                actor,
                str(token.get("assigned_employee") or "").strip(),
                f"门店配货 bale {str(token.get('store_dispatch_bale_no') or '').strip().upper() or token_no}",
            )
            if str(token.get("status") or "").strip().lower() == "printed_in_store":
                continue
            jobs.append(
                self._build_item_token_print_job(
                    token_no=token_no,
                    copies=int(payload.get("copies") or 1),
                    printer_name=str(payload.get("printer_name") or "Deli DL-720C").strip() or "Deli DL-720C",
                    template_code=str(payload.get("template_code") or "apparel_40x30").strip() or "apparel_40x30",
                    requested_by=actor["username"],
                )
            )
        self._persist()
        return jobs

    def list_store_token_receiving_sessions(
        self,
        store_code: Optional[str] = None,
        task_no: Optional[str] = None,
        shipment_no: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        rows = list(self.store_token_receiving_sessions.values())
        if store_code:
            normalized_store_code = str(store_code).strip().upper()
            rows = [row for row in rows if str(row.get("store_code") or "").strip().upper() == normalized_store_code]
        if task_no:
            normalized_task_no = str(task_no).strip().upper()
            rows = [row for row in rows if str(row.get("task_no") or "").strip().upper() == normalized_task_no]
        if shipment_no:
            normalized_shipment_no = str(shipment_no).strip().upper()
            rows = [row for row in rows if str(row.get("shipment_no") or "").strip().upper() == normalized_shipment_no]
        return sorted(rows, key=lambda row: row["created_at"], reverse=True)

    def get_store_token_receiving_session(self, session_no: str) -> dict[str, Any]:
        normalized_session_no = str(session_no or "").strip().upper()
        session = self.store_token_receiving_sessions.get(normalized_session_no)
        if not session:
            raise HTTPException(status_code=404, detail=f"Unknown store token receiving session {normalized_session_no}")
        return session

    def _build_item_token_placement_suggestion(self, store_code: str, token_no: str) -> dict[str, Any]:
        store = self._ensure_store_exists(store_code)
        normalized_token_no = str(token_no or "").strip().upper()
        token = self.item_barcode_tokens.get(normalized_token_no)
        if not token:
            raise HTTPException(status_code=404, detail=f"Unknown item token {normalized_token_no}")
        category_name = str(token.get("category_name") or "").strip()
        grade = str(token.get("grade") or "").strip()
        previous_rack_code = str(token.get("store_rack_code") or "").strip().upper()
        if not previous_rack_code:
            related_batches = []
            for session in self.store_token_receiving_sessions.values():
                if str(session.get("store_code") or "").strip().upper() != store["code"]:
                    continue
                for batch in session.get("batches", []):
                    if (
                        str(batch.get("category_name") or "").strip().lower() == category_name.lower()
                        and str(batch.get("grade") or "").strip().lower() == grade.lower()
                    ):
                        related_batches.append(batch)
            if related_batches:
                related_batches.sort(key=lambda row: (str(row.get("created_at") or ""), int(row.get("batch_id") or 0)), reverse=True)
                previous_rack_code = str(related_batches[0].get("rack_code") or "").strip().upper()

        suggested_codes: list[str] = []
        if previous_rack_code:
            suggested_codes.append(previous_rack_code)

        category_terms = [
            str(part or "").strip().lower()
            for part in [category_name, *category_name.split("/"), grade]
            if str(part or "").strip()
        ]
        for row in self.list_store_racks(store["code"]):
            hint = str(row.get("category_hint", "")).strip().lower()
            if not hint:
                continue
            if any(term and (term in hint or hint in term) for term in category_terms):
                rack_code = str(row["rack_code"]).strip().upper()
                if rack_code not in suggested_codes:
                    suggested_codes.append(rack_code)

        return {
            "token_no": normalized_token_no,
            "store_code": store["code"],
            "category_name": category_name,
            "grade": grade,
            "previous_rack_code": previous_rack_code,
            "suggested_rack_codes": suggested_codes[:5],
        }

    def _refresh_store_token_receiving_session_summary(self, session: dict[str, Any]) -> None:
        placed_by_token: dict[str, str] = {}
        for batch in session.get("batches", []):
            placed_by_token[str(batch.get("token_no") or "").strip().upper()] = str(batch.get("rack_code") or "").strip().upper()

        token_summaries: list[dict[str, Any]] = []
        status_counts: defaultdict[str, int] = defaultdict(int)
        for token_no in session.get("token_nos", []):
            normalized_token_no = str(token_no or "").strip().upper()
            token = self.item_barcode_tokens.get(normalized_token_no)
            if not token:
                continue
            suggestion = self._build_item_token_placement_suggestion(session["store_code"], normalized_token_no)
            status = str(token.get("status") or "").strip()
            status_counts[status] += 1
            token_summaries.append(
                {
                    "token_no": normalized_token_no,
                    "category_name": str(token.get("category_name") or "").strip(),
                    "grade": str(token.get("grade") or "").strip(),
                    "status": status,
                    "previous_rack_code": suggestion["previous_rack_code"],
                    "suggested_rack_codes": suggestion["suggested_rack_codes"],
                    "latest_rack_code": placed_by_token.get(normalized_token_no, str(token.get("store_rack_code") or "").strip().upper()),
                    "placed_flag": normalized_token_no in placed_by_token,
                }
            )

        session["token_summaries"] = token_summaries
        session["analysis_summary"] = {
            "token_count": len(token_summaries),
            "placed_count": sum(1 for row in token_summaries if row.get("placed_flag")),
            "pending_count": sum(1 for row in token_summaries if not row.get("placed_flag")),
            "printed_count": status_counts.get("printed_in_store", 0),
            "queued_count": status_counts.get("print_queued", 0),
            "pending_print_count": status_counts.get("pending_store_print", 0),
            "failed_print_count": status_counts.get("print_failed", 0),
            "shelved_count": status_counts.get("shelved_in_store", 0),
            "category_count": len({str(row.get("category_name") or "").strip().lower() for row in token_summaries if str(row.get("category_name") or "").strip()}),
            "batch_count": len(session.get("batches", [])),
        }
        session["task_type"] = "clerk_shelving_task"
        session["clerk_shelving_task"] = {
            "entity_type": "clerk_shelving_task",
            "session_no": str(session.get("session_no") or "").strip().upper(),
            "bale_no": str(session.get("bale_no") or "").strip().upper(),
            "store_code": str(session.get("store_code") or "").strip().upper(),
            "assigned_employee": str(session.get("assigned_employee") or "").strip(),
            "status": str(session.get("status") or "").strip(),
            "token_count": session["analysis_summary"]["token_count"],
            "placed_count": session["analysis_summary"]["placed_count"],
            "pending_count": session["analysis_summary"]["pending_count"],
        }

    def start_store_token_receiving_session(self, payload: dict[str, Any]) -> dict[str, Any]:
        normalized_store_code = str(payload.get("store_code") or "").strip().upper()
        if not normalized_store_code:
            raise HTTPException(status_code=400, detail="Store code is required")
        actor = self._require_user_role(payload["started_by"], {"store_manager", "store_clerk", "area_supervisor"}, store_code=normalized_store_code)
        normalized_bale_no = str(payload.get("bale_no") or "").strip().upper()
        normalized_task_no = str(payload.get("task_no") or "").strip().upper()
        normalized_shipment_no = str(payload.get("shipment_no") or "").strip().upper()
        if not normalized_bale_no and not normalized_task_no and not normalized_shipment_no:
            raise HTTPException(status_code=400, detail="Please provide a dispatch bale, task no or shipment no")

        bale = None
        if normalized_bale_no:
            bale = self.get_store_dispatch_bale(normalized_bale_no)
            normalized_task_no = str(bale.get("task_no") or normalized_task_no).strip().upper()
            normalized_shipment_no = str(bale.get("shipment_no") or normalized_shipment_no).strip().upper()
            bale_store_code = str(bale.get("store_code") or "").strip().upper()
            if bale_store_code and bale_store_code != normalized_store_code:
                raise HTTPException(
                    status_code=409,
                    detail=f"Dispatch bale {normalized_bale_no} belongs to {bale_store_code}, not {normalized_store_code}",
                )
            self._enforce_store_clerk_assignment(actor, str(bale.get("assigned_employee") or "").strip(), f"门店配货 bale {normalized_bale_no}")
            if not str(bale.get("assigned_employee") or "").strip():
                raise HTTPException(status_code=409, detail="请先把当前 bale 分配给唯一店员，再开始上架会话")

        for session in self.store_token_receiving_sessions.values():
            if (
                str(session.get("store_code") or "").strip().upper() == normalized_store_code
                and str(session.get("bale_no") or "").strip().upper() == normalized_bale_no
                and str(session.get("task_no") or "").strip().upper() == normalized_task_no
                and str(session.get("shipment_no") or "").strip().upper() == normalized_shipment_no
                and str(session.get("status") or "").strip().lower() == "open"
            ):
                self._refresh_store_token_receiving_session_summary(session)
                return session

        if bale:
            token_rows = self.get_store_dispatch_bale_tokens(normalized_bale_no)
        else:
            token_rows = self.list_item_barcode_tokens(
                task_no=normalized_task_no or None,
                shipment_no=normalized_shipment_no or None,
            )
        token_rows = [
            row for row in token_rows
            if str(row.get("status") or "").strip().lower() == "printed_in_store"
        ]
        if not token_rows:
            raise HTTPException(status_code=400, detail="当前筛选下没有已打印待上架的商品 token")

        session_no = f"SRS-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{next(self._store_token_receiving_session_ids):03d}"
        session = {
            "session_no": session_no,
            "bale_no": normalized_bale_no,
            "task_no": normalized_task_no,
            "shipment_no": normalized_shipment_no,
            "store_code": normalized_store_code,
            "assigned_employee": str((bale or {}).get("assigned_employee") or (actor["username"] if self._is_store_clerk_actor(actor) else "")).strip(),
            "status": "open",
            "created_by": actor["username"],
            "created_at": now_iso(),
            "finalized_at": None,
            "finalized_by": None,
            "note": str(payload.get("note") or "").strip(),
            "token_nos": [str(row.get("token_no") or "").strip().upper() for row in token_rows],
            "token_summaries": [],
            "batches": [],
            "analysis_summary": {},
        }
        self._refresh_store_token_receiving_session_summary(session)
        self.store_token_receiving_sessions[session_no] = session
        self._log_event(
            event_type="store_token_receiving.started",
            entity_type="store_token_receiving_session",
            entity_id=session_no,
            actor=actor["username"],
            summary=f"Store token receiving session {session_no} started",
            details={
                "store_code": normalized_store_code,
                "bale_no": normalized_bale_no,
                "task_no": normalized_task_no,
                "shipment_no": normalized_shipment_no,
                "token_count": session["analysis_summary"].get("token_count", 0),
            },
        )
        self._persist()
        return session

    def get_store_token_placement_suggestion(self, session_no: str, token_no: str) -> dict[str, Any]:
        session = self.get_store_token_receiving_session(session_no)
        normalized_token_no = str(token_no or "").strip().upper()
        if normalized_token_no not in session.get("token_nos", []):
            raise HTTPException(status_code=404, detail=f"Token {normalized_token_no} is not part of session {session_no}")
        return self._build_item_token_placement_suggestion(session["store_code"], normalized_token_no)

    def add_store_token_receiving_batch(self, session_no: str, payload: dict[str, Any]) -> dict[str, Any]:
        session = self.get_store_token_receiving_session(session_no)
        actor = self._require_user_role(payload["recorded_by"], {"store_manager", "store_clerk", "area_supervisor"}, store_code=session["store_code"])
        self._enforce_store_clerk_assignment(actor, str(session.get("assigned_employee") or "").strip(), f"上架会话 {session_no}")
        if session["status"] != "open":
            raise HTTPException(status_code=400, detail="Store token receiving session is not open")

        normalized_token_no = str(payload.get("token_no") or "").strip().upper()
        if normalized_token_no not in session.get("token_nos", []):
            raise HTTPException(status_code=404, detail=f"Token {normalized_token_no} is not part of session {session_no}")
        if any(str(batch.get("token_no") or "").strip().upper() == normalized_token_no for batch in session.get("batches", [])):
            raise HTTPException(status_code=409, detail=f"Token {normalized_token_no} has already been placed in this session")

        rack_key = f"{session['store_code']}||{str(payload.get('rack_code') or '').strip().upper()}"
        if rack_key not in self.store_rack_locations:
            raise HTTPException(status_code=404, detail=f"Unknown rack {payload['rack_code']} for store {session['store_code']}")

        token = self.item_barcode_tokens.get(normalized_token_no)
        if not token:
            raise HTTPException(status_code=404, detail=f"Unknown item token {normalized_token_no}")
        product = self._ensure_item_token_product_exists(normalized_token_no, actor=actor["username"], rack_code=payload.get("rack_code", ""))
        suggestion = self._build_item_token_placement_suggestion(session["store_code"], normalized_token_no)
        batch = {
            "batch_id": next(self._store_token_receiving_batch_ids),
            "token_no": normalized_token_no,
            "category_name": str(token.get("category_name") or "").strip(),
            "grade": str(token.get("grade") or "").strip(),
            "rack_code": str(payload.get("rack_code") or "").strip().upper(),
            "previous_rack_code": suggestion["previous_rack_code"],
            "suggested_rack_codes": suggestion["suggested_rack_codes"],
            "created_by": actor["username"],
            "created_at": now_iso(),
            "note": str(payload.get("note") or "").strip(),
        }
        session["batches"].append(batch)
        self._add_store_lot(
            store_code=session["store_code"],
            barcode=product["barcode"],
            qty=1,
            unit_cost=round(float(token.get("unit_cost_kes") or product.get("cost_price") or 0.0), 2),
            source_type="item_token_in",
            source_no=normalized_token_no,
            store_rack_code=batch["rack_code"],
            note=f"Store token receiving session {session_no}",
        )
        self._record_inventory_movement(
            movement_type="store_token_in",
            barcode=product["barcode"],
            product_name=product["product_name"],
            quantity_delta=1,
            location_type="store",
            location_code=session["store_code"],
            reference_type="store_token_receiving_session",
            reference_no=session_no,
            actor=actor["username"],
            note=f"Token {normalized_token_no} shelved to {batch['rack_code']}",
            details={"token_no": normalized_token_no, "rack_code": batch["rack_code"]},
        )
        token["status"] = "shelved_in_store"
        token["store_code"] = session["store_code"]
        token["store_rack_code"] = batch["rack_code"]
        token["shelved_at"] = batch["created_at"]
        token["shelved_by"] = actor["username"]
        token["updated_at"] = batch["created_at"]
        self._refresh_store_token_receiving_session_summary(session)
        self._log_event(
            event_type="store_token_receiving.batch_recorded",
            entity_type="store_token_receiving_session",
            entity_id=session_no,
            actor=actor["username"],
            summary=f"Token {normalized_token_no} placed to rack {batch['rack_code']}",
            details={
                "token_no": normalized_token_no,
                "store_code": session["store_code"],
                "rack_code": batch["rack_code"],
            },
        )
        self._persist()
        return session

    def finalize_store_token_receiving_session(self, session_no: str, payload: dict[str, Any]) -> dict[str, Any]:
        session = self.get_store_token_receiving_session(session_no)
        actor = self._require_user_role(payload["finalized_by"], {"store_manager", "store_clerk", "area_supervisor"}, store_code=session["store_code"])
        self._enforce_store_clerk_assignment(actor, str(session.get("assigned_employee") or "").strip(), f"上架会话 {session_no}")
        if session["status"] != "open":
            raise HTTPException(status_code=400, detail="Store token receiving session is not open")

        self._refresh_store_token_receiving_session_summary(session)
        pending_count = int(session.get("analysis_summary", {}).get("pending_count") or 0)
        session["status"] = "finalized_complete" if pending_count == 0 else "finalized_partial"
        session["finalized_at"] = now_iso()
        session["finalized_by"] = actor["username"]
        if payload.get("note"):
            session["note"] = payload["note"]
        self._refresh_store_token_receiving_session_summary(session)
        self._log_event(
            event_type="store_token_receiving.finalized",
            entity_type="store_token_receiving_session",
            entity_id=session_no,
            actor=actor["username"],
            summary=f"Store token receiving session {session_no} finalized",
            details={
                "store_code": session["store_code"],
                "placed_count": session["analysis_summary"].get("placed_count", 0),
                "pending_count": session["analysis_summary"].get("pending_count", 0),
            },
        )
        self._persist()
        return session

    def list_sorting_stock(self) -> list[dict[str, Any]]:
        updated = False
        rows: list[dict[str, Any]] = []
        for key, row in list(self.sorting_stock.items()):
            normalized = self._hydrate_sorting_stock_costs(row)
            rows.append(normalized)
            if normalized != row:
                self.sorting_stock[key] = normalized
                updated = True
        if updated:
            self._persist()
        return sorted(rows, key=lambda row: (row["rack_code"], row["sku_code"]))

    def update_sorting_stock_rack(self, payload: dict[str, Any]) -> dict[str, Any]:
        actor = self._require_user_role(payload["updated_by"], {"warehouse_supervisor"})
        sku_code = payload["sku_code"].strip().upper()
        current_rack_code = payload["current_rack_code"].strip().upper()
        new_rack_code = payload["new_rack_code"].strip().upper()
        if current_rack_code == new_rack_code:
            raise HTTPException(status_code=400, detail="新货架位与当前货架位相同，无需修改。")

        current_key = f"{current_rack_code}||{sku_code}"
        current_row = self.sorting_stock.get(current_key)
        if not current_row:
            raise HTTPException(status_code=404, detail=f"未找到 {sku_code} 在货架位 {current_rack_code} 的分拣库存。")

        conflicting_rack_row = next(
            (
                stock_row
                for stock_row in self.sorting_stock.values()
                if str(stock_row.get("rack_code") or "").strip().upper() == new_rack_code
                and self._sorting_stock_profile_signature(stock_row) != self._sorting_stock_profile_signature(current_row)
            ),
            None,
        )
        if conflicting_rack_row:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"货架位 {new_rack_code} 已绑定 "
                    f"{conflicting_rack_row['category_name']} / {str(conflicting_rack_row.get('grade') or '').strip().upper()} / "
                    f"KES {round(float(conflicting_rack_row.get('default_cost_kes') or 0), 2):.2f}，当前模式不能混放。"
                ),
            )

        target_key = f"{new_rack_code}||{sku_code}"
        existing_target = self.sorting_stock.get(target_key)
        if existing_target and (
            self._sorting_stock_profile_signature(existing_target) != self._sorting_stock_profile_signature(current_row)
        ):
            raise HTTPException(status_code=409, detail=f"货架位 {new_rack_code} 已有其他类别库存，不能直接并入。")

        moved_qty = int(current_row["qty_on_hand"])
        current_row = self._hydrate_sorting_stock_costs(current_row)
        updated_at = now_iso()
        if existing_target:
            existing_target = self._hydrate_sorting_stock_costs(existing_target)
            merged_cost_layers = [
                *list(existing_target.get("cost_layers") or []),
                *list(current_row.get("cost_layers") or []),
            ]
            existing_target["qty_on_hand"] += moved_qty
            existing_total_cost_kes = (
                round(float(existing_target.get("total_cost_kes") or 0), 2)
                if existing_target.get("total_cost_kes") not in {None, ""}
                else None
            )
            moved_total_cost_kes = (
                round(float(current_row.get("total_cost_kes") or 0), 2)
                if current_row.get("total_cost_kes") not in {None, ""}
                else None
            )
            merged_total_cost_kes = (
                round(existing_total_cost_kes + moved_total_cost_kes, 2)
                if existing_total_cost_kes is not None and moved_total_cost_kes is not None
                else existing_total_cost_kes if moved_total_cost_kes is None else moved_total_cost_kes
            )
            existing_target["total_cost_kes"] = merged_total_cost_kes
            existing_target["unit_cost_kes"] = (
                round(merged_total_cost_kes / existing_target["qty_on_hand"], 2)
                if merged_total_cost_kes is not None and existing_target["qty_on_hand"] > 0
                else current_row.get("unit_cost_kes")
            )
            existing_target["cost_layers"] = merged_cost_layers
            existing_target["updated_at"] = updated_at
        else:
            self.sorting_stock[target_key] = {
                **current_row,
                "rack_code": new_rack_code,
                "updated_at": updated_at,
            }
        del self.sorting_stock[current_key]

        self._record_inventory_movement(
            movement_type="sorting_rack_transfer",
            barcode=sku_code,
            product_name=f"{current_row['category_name']} ({current_row['grade']})",
            quantity_delta=0,
            location_type="warehouse_sorting",
            location_code=new_rack_code,
            reference_type="sorting_stock",
            reference_no=sku_code,
            actor=actor["username"],
            note=payload.get("note", "") or f"Sorting stock moved from {current_rack_code} to {new_rack_code}",
            details={
                "category_name": current_row["category_name"],
                "grade": current_row["grade"],
                "previous_rack_code": current_rack_code,
                "new_rack_code": new_rack_code,
                "qty_on_hand": moved_qty,
            },
        )
        self._log_event(
            event_type="sorting_stock.rack_updated",
            entity_type="sorting_stock",
            entity_id=sku_code,
            actor=actor["username"],
            summary=f"Sorting stock {sku_code} moved from {current_rack_code} to {new_rack_code}",
            details={
                "sku_code": sku_code,
                "category_name": current_row["category_name"],
                "grade": current_row["grade"],
                "previous_rack_code": current_rack_code,
                "new_rack_code": new_rack_code,
                "qty_on_hand": moved_qty,
            },
        )
        self._persist()
        return {
            "sku_code": sku_code,
            "category_name": current_row["category_name"],
            "grade": current_row["grade"],
            "previous_rack_code": current_rack_code,
            "new_rack_code": new_rack_code,
            "qty_on_hand": moved_qty,
            "updated_at": updated_at,
        }

    def create_product(self, payload: dict[str, Any]) -> dict[str, Any]:
        actor = self._require_user_role(payload["created_by"], {"warehouse_clerk", "warehouse_supervisor"})
        supplier = self._ensure_supplier_exists(payload["supplier_name"], actor=actor["username"])
        payload["product_name"] = str(payload.get("product_name") or payload.get("category_sub") or payload.get("category_main") or "").strip()
        product_id = next(self._product_ids)
        product = {
            "id": product_id,
            "product_code": self._product_code_for_id(product_id),
            "barcode": "",
            "barcode_assigned_at": None,
            "barcode_assigned_by": "",
            "status": "active",
            **payload,
            "supplier_code": supplier["code"],
            "supplier_name": supplier["name"],
        }
        self.products[product_id] = product
        self._log_event(
            event_type="product.created",
            entity_type="product",
            entity_id=product["product_code"],
            actor=actor["username"],
            summary=f"Product {product['product_code']} created",
            details={"product_name": product["product_name"], "rack_code": product["rack_code"]},
        )
        self._persist()
        return product

    def list_products(self) -> list[dict[str, Any]]:
        return list(self.products.values())

    def get_product(self, product_id: int) -> dict[str, Any]:
        product = self.products.get(product_id)
        if not product:
            raise HTTPException(status_code=404, detail=f"Unknown product {product_id}")
        return product

    def assign_barcode_to_product(self, product_id: int, payload: dict[str, Any]) -> dict[str, Any]:
        actor = self._require_user_role(payload["assigned_by"], {"warehouse_clerk", "warehouse_supervisor"})
        product = self.get_product(product_id)
        if product.get("barcode"):
            raise HTTPException(
                status_code=409,
                detail=f"Product {product['product_code']} already has barcode {product['barcode']}",
            )

        requested = str(payload.get("barcode", "")).strip().upper()
        barcode = requested or self._default_barcode_for_id(product_id)
        if barcode in self.product_by_barcode:
            raise HTTPException(status_code=409, detail=f"Barcode {barcode} already exists")

        product["barcode"] = barcode
        product["barcode_assigned_at"] = now_iso()
        product["barcode_assigned_by"] = actor["username"]
        self.product_by_barcode[barcode] = product_id
        self._log_event(
            event_type="product.barcode_assigned",
            entity_type="product",
            entity_id=product["product_code"],
            actor=actor["username"],
            summary=f"Barcode {barcode} assigned to {product['product_code']}",
            details={"product_name": product["product_name"], "barcode": barcode},
        )
        self._persist()
        return product

    def _ensure_item_token_product_exists(self, token_no: str, actor: str, rack_code: str = "") -> dict[str, Any]:
        normalized_token_no = str(token_no or "").strip().upper()
        if not normalized_token_no:
            raise HTTPException(status_code=400, detail="Missing item token barcode")
        token = self.item_barcode_tokens.get(normalized_token_no)
        barcode_value = str((token or {}).get("barcode_value") or normalized_token_no).strip().upper()
        existing_product_id = self.product_by_barcode.get(barcode_value) or self.product_by_barcode.get(normalized_token_no)
        if existing_product_id is not None:
            product = self.products[existing_product_id]
            updated = False
            if rack_code and not str(product.get("rack_code") or "").strip():
                product["rack_code"] = str(rack_code).strip().upper()
                updated = True
            if token:
                if barcode_value and str(product.get("barcode") or "").strip().upper() != barcode_value:
                    old_barcode = str(product.get("barcode") or "").strip().upper()
                    if old_barcode and self.product_by_barcode.get(old_barcode) == existing_product_id:
                        del self.product_by_barcode[old_barcode]
                    product["barcode"] = barcode_value
                    self.product_by_barcode[barcode_value] = existing_product_id
                    updated = True
                preferred_price = token.get("selling_price_kes")
                if preferred_price is not None:
                    product["launch_price"] = round(float(preferred_price or 0.0), 2)
                    updated = True
                elif token.get("suggested_price_kes") is not None and not float(product.get("launch_price") or 0.0):
                    product["launch_price"] = round(float(token.get("suggested_price_kes") or 0.0), 2)
                    updated = True
                if str(token.get("store_rack_code") or "").strip():
                    product["rack_code"] = str(token.get("store_rack_code") or "").strip().upper()
                    updated = True
            if updated:
                product["updated_at"] = now_iso()
            return product

        if not token:
            raise HTTPException(status_code=404, detail=f"Unknown item token {normalized_token_no}")
        if not barcode_value:
            barcode_value = normalized_token_no

        category_name = str(token.get("category_name") or "").strip()
        category_main, _, category_sub = category_name.partition("/")
        category_main = category_main.strip() or "mixed"
        category_sub = category_sub.strip() or category_main
        grade = str(token.get("grade") or "").strip()
        supplier_names = []
        for bale_code in token.get("source_bale_barcodes", []) or []:
            bale_row = self.bale_barcodes.get(str(bale_code or "").strip().upper())
            supplier_name = str(bale_row.get("supplier_name") or "").strip() if bale_row else ""
            if supplier_name and supplier_name.lower() not in {name.lower() for name in supplier_names}:
                supplier_names.append(supplier_name)
        supplier_name = " / ".join(supplier_names[:2]) if supplier_names else "Sorting Token"
        supplier = self._ensure_supplier_exists(supplier_name, actor=actor)

        product_id = next(self._product_ids)
        product = {
            "id": product_id,
            "product_code": self._product_code_for_id(product_id),
            "barcode": barcode_value,
            "barcode_assigned_at": token.get("printed_at") or token.get("created_at") or now_iso(),
            "barcode_assigned_by": token.get("printed_by") or token.get("created_by") or actor,
            "status": "active",
            "product_name": f"{category_name} ({grade})".strip(" ()"),
            "category_main": category_main,
            "category_sub": category_sub,
            "supplier_code": supplier["code"],
            "supplier_name": supplier["name"],
            "cost_price": round(float(token.get("unit_cost_kes") or 0.0), 2),
            "launch_price": round(
                float(
                    token.get("selling_price_kes")
                    or token.get("suggested_price_kes")
                    or token.get("launch_price_kes")
                    or token.get("unit_cost_kes")
                    or 0.0
                ),
                2,
            ),
            "rack_code": str(rack_code or token.get("store_rack_code") or token.get("suggested_rack_code") or token.get("rack_code") or "").strip().upper(),
            "label_template_code": "apparel_40x30",
            "created_by": actor,
            "created_at": now_iso(),
        }
        self.products[product_id] = product
        self.product_by_barcode[barcode_value] = product_id
        self.product_by_barcode[normalized_token_no] = product_id
        self._log_event(
            event_type="product.created_from_item_token",
            entity_type="product",
            entity_id=product["product_code"],
            actor=actor,
            summary=f"Product {product['product_code']} created from token {normalized_token_no}",
            details={
                "barcode": normalized_token_no,
                "category_name": category_name,
                "grade": grade,
                "supplier_name": supplier["name"],
            },
        )
        return product

    def list_stores(self) -> list[dict[str, Any]]:
        return list(self.stores.values())

    def create_store(self, payload: dict[str, Any]) -> dict[str, Any]:
        actor = self._require_user_role(payload["created_by"], {"admin", "area_supervisor"})
        code = payload["code"].strip().upper()
        if code in self.stores:
            raise HTTPException(status_code=409, detail=f"Store {code} already exists")

        store = {
            "code": code,
            "name": payload["name"].strip(),
            "status": payload["status"],
            "address": (payload.get("address") or "").strip() or None,
            "latitude": payload.get("latitude"),
            "longitude": payload.get("longitude"),
            "google_maps_url": (payload.get("google_maps_url") or "").strip() or None,
            "catchment_area": (payload.get("catchment_area") or "").strip() or None,
            "manager_note": (payload.get("manager_note") or "").strip() or None,
            "created_at": now_iso(),
        }
        self.stores[code] = store
        self._log_event(
            event_type="store.created",
            entity_type="store",
            entity_id=code,
            actor=actor["username"],
            summary=f"Store {code} created",
            details=store,
        )
        self._persist()
        return store

    def recommend_store_site(self, payload: dict[str, Any]) -> dict[str, Any]:
        area_type = str(payload.get("area_type") or "mixed").strip().lower()
        footfall = int(payload.get("estimated_hourly_footfall") or 0)
        competitor_count = int(payload.get("competitor_count") or 0)
        frontage_score = int(payload.get("frontage_score") or 5)
        visibility_score = int(payload.get("visibility_score") or 5)
        access_score = int(payload.get("access_score") or 5)
        rent_pressure_score = int(payload.get("rent_pressure_score") or 5)

        area_bonus_map = {
            "market": 10,
            "transit": 8,
            "mixed": 6,
            "residential": 5,
            "office": 4,
            "isolated": 1,
        }
        footfall_score = min(35, round(footfall / 20))
        competition_penalty = min(16, competitor_count * 2)
        score = (
            footfall_score
            + frontage_score * 3
            + visibility_score * 2
            + access_score * 2
            + area_bonus_map.get(area_type, 4)
            - rent_pressure_score
            - competition_penalty
        )
        fit_score = max(1, min(100, score))

        if fit_score >= 70:
            decision = "建议优先考察"
            summary = "这个点位在人流、可见度和到达性上表现较强，值得优先安排实地考察。"
        elif fit_score >= 50:
            decision = "建议继续观察"
            summary = "这个点位具备一定潜力，但建议先补充更多街景、人流和租金数据再决定。"
        else:
            decision = "建议暂缓"
            summary = "这个点位当前综合分偏低，建议先不要立刻开店，除非租金和竞争情况明显改善。"

        reasons = [
            f"预估小时人流 {footfall} 人，折算基础人流分 {footfall_score}。",
            f"门头展示 {frontage_score}/10，可见度 {visibility_score}/10，进出便利 {access_score}/10。",
            f"周边竞争门店 {competitor_count} 家，竞争扣分 {competition_penalty}。",
            f"租金压力评分 {rent_pressure_score}/10，街区类型 {area_type}。",
        ]
        if payload.get("street_view_observation"):
            reasons.append(f"街景观察：{payload['street_view_observation']}")

        next_actions = [
            "安排至少两个时段到店外人工数人流：中午和傍晚高峰。",
            "核对 100 米范围内同类门店数量、租金和停车/步行可达性。",
            "如要正式判断，请接入 Google Maps / Street View / Places API 做二次验证。",
        ]

        recommendation_no = f"SITE-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{footfall:04d}-{competitor_count:02d}"
        return {
            "recommendation_no": recommendation_no,
            "store_name": payload["store_name"].strip(),
            "fit_score": fit_score,
            "decision": decision,
            "summary": summary,
            "reasons": reasons,
            "next_actions": next_actions,
            "google_maps_url": (payload.get("google_maps_url") or "").strip() or None,
            "address": payload["address"].strip(),
        }

    def create_price_rule(self, payload: dict[str, Any]) -> dict[str, Any]:
        actor = self._require_user_role(payload["created_by"], {"warehouse_supervisor", "admin", "area_supervisor"})
        target_type = payload["target_type"].strip().lower()
        target_value = payload["target_value"].strip()
        if target_type == "barcode":
            normalized_value = target_value.upper()
            self.get_product_by_barcode(normalized_value)
        elif target_type in {"category_main", "category_sub"}:
            normalized_value = target_value.lower()
        else:
            raise HTTPException(status_code=400, detail="Unsupported price rule target type")

        store_code = payload.get("store_code")
        normalized_store = None
        if store_code:
            normalized_store = self._ensure_store_exists(store_code)["code"]

        rule_id = next(self._price_rule_ids)
        rule_no = f"PRULE-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{rule_id:03d}"
        rule = {
            "id": rule_id,
            "rule_no": rule_no,
            "target_type": target_type,
            "target_value": normalized_value,
            "max_price": round(payload["max_price"], 2),
            "store_code": normalized_store,
            "status": "active",
            "created_at": now_iso(),
            "created_by": actor["username"],
            "note": payload.get("note", ""),
        }
        self.price_rules[rule_no] = rule
        self._log_event(
            event_type="pricing.rule_created",
            entity_type="price_rule",
            entity_id=rule_no,
            actor=actor["username"],
            summary=f"Price rule {rule_no} created",
            details={
                "target_type": target_type,
                "target_value": normalized_value,
                "store_code": normalized_store,
                "max_price": rule["max_price"],
            },
        )
        self._persist()
        return rule

    def list_price_rules(
        self,
        store_code: Optional[str] = None,
        status: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        rows = list(self.price_rules.values())
        if store_code:
            normalized_store = store_code.strip().upper()
            rows = [
                row
                for row in rows
                if row.get("store_code") in {None, "", normalized_store}
            ]
        if status:
            normalized_status = status.strip().lower()
            rows = [row for row in rows if row["status"].lower() == normalized_status]
        return sorted(rows, key=lambda row: row["created_at"], reverse=True)

    def _resolve_effective_price_rule(
        self,
        store_code: str,
        product: dict[str, Any],
    ) -> dict[str, Any]:
        normalized_store = store_code.strip().upper()
        candidates: list[tuple[int, dict[str, Any]]] = []
        for rule in self.price_rules.values():
            if rule.get("status") != "active":
                continue
            rule_store = rule.get("store_code")
            if rule_store and rule_store != normalized_store:
                continue
            target_type = rule.get("target_type")
            target_value = rule.get("target_value")
            score = 0
            if target_type == "barcode" and target_value == product["barcode"]:
                score = 300
            elif target_type == "category_sub" and target_value == product["category_sub"].lower():
                score = 200
            elif target_type == "category_main" and target_value == product["category_main"].lower():
                score = 100
            else:
                continue
            if rule_store == normalized_store:
                score += 10
            candidates.append((score, rule))

        best_rule = max(candidates, key=lambda item: item[0])[1] if candidates else None
        expected_price = round(product["launch_price"], 2)
        if best_rule:
            expected_price = round(min(expected_price, best_rule["max_price"]), 2)
        return {
            "expected_price": expected_price,
            "price_cap": round(best_rule["max_price"], 2) if best_rule else None,
            "rule_no": best_rule["rule_no"] if best_rule else "",
            "target_type": best_rule["target_type"] if best_rule else "",
            "target_value": best_rule["target_value"] if best_rule else "",
        }

    def _ensure_store_exists(self, store_code: str) -> dict[str, Any]:
        normalized = store_code.strip().upper()
        store = self.stores.get(normalized)
        if not store:
            raise HTTPException(status_code=404, detail=f"Unknown store {normalized}")
        return store

    def _get_user_by_username(self, username: str) -> dict[str, Any]:
        normalized = username.strip()
        for user in self.users.values():
            if user["username"] == normalized:
                return user
        raise HTTPException(status_code=404, detail=f"Unknown user {normalized}")

    def authenticate_user(self, username: str, password: str) -> dict[str, Any]:
        user = self._get_user_by_username(username)
        if not user.get("is_active", True):
            raise HTTPException(status_code=403, detail=f"Inactive user {username}")
        if not verify_password(password, user):
            raise HTTPException(status_code=401, detail="Invalid username or password")

        token = generate_session_token()
        session = {
            "token": token,
            "username": user["username"],
            "created_at": now_iso(),
        }
        self.auth_sessions[token] = session
        self._log_event(
            event_type="auth.login",
            entity_type="user",
            entity_id=user["username"],
            actor=user["username"],
            summary=f"User {user['username']} logged in",
            details={"role_code": user["role_code"]},
        )
        self._persist()
        return {
            "access_token": token,
            "token_type": "bearer",
            "user": self._public_user(user),
            "session_created_at": session["created_at"],
        }

    def get_authenticated_user(self, token: str) -> dict[str, Any]:
        session = self.auth_sessions.get(token)
        if not session:
            raise HTTPException(status_code=401, detail="Invalid or expired session")

        user = self._get_user_by_username(session["username"])
        if not user.get("is_active", True):
            raise HTTPException(status_code=403, detail=f"Inactive user {user['username']}")

        public_user = self._public_user(user)
        public_user["session_created_at"] = session["created_at"]
        return public_user

    def logout_user(self, token: str) -> None:
        session = self.auth_sessions.pop(token, None)
        if not session:
            raise HTTPException(status_code=401, detail="Invalid or expired session")
        self._log_event(
            event_type="auth.logout",
            entity_type="user",
            entity_id=session["username"],
            actor=session["username"],
            summary=f"User {session['username']} logged out",
            details={},
        )
        self._persist()

    def _require_user_role(
        self,
        username: str,
        allowed_roles: set[str],
        store_code: Optional[str] = None,
    ) -> dict[str, Any]:
        user = self._get_user_by_username(username)
        if not user.get("is_active", True):
            raise HTTPException(status_code=403, detail=f"Inactive user {username}")
        if user["role_code"] != "admin" and user["role_code"] not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail=f"User {username} does not have permission for this action",
            )
        if store_code and user.get("store_code") and user["store_code"] != store_code:
            raise HTTPException(
                status_code=403,
                detail=f"User {username} is not assigned to store {store_code}",
            )
        return user

    def get_product_by_barcode(self, barcode: str) -> dict[str, Any]:
        product_id = self.product_by_barcode.get(barcode.strip().upper())
        if product_id is None:
            raise HTTPException(status_code=404, detail=f"Unknown barcode {barcode}")
        return self.products[product_id]

    def create_goods_receipt(self, payload: dict[str, Any]) -> dict[str, Any]:
        actor = self._require_user_role(payload["created_by"], {"warehouse_clerk", "warehouse_supervisor"})
        supplier = self._ensure_supplier_exists(payload["supplier_name"], actor=actor["username"])
        receipt_items: list[dict[str, Any]] = []

        for item in payload["items"]:
            product = self.get_product_by_barcode(item["barcode"])
            cost_price = item["cost_price"] if item["cost_price"] is not None else product["cost_price"]
            lot = self._add_warehouse_lot(
                warehouse_code=payload["warehouse_code"],
                barcode=product["barcode"],
                qty=item["received_qty"],
                unit_cost=cost_price,
                source_type="goods_receipt",
                source_no=payload["receipt_no"],
                rack_code=product["rack_code"],
                note=f"Receipt from {supplier['name']}",
            )

            receipt_items.append(
                {
                    "barcode": product["barcode"],
                    "product_name": product["product_name"],
                    "received_qty": item["received_qty"],
                    "cost_price": cost_price,
                    "rack_code": product["rack_code"],
                    "lot_no": lot["lot_no"],
                }
            )

        receipt = {
            "id": next(self._receipt_ids),
            "status": "posted",
            "created_at": now_iso(),
            **payload,
            "supplier_code": supplier["code"],
            "supplier_name": supplier["name"],
            "items": receipt_items,
        }
        self.goods_receipts.append(receipt)
        for item in receipt_items:
            self._record_inventory_movement(
                movement_type="warehouse_receipt_in",
                barcode=item["barcode"],
                product_name=item["product_name"],
                quantity_delta=item["received_qty"],
                location_type="warehouse",
                location_code=payload["warehouse_code"],
                reference_type="goods_receipt",
                reference_no=receipt["receipt_no"],
                actor=actor["username"],
                note=f"Receipt from {supplier['name']}",
                details={"cost_price": item["cost_price"], "rack_code": item["rack_code"]},
            )
        self._log_event(
            event_type="warehouse.receipt_posted",
            entity_type="goods_receipt",
            entity_id=receipt["receipt_no"],
            actor=actor["username"],
            summary=f"Goods receipt {receipt['receipt_no']} posted",
            details={"warehouse_code": payload["warehouse_code"], "item_count": len(receipt_items)},
        )
        self._persist()
        return receipt

    def list_goods_receipts(self) -> list[dict[str, Any]]:
        return self.goods_receipts

    def get_goods_receipt(self, receipt_no: str) -> dict[str, Any]:
        normalized = receipt_no.strip()
        for receipt in self.goods_receipts:
            if receipt["receipt_no"] == normalized:
                return receipt
        raise HTTPException(status_code=404, detail=f"Unknown goods receipt {normalized}")

    def list_warehouse_stock(self) -> list[dict[str, Any]]:
        return list(self.warehouse_stock.values())

    def list_store_stock(self) -> list[dict[str, Any]]:
        return list(self.store_stock.values())

    def get_store_stock_lookup(self, store_code: str, barcode: str) -> dict[str, Any]:
        store = self._ensure_store_exists(store_code)
        resolved = self.resolve_barcode(barcode, context="pos")
        if resolved["barcode_type"] != "STORE_ITEM" or resolved.get("reject_reason"):
            raise HTTPException(status_code=400, detail=resolved.get("reject_reason") or f"{barcode} is not a store item barcode")
        product = self.get_product_by_barcode(barcode)
        canonical_barcode = str(product.get("barcode") or barcode).strip().upper()
        pricing = self._resolve_effective_price_rule(store["code"], product)
        stock_key = f"{store['code']}||{canonical_barcode}"
        store_row = self.store_stock.get(stock_key)
        qty_on_hand = store_row.get("qty_on_hand", 0) if store_row else 0
        store_rack_code = store_row.get("store_rack_code", "") if store_row else ""
        return {
            "store_code": store["code"],
            "barcode": canonical_barcode,
            "product_name": product["product_name"],
            "category_main": product["category_main"],
            "category_sub": product["category_sub"],
            "qty_on_hand": qty_on_hand,
            "launch_price": product["launch_price"],
            "expected_price": pricing["expected_price"],
            "price_cap": pricing["price_cap"],
            "price_rule_no": pricing["rule_no"],
            "cost_price": round(store_row.get("cost_price", product["cost_price"]), 2) if store_row else round(product["cost_price"], 2),
            "lot_count": store_row.get("lot_count", 0) if store_row else 0,
            "store_rack_code": store_rack_code,
        }

    def list_sales_transactions(self) -> list[dict[str, Any]]:
        return self.sales_transactions

    def get_sale_transaction(self, order_no: str) -> dict[str, Any]:
        normalized = order_no.strip()
        for row in self.sales_transactions:
            if row.get("order_no") == normalized:
                return row
        raise HTTPException(status_code=404, detail=f"Unknown sale {normalized}")

    def list_sale_void_requests(
        self,
        store_code: Optional[str] = None,
        status: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        rows = list(self.sale_void_requests.values())
        if store_code:
            normalized_store = store_code.strip().upper()
            rows = [row for row in rows if row.get("store_code", "").upper() == normalized_store]
        if status:
            normalized_status = status.strip().lower()
            rows = [row for row in rows if row.get("status", "").lower() == normalized_status]
        return sorted(rows, key=lambda row: row.get("requested_at", ""), reverse=True)

    def list_sale_refund_requests(
        self,
        store_code: Optional[str] = None,
        status: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        rows = list(self.sale_refund_requests.values())
        if store_code:
            normalized_store = store_code.strip().upper()
            rows = [row for row in rows if row.get("store_code", "").upper() == normalized_store]
        if status:
            normalized_status = status.strip().lower()
            rows = [row for row in rows if row.get("status", "").lower() == normalized_status]
        return sorted(rows, key=lambda row: row.get("requested_at", ""), reverse=True)

    def list_payment_anomalies(
        self,
        store_code: Optional[str] = None,
        status: Optional[str] = None,
        anomaly_type: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        rows = list(self.payment_anomalies.values())
        if store_code:
            normalized_store = store_code.strip().upper()
            rows = [row for row in rows if row.get("store_code", "").upper() == normalized_store]
        if status:
            normalized_status = status.strip().lower()
            rows = [row for row in rows if row.get("status", "").lower() == normalized_status]
        if anomaly_type:
            normalized_type = anomaly_type.strip().lower()
            rows = [row for row in rows if row.get("anomaly_type", "").lower() == normalized_type]
        return sorted(rows, key=lambda row: row.get("created_at", ""), reverse=True)

    def resolve_payment_anomaly(self, anomaly_no: str, payload: dict[str, Any]) -> dict[str, Any]:
        row = self.payment_anomalies.get(str(anomaly_no).strip().upper())
        if not row:
            raise HTTPException(status_code=404, detail=f"Unknown payment anomaly {anomaly_no}")
        actor = self._require_user_role(
            payload["resolved_by"],
            {"store_manager", "area_supervisor"},
            store_code=row["store_code"],
        )
        if row.get("status") == "resolved":
            return row
        action = str(payload.get("action", "")).strip().lower()
        if not action:
            raise HTTPException(status_code=400, detail="Missing anomaly resolution action")

        target_sale = None
        if row.get("order_no"):
            try:
                target_sale = self.get_sale_transaction(row["order_no"])
            except HTTPException:
                target_sale = None

        resolution_amount = round(float(payload.get("amount", 0.0) or 0.0), 2)
        resolution_reference = str(payload.get("reference") or row.get("reference") or "").strip().upper()
        resolution_customer_id = str(payload.get("customer_id") or row.get("customer_id") or "").strip()
        target_store_code = str(payload.get("store_code") or row.get("store_code") or "").strip().upper()
        resolution_payment_method = str(payload.get("payment_method") or row.get("payment_method") or "").strip().lower()
        target_order_no = str(payload.get("order_no") or row.get("order_no") or "").strip()

        if row.get("anomaly_type") == "underpaid":
            if action == "collect_balance":
                if not target_sale:
                    raise HTTPException(status_code=400, detail="Underpaid anomaly must be linked to a sale")
                if resolution_amount <= 0:
                    resolution_amount = round(
                        max(
                            float(target_sale.get("amount_due", 0.0) or 0.0),
                            abs(float(row.get("amount_difference", 0.0) or 0.0)),
                        ),
                        2,
                    )
                if resolution_amount <= 0:
                    raise HTTPException(status_code=400, detail="Nothing left to collect for this sale")
                self._append_sale_payment(
                    target_sale,
                    method=resolution_payment_method or "cash",
                    amount=resolution_amount,
                    reference=resolution_reference,
                    customer_id=resolution_customer_id,
                )
                self._recompute_sale_payment_metrics(target_sale)
            elif action == "approve_shortfall":
                if target_sale:
                    target_sale["payment_status"] = "short_paid_approved"
            else:
                raise HTTPException(status_code=400, detail=f"Unsupported underpaid resolution action: {action}")

        elif row.get("anomaly_type") in {"overpaid", "duplicate_payment", "mpesa_duplicate"}:
            if action in {"refund_overpayment", "store_credit_issued"}:
                if resolution_amount <= 0:
                    resolution_amount = round(
                        max(
                            float(target_sale.get("amount_overpaid", 0.0) or 0.0) if target_sale else 0.0,
                            abs(float(row.get("amount_difference", 0.0) or 0.0)),
                            float(row.get("amount_received", 0.0) or 0.0),
                        ),
                        2,
                    )
                if resolution_amount <= 0:
                    raise HTTPException(status_code=400, detail="Nothing left to refund or convert for this anomaly")
                if target_sale:
                    adjustment_method = (
                        "store_credit"
                        if action == "store_credit_issued"
                        else f"refund_{resolution_payment_method or 'cash'}"
                    )
                    self._append_sale_payment(
                        target_sale,
                        method=adjustment_method,
                        amount=-resolution_amount,
                        reference=resolution_reference,
                        customer_id=resolution_customer_id,
                    )
                    self._recompute_sale_payment_metrics(target_sale)
            elif action == "refund_pending":
                if target_sale:
                    target_sale["payment_status"] = "refund_pending"
            elif action == "mark_false_positive":
                if target_sale:
                    self._recompute_sale_payment_metrics(target_sale)
            else:
                raise HTTPException(status_code=400, detail=f"Unsupported payment resolution action: {action}")

        elif row.get("anomaly_type") == "mpesa_unmatched":
            linked_collection = self._find_mpesa_collection_by_receipt(resolution_reference or row.get("reference", ""))
            if action == "match_to_sale":
                if not target_order_no:
                    raise HTTPException(status_code=400, detail="Please choose the target sale order for this M-Pesa match")
                target_sale = self.get_sale_transaction(target_order_no)
                target_store_code = str(payload.get("store_code") or target_sale.get("store_code") or "").strip().upper()
                amount_to_apply = round(
                    float(
                        linked_collection.get("amount", 0.0) if linked_collection else payload.get("amount", row.get("amount_received", 0.0))
                    ),
                    2,
                )
                payment_reference = (
                    linked_collection.get("receipt_no", "") if linked_collection else resolution_reference
                ).strip().upper()
                if payment_reference and any(
                    str(payment.get("method", "")).strip().lower() == "mpesa"
                    and str(payment.get("reference", "")).strip().upper() == payment_reference
                    for payment in target_sale.get("payments", [])
                ):
                    raise HTTPException(status_code=400, detail="This M-Pesa receipt is already attached to the selected sale")
                self._append_sale_payment(
                    target_sale,
                    method="mpesa",
                    amount=amount_to_apply,
                    reference=payment_reference,
                    customer_id=resolution_customer_id or (linked_collection.get("customer_id", "") if linked_collection else ""),
                )
                self._recompute_sale_payment_metrics(target_sale)
                if linked_collection:
                    linked_collection["store_code"] = target_store_code or linked_collection.get("store_code", "")
                    linked_collection["match_status"] = "matched"
                    linked_collection["matched_order_no"] = target_sale["order_no"]
                    linked_collection["matched_shift_no"] = target_sale.get("shift_no", "")
                    linked_collection["matched_at"] = now_iso()
                row["corrected_order_no"] = target_sale["order_no"]
                row["corrected_store_code"] = target_store_code or target_sale["store_code"]
                row["linked_receipt_no"] = payment_reference
                resolution_amount = amount_to_apply
            elif action == "internal_store_transfer":
                if not target_store_code:
                    raise HTTPException(status_code=400, detail="Please choose the corrected store for this M-Pesa collection")
                self._ensure_store_exists(target_store_code)
                if linked_collection:
                    linked_collection["store_code"] = target_store_code
                    linked_collection["match_status"] = "internal_transfer"
                    linked_collection["matched_at"] = now_iso()
                row["corrected_store_code"] = target_store_code
                row["linked_receipt_no"] = linked_collection.get("receipt_no", "") if linked_collection else resolution_reference
            elif action == "external_follow_up":
                row["follow_up_status"] = "external_manual_follow_up"
                if linked_collection:
                    linked_collection["match_status"] = "follow_up"
                    linked_collection["matched_at"] = now_iso()
                    row["linked_receipt_no"] = linked_collection.get("receipt_no", "")
            else:
                raise HTTPException(status_code=400, detail=f"Unsupported M-Pesa resolution action: {action}")

        else:
            raise HTTPException(status_code=400, detail=f"Unsupported anomaly type {row.get('anomaly_type')}")

        row["status"] = "resolved"
        row["resolved_at"] = now_iso()
        row["resolved_by"] = actor["username"]
        row["resolution_note"] = str(payload.get("note", "")).strip()
        row["resolution_action"] = action
        row["resolution_amount"] = resolution_amount
        row["resolution_reference"] = resolution_reference
        if target_order_no:
            row["corrected_order_no"] = target_order_no
        if target_store_code:
            row["corrected_store_code"] = target_store_code
        if target_sale and action in {
            "collect_balance",
            "refund_overpayment",
            "store_credit_issued",
            "mark_false_positive",
            "match_to_sale",
        }:
            self._recompute_sale_payment_metrics(target_sale)
        if target_sale and action == "match_to_sale" and round(float(target_sale.get("amount_due", 0.0) or 0.0), 2) <= 0:
            for linked_anomaly_no in target_sale.get("payment_anomaly_nos", []):
                linked_row = self.payment_anomalies.get(linked_anomaly_no)
                if not linked_row or linked_row.get("anomaly_no") == row["anomaly_no"]:
                    continue
                if linked_row.get("status") != "open" or linked_row.get("anomaly_type") != "underpaid":
                    continue
                linked_row["status"] = "resolved"
                linked_row["resolved_at"] = now_iso()
                linked_row["resolved_by"] = actor["username"]
                linked_row["resolution_note"] = (
                    f"Auto-resolved after M-Pesa receipt {resolution_reference or row.get('reference', '')} "
                    "was matched to the sale."
                ).strip()
                linked_row["resolution_action"] = "auto_resolve_paid"
                linked_row["resolution_amount"] = round(
                    abs(float(linked_row.get("amount_difference", 0.0) or 0.0)),
                    2,
                )
                linked_row["resolution_reference"] = resolution_reference
                linked_row["corrected_order_no"] = target_sale["order_no"]
                linked_row["corrected_store_code"] = target_sale["store_code"]
            self._recompute_sale_payment_metrics(target_sale)
        self._log_event(
            event_type="payment.anomaly_resolved",
            entity_type="payment_anomaly",
            entity_id=row["anomaly_no"],
            actor=actor["username"],
            summary=f"Payment anomaly {row['anomaly_no']} resolved",
            details={
                "store_code": row["store_code"],
                "anomaly_type": row["anomaly_type"],
                "order_no": row.get("order_no", ""),
                "reference": row.get("reference", ""),
                "resolution_action": row.get("resolution_action", ""),
                "resolution_amount": row.get("resolution_amount", 0.0),
                "resolution_reference": row.get("resolution_reference", ""),
                "corrected_order_no": row.get("corrected_order_no", ""),
                "corrected_store_code": row.get("corrected_store_code", ""),
                "follow_up_status": row.get("follow_up_status", ""),
                "resolution_note": row["resolution_note"],
            },
        )
        self._persist()
        return row

    def _sale_item_remaining_return_allocations(self, sale_item: dict[str, Any]) -> list[dict[str, Any]]:
        returned_qty = int(sale_item.get("returned_qty", 0) or 0)
        _, remaining = self._allocations_for_quantity(sale_item.get("lot_allocations", []), returned_qty)
        return remaining

    def _update_sale_refund_status(self, sale: dict[str, Any], actor_username: str, reason: str = "") -> None:
        total_qty = sum(int(item.get("qty", 0) or 0) for item in sale.get("items", []))
        returned_qty = sum(int(item.get("returned_qty", 0) or 0) for item in sale.get("items", []))
        refund_amount_total = round(float(sale.get("refund_amount_total", 0.0) or 0.0), 2)
        payment_total = round(float(sale.get("payment_total", sale.get("total_amount", 0.0)) or 0.0), 2)

        if returned_qty <= 0 and refund_amount_total <= 0:
            sale["sale_status"] = "completed"
            if sale.get("payment_status") in {"partially_refunded", "refunded"}:
                sale["payment_status"] = "paid"
            sale["refund_no"] = ""
            sale["refunded_at"] = None
            sale["refunded_by"] = ""
            sale["refund_reason"] = ""
            return

        if returned_qty >= total_qty and total_qty > 0:
            sale["sale_status"] = "refunded"
        else:
            sale["sale_status"] = "partially_refunded"

        if refund_amount_total >= payment_total and payment_total > 0:
            sale["payment_status"] = "refunded"
        else:
            sale["payment_status"] = "partially_refunded"
        sale["refunded_at"] = now_iso()
        sale["refunded_by"] = actor_username
        if reason:
            sale["refund_reason"] = reason

    def create_sale_refund_request(self, order_no: str, payload: dict[str, Any]) -> dict[str, Any]:
        sale = self.get_sale_transaction(order_no)
        store = self._ensure_store_exists(sale["store_code"])
        actor = self._require_user_role(
            payload["requested_by"],
            {"cashier", "store_manager"},
            store_code=store["code"],
        )
        if sale.get("sale_status") == "voided":
            raise HTTPException(status_code=400, detail="Voided sale cannot create a refund request")

        items_payload = payload.get("items", [])
        if not items_payload:
            raise HTTPException(status_code=400, detail="Refund request requires at least one item")

        refund_shift_no = str(payload.get("shift_no", "")).strip()
        if refund_shift_no:
            shift = self.get_cashier_shift(refund_shift_no)
            if shift["store_code"] != store["code"]:
                raise HTTPException(status_code=400, detail=f"Shift {refund_shift_no} does not belong to store {store['code']}")
            if shift["status"] != "open":
                raise HTTPException(status_code=400, detail=f"Shift {refund_shift_no} is not open")

        sale_items_by_barcode = {str(item["barcode"]).strip().upper(): item for item in sale.get("items", [])}
        normalized_items: list[dict[str, Any]] = []
        refund_amount_total = 0.0
        refund_cost_total = 0.0
        refund_profit_reversal_total = 0.0

        for row in items_payload:
            barcode = str(row.get("barcode", "")).strip().upper()
            identity_id = self._resolve_identity_id_for_barcode(barcode)
            request_qty = int(row.get("qty", 0) or 0)
            if not barcode or request_qty <= 0:
                raise HTTPException(status_code=400, detail="Refund items require barcode and qty")
            product = self.get_product_by_barcode(barcode)
            canonical_barcode = str(product.get("barcode") or barcode).strip().upper()
            identity_id = self._resolve_identity_id_for_barcode(canonical_barcode)
            sale_item = sale_items_by_barcode.get(canonical_barcode)
            if not sale_item:
                raise HTTPException(status_code=400, detail=f"Sale {order_no} does not contain barcode {barcode}")
            pending_qty = sum(
                int(item.get("requested_qty", 0) or 0)
                for existing in self.sale_refund_requests.values()
                if existing.get("order_no") == sale["order_no"] and existing.get("status") == "pending_review"
                for item in existing.get("items", [])
                if str(item.get("barcode") or "").strip().upper() == canonical_barcode
            )
            refundable_qty = int(sale_item.get("qty", 0) or 0) - int(sale_item.get("returned_qty", 0) or 0) - pending_qty
            if refundable_qty <= 0:
                raise HTTPException(status_code=400, detail=f"Barcode {barcode} has already been fully refunded")
            if request_qty > refundable_qty:
                raise HTTPException(
                    status_code=400,
                    detail=f"Barcode {barcode} can refund at most {refundable_qty}, requested {request_qty}",
                )

            remaining_allocations = self._sale_item_remaining_return_allocations(sale_item)
            used_allocations, _ = self._allocations_for_quantity(remaining_allocations, request_qty)
            refund_amount = round(request_qty * float(sale_item.get("selling_price", 0.0) or 0.0), 2)
            refund_cost = round(sum(float(allocation.get("line_cost", 0.0) or 0.0) for allocation in used_allocations), 2)
            refund_profit_reversal = round(refund_amount - refund_cost, 2)
            normalized_items.append(
                {
                    "identity_id": identity_id,
                    "barcode": canonical_barcode,
                    "product_name": sale_item.get("product_name", ""),
                    "requested_qty": request_qty,
                    "refundable_qty": refundable_qty,
                    "refund_amount": refund_amount,
                    "refund_cost": refund_cost,
                    "refund_profit_reversal": refund_profit_reversal,
                    "note": str(row.get("note", "")).strip(),
                    "lot_allocations": used_allocations,
                }
            )
            refund_amount_total += refund_amount
            refund_cost_total += refund_cost
            refund_profit_reversal_total += refund_profit_reversal

        refund_no = f"RFND-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{next(self._sale_refund_request_ids):03d}"
        request_row = {
            "refund_no": refund_no,
            "order_no": sale["order_no"],
            "sale_id": sale["id"],
            "store_code": sale["store_code"],
            "original_shift_no": sale.get("shift_no", ""),
            "refund_shift_no": refund_shift_no,
            "cashier_name": sale.get("cashier_name", ""),
            "sale_status": sale.get("sale_status", "completed"),
            "payment_status": sale.get("payment_status", "paid"),
            "refund_method": str(payload.get("refund_method", "cash")).strip().lower() or "cash",
            "total_amount": sale.get("total_amount", 0.0),
            "total_profit": sale.get("total_profit", 0.0),
            "refund_amount_total": round(refund_amount_total, 2),
            "refund_cost_total": round(refund_cost_total, 2),
            "refund_profit_reversal_total": round(refund_profit_reversal_total, 2),
            "status": "pending_review",
            "reason": str(payload.get("reason", "")).strip(),
            "note": str(payload.get("note", "")).strip(),
            "requested_at": now_iso(),
            "requested_by": actor["username"],
            "reviewed_at": None,
            "reviewed_by": "",
            "review_note": "",
            "items": normalized_items,
        }
        self.sale_refund_requests[refund_no] = request_row
        sale["refund_request_count"] = int(sale.get("refund_request_count", 0) or 0) + 1
        self._log_event(
            event_type="sale.refund_requested",
            entity_type="sale_refund_request",
            entity_id=refund_no,
            actor=actor["username"],
            summary=f"Refund requested for sale {sale['order_no']}",
            details={
                "store_code": sale["store_code"],
                "refund_shift_no": refund_shift_no,
                "refund_amount_total": request_row["refund_amount_total"],
                "reason": request_row["reason"],
                "identity_ids": [item.get("identity_id", "") for item in normalized_items if item.get("identity_id")],
            },
        )
        self._persist()
        return request_row

    def review_sale_refund_request(self, refund_no: str, payload: dict[str, Any]) -> dict[str, Any]:
        row = self.sale_refund_requests.get(str(refund_no).strip().upper())
        if not row:
            raise HTTPException(status_code=404, detail=f"Unknown sale refund request {refund_no}")
        sale = self.get_sale_transaction(row["order_no"])
        store = self._ensure_store_exists(row["store_code"])
        actor = self._require_user_role(
            payload["reviewed_by"],
            {"store_manager", "area_supervisor"},
            store_code=store["code"],
        )
        if row.get("status") != "pending_review":
            return row

        row["reviewed_at"] = now_iso()
        row["reviewed_by"] = actor["username"]
        row["review_note"] = str(payload.get("note", "")).strip()

        if not payload.get("approved", True):
            row["status"] = "rejected"
            self._log_event(
                event_type="sale.refund_rejected",
                entity_type="sale_refund_request",
                entity_id=row["refund_no"],
                actor=actor["username"],
                summary=f"Refund request {row['refund_no']} rejected",
                details={"order_no": row["order_no"], "note": row["review_note"]},
            )
            self._persist()
            return row

        sale_items_by_barcode = {str(item["barcode"]).strip().upper(): item for item in sale.get("items", [])}
        for item in row.get("items", []):
            item_barcode = str(item.get("barcode") or "").strip().upper()
            sale_item = sale_items_by_barcode[item_barcode]
            stock_key = f"{store['code']}||{item['barcode']}"
            store_row = self.store_stock.get(stock_key, {})
            store_rack_code = store_row.get("store_rack_code", "") or self.store_rack_locations.get(stock_key, {}).get("rack_code", "")
            for allocation in item.get("lot_allocations", []):
                self._add_store_lot(
                    store_code=store["code"],
                    barcode=item["barcode"],
                    qty=allocation["qty"],
                    unit_cost=allocation["unit_cost"],
                    source_type="sale_return_in",
                    source_no=row["refund_no"],
                    store_rack_code=store_rack_code,
                    note=row.get("reason", "") or "customer refund return",
                )
            self._record_inventory_movement(
                movement_type="sale_return_in",
                barcode=item["barcode"],
                product_name=item["product_name"],
                quantity_delta=item["requested_qty"],
                location_type="store",
                location_code=store["code"],
                reference_type="sale_refund_request",
                reference_no=row["refund_no"],
                actor=actor["username"],
                note=row.get("reason", "") or "customer refund return",
                details={
                    "order_no": row["order_no"],
                    "lot_allocations": item.get("lot_allocations", []),
                    "identity_id": item.get("identity_id", ""),
                },
            )
            sale_item["returned_qty"] = int(sale_item.get("returned_qty", 0) or 0) + int(item["requested_qty"])
            sale_item["returned_amount_total"] = round(float(sale_item.get("returned_amount_total", 0.0) or 0.0) + float(item["refund_amount"]), 2)
            sale_item["returned_lot_allocations"] = sale_item.get("returned_lot_allocations", []) + item.get("lot_allocations", [])

        row["status"] = "approved"
        sale["refund_no"] = row["refund_no"]
        sale["refund_amount_total"] = round(float(sale.get("refund_amount_total", 0.0) or 0.0) + float(row["refund_amount_total"]), 2)
        sale["refund_qty_total"] = int(sale.get("refund_qty_total", 0) or 0) + sum(int(item["requested_qty"]) for item in row.get("items", []))
        self._update_sale_refund_status(sale, actor["username"], reason=row.get("reason", ""))

        self._log_event(
            event_type="sale.refund_approved",
            entity_type="sale_refund_request",
            entity_id=row["refund_no"],
            actor=actor["username"],
            summary=f"Refund request {row['refund_no']} approved",
            details={
                "order_no": row["order_no"],
                "refund_amount_total": row["refund_amount_total"],
                "refund_method": row.get("refund_method", "cash"),
                "note": row["review_note"],
                "identity_ids": [item.get("identity_id", "") for item in row.get("items", []) if item.get("identity_id")],
            },
        )
        self._persist()
        return row

    def create_sale_void_request(self, order_no: str, payload: dict[str, Any]) -> dict[str, Any]:
        sale = self.get_sale_transaction(order_no)
        store = self._ensure_store_exists(sale["store_code"])
        actor = self._require_user_role(
            payload["requested_by"],
            {"cashier", "store_manager"},
            store_code=store["code"],
        )
        if sale.get("sale_status") == "voided":
            raise HTTPException(status_code=400, detail=f"Sale {order_no} has already been voided")
        existing = next(
            (
                row
                for row in self.sale_void_requests.values()
                if row.get("order_no") == sale["order_no"] and row.get("status") == "pending_review"
            ),
            None,
        )
        if existing:
            return existing
        shift_no = sale.get("shift_no", "")
        if shift_no:
            shift = self.get_cashier_shift(shift_no)
            if shift.get("status") == "closed":
                raise HTTPException(status_code=400, detail="Shift already closed. Use return/refund flow instead of void.")

        void_no = f"VOID-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{next(self._sale_void_request_ids):03d}"
        row = {
            "void_no": void_no,
            "order_no": sale["order_no"],
            "sale_id": sale["id"],
            "store_code": sale["store_code"],
            "shift_no": sale.get("shift_no", ""),
            "cashier_name": sale.get("cashier_name", ""),
            "sale_status": sale.get("sale_status", "completed"),
            "payment_status": sale.get("payment_status", "paid"),
            "total_amount": sale.get("total_amount", 0.0),
            "total_profit": sale.get("total_profit", 0.0),
            "status": "pending_review",
            "reason": str(payload.get("reason", "")).strip(),
            "note": str(payload.get("note", "")).strip(),
            "requested_at": now_iso(),
            "requested_by": actor["username"],
            "reviewed_at": None,
            "reviewed_by": None,
            "review_note": "",
        }
        self.sale_void_requests[void_no] = row
        sale["void_request_count"] = int(sale.get("void_request_count", 0)) + 1
        self._log_event(
            event_type="sale.void_requested",
            entity_type="sale_void_request",
            entity_id=void_no,
            actor=actor["username"],
            summary=f"Void requested for sale {sale['order_no']}",
            details={
                "store_code": sale["store_code"],
                "shift_no": shift_no,
                "reason": row["reason"],
                "note": row["note"],
            },
        )
        self._persist()
        return row

    def review_sale_void_request(self, void_no: str, payload: dict[str, Any]) -> dict[str, Any]:
        row = self.sale_void_requests.get(str(void_no).strip().upper())
        if not row:
            raise HTTPException(status_code=404, detail=f"Unknown sale void request {void_no}")
        sale = self.get_sale_transaction(row["order_no"])
        store = self._ensure_store_exists(row["store_code"])
        actor = self._require_user_role(
            payload["reviewed_by"],
            {"store_manager", "area_supervisor"},
            store_code=store["code"],
        )
        if row.get("status") != "pending_review":
            return row
        shift_no = sale.get("shift_no", "")
        if shift_no:
            shift = self.get_cashier_shift(shift_no)
            if shift.get("status") == "closed":
                raise HTTPException(status_code=400, detail="Shift already closed. Use return/refund flow instead of void.")

        reviewed_at = now_iso()
        row["reviewed_at"] = reviewed_at
        row["reviewed_by"] = actor["username"]
        row["review_note"] = str(payload.get("note", "")).strip()

        if not payload.get("approved", True):
            row["status"] = "rejected"
            self._log_event(
                event_type="sale.void_rejected",
                entity_type="sale_void_request",
                entity_id=row["void_no"],
                actor=actor["username"],
                summary=f"Void request {row['void_no']} rejected",
                details={
                    "order_no": row["order_no"],
                    "store_code": row["store_code"],
                    "note": row["review_note"],
                },
            )
            self._persist()
            return row

        if sale.get("sale_status") == "voided":
            row["status"] = "approved"
            self._persist()
            return row

        for item in sale.get("items", []):
            stock_key = f"{store['code']}||{item['barcode']}"
            store_row = self.store_stock.get(stock_key, {})
            store_rack_code = store_row.get("store_rack_code", "")
            if not store_rack_code:
                store_rack_code = self.store_rack_locations.get(stock_key, {}).get("rack_code", "")
            for allocation in item.get("lot_allocations", []):
                self._add_store_lot(
                    store_code=store["code"],
                    barcode=item["barcode"],
                    qty=allocation["qty"],
                    unit_cost=allocation["unit_cost"],
                    source_type="sale_void_restore",
                    source_no=row["void_no"],
                    store_rack_code=store_rack_code,
                    note=f"Void restore from sale {sale['order_no']}",
                )
            self._record_inventory_movement(
                movement_type="sale_void_in",
                barcode=item["barcode"],
                product_name=item["product_name"],
                quantity_delta=item["qty"],
                location_type="store",
                location_code=store["code"],
                reference_type="sale_void",
                reference_no=row["void_no"],
                actor=actor["username"],
                note=f"Void sale {sale['order_no']} restored inventory",
                details={"order_no": sale["order_no"], "shift_no": shift_no},
            )

        for anomaly in self.payment_anomalies.values():
            if anomaly.get("order_no") != sale["order_no"] or anomaly.get("status") != "open":
                continue
            anomaly["status"] = "resolved"
            anomaly["resolved_at"] = reviewed_at
            anomaly["resolved_by"] = actor["username"]
            anomaly["resolution_note"] = f"Auto-resolved after void {row['void_no']}"

        sale["sale_status"] = "voided"
        sale["void_no"] = row["void_no"]
        sale["voided_at"] = reviewed_at
        sale["voided_by"] = actor["username"]
        sale["void_reason"] = row["reason"]
        sale["payment_status"] = "voided"
        row["status"] = "approved"
        self._log_event(
            event_type="sale.void_approved",
            entity_type="sale_void_request",
            entity_id=row["void_no"],
            actor=actor["username"],
            summary=f"Void request {row['void_no']} approved",
            details={
                "order_no": sale["order_no"],
                "store_code": sale["store_code"],
                "total_amount": sale.get("total_amount", 0.0),
                "review_note": row["review_note"],
            },
        )
        self._persist()
        return row

    def list_cashier_shifts(
        self,
        store_code: Optional[str] = None,
        status: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        rows = list(self.cashier_shifts.values())
        if store_code:
            normalized_store = store_code.strip().upper()
            rows = [row for row in rows if row["store_code"].upper() == normalized_store]
        if status:
            normalized_status = status.strip().lower()
            rows = [row for row in rows if row["status"].lower() == normalized_status]
        return sorted(rows, key=lambda row: row["opened_at"], reverse=True)

    def get_cashier_shift(self, shift_no: str) -> dict[str, Any]:
        shift = self.cashier_shifts.get(shift_no)
        if not shift:
            raise HTTPException(status_code=404, detail=f"Unknown cashier shift {shift_no}")
        return shift

    def _find_open_shift_for_cashier(self, store_code: str, cashier_name: str) -> Optional[dict[str, Any]]:
        normalized_store = store_code.strip().upper()
        for shift in self.cashier_shifts.values():
            if (
                shift["store_code"].upper() == normalized_store
                and shift["cashier_name"] == cashier_name
                and shift["status"] == "open"
            ):
                return shift
        return None

    def open_cashier_shift(self, payload: dict[str, Any]) -> dict[str, Any]:
        store = self._ensure_store_exists(payload["store_code"])
        actor = self._require_user_role(payload["opened_by"], {"cashier", "store_manager"}, store_code=store["code"])
        existing = self._find_open_shift_for_cashier(store["code"], actor["username"])
        if existing:
            return existing

        shift_no = f"SHIFT-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{next(self._cashier_shift_ids):03d}"
        shift = {
            "shift_no": shift_no,
            "store_code": store["code"],
            "cashier_name": actor["username"],
            "status": "open",
            "opened_at": now_iso(),
            "opened_by": actor["username"],
            "opening_float_cash": payload["opening_float_cash"],
            "closed_at": None,
            "closed_by": None,
            "closing_cash_counted": None,
            "cash_variance": None,
            "note": payload.get("note", ""),
        }
        self.cashier_shifts[shift_no] = shift
        self._log_event(
            event_type="pos.shift_opened",
            entity_type="cashier_shift",
            entity_id=shift_no,
            actor=actor["username"],
            summary=f"Cashier shift {shift_no} opened at {store['code']}",
            details={"opening_float_cash": payload["opening_float_cash"], "note": payload.get("note", "")},
        )
        self._persist()
        return shift

    def _build_shift_report(self, shift_no: str, report_type: str) -> dict[str, Any]:
        shift = self.get_cashier_shift(shift_no)
        sales = [
            row
            for row in self.sales_transactions
            if row.get("shift_no") == shift_no and row.get("sale_status", "completed") != "voided"
        ]
        payment_breakdown: dict[str, float] = defaultdict(float)
        mpesa_customer_ids: set[str] = set()
        mpesa_imported_total = 0.0
        mpesa_imported_count = 0
        mpesa_unmatched_count = 0
        total_sales = 0.0
        total_qty = 0
        total_profit = 0.0
        refund_total = 0.0
        refund_profit_reversal = 0.0
        refund_count = 0
        override_alert_count = 0
        offline_transaction_count = 0

        for sale in sales:
            total_sales += sale["total_amount"]
            total_qty += sale["total_qty"]
            total_profit += sale.get("total_profit", 0.0)
            override_alert_count += sale.get("override_alert_count", 0)
            if sale.get("power_mode") != "online":
                offline_transaction_count += 1
            for payment in sale.get("payments", []):
                payment_breakdown[payment["method"]] += payment["amount"]
                if payment["method"] == "mpesa" and payment.get("customer_id"):
                    mpesa_customer_ids.add(payment["customer_id"])

        approved_refunds = [
            row
            for row in self.sale_refund_requests.values()
            if row.get("refund_shift_no") == shift_no and row.get("status") == "approved"
        ]
        for refund in approved_refunds:
            refund_total += float(refund.get("refund_amount_total", 0.0) or 0.0)
            refund_profit_reversal += float(refund.get("refund_profit_reversal_total", 0.0) or 0.0)
            refund_count += 1

        opening_float = shift["opening_float_cash"]
        closing_cash_counted = shift.get("closing_cash_counted")
        cash_sales = payment_breakdown.get("cash", 0.0)
        cash_refunds = sum(
            float(row.get("refund_amount_total", 0.0) or 0.0)
            for row in approved_refunds
            if row.get("refund_method") == "cash"
        )
        for row in self.mpesa_collections:
            if row["store_code"].upper() != shift["store_code"].upper():
                continue
            if row.get("matched_shift_no") == shift_no:
                mpesa_imported_total += row["amount"]
                mpesa_imported_count += 1
                if row.get("customer_id"):
                    mpesa_customer_ids.add(row["customer_id"])
            elif row.get("match_status") == "unmatched":
                mpesa_unmatched_count += 1
        cash_variance = None
        if closing_cash_counted is not None:
            cash_variance = round(closing_cash_counted - (opening_float + cash_sales - cash_refunds), 2)

        return {
            "report_type": report_type,
            "shift_no": shift["shift_no"],
            "store_code": shift["store_code"],
            "cashier_name": shift["cashier_name"],
            "status": shift["status"],
            "opened_at": shift["opened_at"],
            "closed_at": shift.get("closed_at"),
            "opening_float_cash": shift["opening_float_cash"],
            "closing_cash_counted": closing_cash_counted,
            "cash_variance": cash_variance,
            "total_sales": round(total_sales - refund_total, 2),
            "refund_total": round(refund_total, 2),
            "total_qty": total_qty,
            "total_profit": round(total_profit - refund_profit_reversal, 2),
            "refund_profit_reversal": round(refund_profit_reversal, 2),
            "transaction_count": len(sales),
            "refund_count": refund_count,
            "override_alert_count": override_alert_count,
            "payment_breakdown": {key: round(value, 2) for key, value in sorted(payment_breakdown.items())},
            "offline_transaction_count": offline_transaction_count,
            "mpesa_customer_ids": sorted(mpesa_customer_ids),
            "mpesa_imported_total": round(mpesa_imported_total, 2),
            "mpesa_imported_count": mpesa_imported_count,
            "mpesa_unmatched_count": mpesa_unmatched_count,
        }

    def get_cashier_shift_report(self, shift_no: str, report_type: str) -> dict[str, Any]:
        return self._build_shift_report(shift_no, report_type)

    def list_cashier_handover_logs(
        self,
        store_code: Optional[str] = None,
        status: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        rows = list(self.cashier_handover_logs.values())
        if store_code:
            normalized_store = store_code.strip().upper()
            rows = [row for row in rows if row["store_code"].upper() == normalized_store]
        if status:
            normalized_status = status.strip().lower()
            rows = [row for row in rows if row["status"].lower() == normalized_status]
        return sorted(rows, key=lambda row: row["requested_at"], reverse=True)

    def get_cashier_handover_log(self, handover_no: str) -> dict[str, Any]:
        log = self.cashier_handover_logs.get(handover_no)
        if not log:
            raise HTTPException(status_code=404, detail=f"Unknown handover {handover_no}")
        return log

    def request_cashier_handover(self, shift_no: str, payload: dict[str, Any]) -> dict[str, Any]:
        shift = self.get_cashier_shift(shift_no)
        actor = self._require_user_role(payload["requested_by"], {"cashier", "store_manager"}, store_code=shift["store_code"])
        if shift["status"] != "open":
            raise HTTPException(status_code=400, detail="Only open shifts can request handover")

        report = self._build_shift_report(shift_no, "t_report")
        expected_cash = round(shift["opening_float_cash"] + report["payment_breakdown"].get("cash", 0.0), 2)
        closing_cash_counted = payload["closing_cash_counted"]
        cash_variance = round(closing_cash_counted - expected_cash, 2)
        handover_no = f"HANDOVER-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{next(self._cashier_handover_ids):03d}"
        log = {
            "handover_no": handover_no,
            "shift_no": shift_no,
            "store_code": shift["store_code"],
            "cashier_name": shift["cashier_name"],
            "requested_at": now_iso(),
            "requested_by": actor["username"],
            "closing_cash_counted": closing_cash_counted,
            "expected_cash": expected_cash,
            "cash_variance": cash_variance,
            "status": "pending_review",
            "note": payload.get("note", ""),
            "reviewed_at": None,
            "reviewed_by": None,
            "review_note": "",
        }
        self.cashier_handover_logs[handover_no] = log
        shift["status"] = "handover_pending"
        shift["handover_status"] = "pending_review"
        shift["handover_requested_at"] = log["requested_at"]
        shift["handover_requested_by"] = actor["username"]
        shift["closing_cash_counted"] = closing_cash_counted
        shift["cash_variance"] = cash_variance
        self._log_event(
            event_type="pos.handover_requested",
            entity_type="cashier_handover",
            entity_id=handover_no,
            actor=actor["username"],
            summary=f"Handover requested for {shift_no}",
            details={"cash_variance": cash_variance, "expected_cash": expected_cash},
        )
        self._persist()
        return log

    def review_cashier_handover(self, handover_no: str, payload: dict[str, Any]) -> dict[str, Any]:
        log = self.get_cashier_handover_log(handover_no)
        shift = self.get_cashier_shift(log["shift_no"])
        actor = self._require_user_role(payload["reviewed_by"], {"store_manager", "area_supervisor"}, store_code=shift["store_code"])
        if log["status"] != "pending_review":
            raise HTTPException(status_code=400, detail="Handover is not pending review")

        reviewed_at = now_iso()
        log["reviewed_at"] = reviewed_at
        log["reviewed_by"] = actor["username"]
        log["review_note"] = payload.get("note", "")

        shift["handover_reviewed_at"] = reviewed_at
        shift["handover_reviewed_by"] = actor["username"]

        if payload["approved"]:
            log["status"] = "approved"
            shift["handover_status"] = "approved"
            shift["status"] = "closed"
            shift["closed_at"] = reviewed_at
            shift["closed_by"] = actor["username"]
            self._log_event(
                event_type="pos.handover_approved",
                entity_type="cashier_handover",
                entity_id=handover_no,
                actor=actor["username"],
                summary=f"Handover {handover_no} approved and shift closed",
                details={"shift_no": shift["shift_no"], "cash_variance": log["cash_variance"]},
            )
        else:
            log["status"] = "rejected"
            shift["handover_status"] = "rejected"
            shift["status"] = "open"
            self._log_event(
                event_type="pos.handover_rejected",
                entity_type="cashier_handover",
                entity_id=handover_no,
                actor=actor["username"],
                summary=f"Handover {handover_no} rejected",
                details={"shift_no": shift["shift_no"], "note": payload.get("note", "")},
            )

        self._persist()
        return log

    def close_cashier_shift(self, shift_no: str, payload: dict[str, Any]) -> dict[str, Any]:
        shift = self.get_cashier_shift(shift_no)
        actor = self._require_user_role(payload["closed_by"], {"cashier", "store_manager"}, store_code=shift["store_code"])
        if shift["status"] != "open":
            raise HTTPException(status_code=400, detail="Cashier shift is not open")

        report = self._build_shift_report(shift_no, "z_report")
        shift["status"] = "closed"
        shift["closed_at"] = now_iso()
        shift["closed_by"] = actor["username"]
        shift["closing_cash_counted"] = payload["closing_cash_counted"]
        shift["cash_variance"] = round(
            payload["closing_cash_counted"] - (shift["opening_float_cash"] + report["payment_breakdown"].get("cash", 0.0)),
            2,
        )
        if payload.get("note"):
            shift["note"] = payload["note"]
        self._log_event(
            event_type="pos.shift_closed",
            entity_type="cashier_shift",
            entity_id=shift_no,
            actor=actor["username"],
            summary=f"Cashier shift {shift_no} closed at {shift['store_code']}",
            details={"closing_cash_counted": payload["closing_cash_counted"], "cash_variance": shift["cash_variance"]},
        )
        self._persist()
        return shift

    def _pick_store_simulation_sales_actor(
        self,
        store_code: str,
        requested_by: str,
        preferred_cashier_name: str = "",
    ) -> str:
        normalized_store = str(store_code or "").strip().upper()
        preferred_names = [
            str(preferred_cashier_name or "").strip(),
            str(requested_by or "").strip(),
        ]
        for username in preferred_names:
            if not username:
                continue
            try:
                user = self._get_user_by_username(username)
            except HTTPException:
                continue
            if (
                user.get("is_active", True)
                and user.get("role_code") in {"cashier", "store_manager"}
                and str(user.get("store_code") or "").strip().upper() == normalized_store
            ):
                return user["username"]

        candidates = [
            user
            for user in self.users.values()
            if user.get("is_active", True)
            and user.get("role_code") in {"cashier", "store_manager"}
            and str(user.get("store_code") or "").strip().upper() == normalized_store
        ]
        candidates.sort(key=lambda user: (0 if user.get("role_code") == "cashier" else 1, str(user.get("username") or "").lower()))
        if not candidates:
            raise HTTPException(status_code=400, detail=f"Store {normalized_store} has no cashier or store manager available for simulated sales")
        return str(candidates[0]["username"])

    def _list_available_store_retail_seed_tokens(self) -> list[dict[str, Any]]:
        allowed_statuses = {"pending_store_print", "packed_waiting_store_dispatch"}
        rows: list[dict[str, Any]] = []
        for token in self.item_barcode_tokens.values():
            token_no = str(token.get("token_no") or "").strip().upper()
            if not token_no:
                continue
            if str(token.get("store_code") or "").strip().upper():
                continue
            if str(token.get("status") or "").strip().lower() not in allowed_statuses:
                continue
            rows.append(token)
        rows.sort(key=lambda row: (str(row.get("created_at") or ""), str(row.get("token_no") or "")))
        return rows

    def _pick_store_retail_seed_tokens(
        self,
        store_code: str,
        available_tokens: list[dict[str, Any]],
        max_items: int,
    ) -> list[dict[str, Any]]:
        if len(available_tokens) <= max_items:
            return list(available_tokens)

        rng = random.Random(f"retail-seed::{store_code}::{len(available_tokens)}::{max_items}")
        grouped_tokens: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
        for token in available_tokens:
            category_name = str(token.get("category_name") or "").strip()
            category_main, _, category_sub = category_name.partition("/")
            grouped_tokens[
                (
                    category_main.strip().lower() or "mixed",
                    category_sub.strip().lower() or category_main.strip().lower() or "mixed",
                )
            ].append(token)

        group_keys = list(grouped_tokens.keys())
        rng.shuffle(group_keys)
        for key in group_keys:
            rng.shuffle(grouped_tokens[key])

        selected: list[dict[str, Any]] = []
        while len(selected) < max_items and group_keys:
            next_round: list[tuple[str, str]] = []
            for key in group_keys:
                bucket = grouped_tokens[key]
                if bucket and len(selected) < max_items:
                    selected.append(bucket.pop())
                if bucket:
                    next_round.append(key)
            group_keys = next_round
            rng.shuffle(group_keys)
        return selected

    def _pick_store_retail_seed_rack_code(
        self,
        store_code: str,
        token: dict[str, Any],
        fallback_rack_pool: list[str],
        rack_cursor: int,
    ) -> tuple[str, int]:
        suggested_rack_code = str(token.get("store_rack_code") or "").strip().upper()
        suggestion = self._build_item_token_placement_suggestion(store_code, str(token.get("token_no") or ""))
        suggested_codes = [
            str(code or "").strip().upper()
            for code in suggestion.get("suggested_rack_codes", []) or []
            if str(code or "").strip()
        ]
        preferred_pool = []
        for code in [suggested_rack_code, *suggested_codes]:
            if code and code not in preferred_pool:
                preferred_pool.append(code)

        if preferred_pool:
            chosen_rack_code = preferred_pool[rack_cursor % len(preferred_pool)]
        elif fallback_rack_pool:
            chosen_rack_code = fallback_rack_pool[rack_cursor % len(fallback_rack_pool)]
        else:
            chosen_rack_code = ""
        return chosen_rack_code, rack_cursor + 1

    def _derive_store_retail_seed_price(
        self,
        token: dict[str, Any],
        product_launch_price: float,
        unit_cost: float,
    ) -> float:
        token_no = str(token.get("token_no") or "").strip().upper()
        rng = random.Random(f"retail-seed-price::{token_no}")
        base_price = float(
            token.get("selling_price_kes")
            or token.get("suggested_price_kes")
            or product_launch_price
            or 0.0
        )
        category_name = str(token.get("category_name") or "").strip().lower()
        grade = str(token.get("grade") or "").strip().upper()

        if "jacket" in category_name or "shoes" in category_name:
            multiplier = rng.uniform(1.05, 1.22)
        elif "dress" in category_name:
            multiplier = rng.uniform(0.98, 1.18)
        elif "pants" in category_name:
            multiplier = rng.uniform(0.95, 1.14)
        else:
            multiplier = rng.uniform(0.9, 1.12)

        if grade == "P":
            multiplier += 0.04
        elif grade == "S":
            multiplier -= 0.02

        raw_price = base_price * multiplier if base_price > 0 else 0.0
        floor_price = max(unit_cost * 1.18, 45.0)
        rounded_price = round(max(raw_price, floor_price))
        return round(float(rounded_price), 2)

    def seed_store_retail_samples(self, payload: dict[str, Any]) -> dict[str, Any]:
        store = self._ensure_store_exists(payload["store_code"])
        actor = self._require_user_role(
            payload["seeded_by"],
            {"store_manager", "area_supervisor", "admin"},
            store_code=store["code"],
        )
        max_items = max(int(payload.get("max_items", 24) or 24), 1)
        note = str(payload.get("note") or "").strip() or "Store retail demo seed"
        requested_identity_ids = {
            str(value or "").strip().upper()
            for value in payload.get("identity_ids", []) or []
            if str(value or "").strip()
        }
        initial_qty_on_hand = sum(
            int(row.get("qty_on_hand") or 0)
            for row in self.store_stock.values()
            if str(row.get("store_code") or "").strip().upper() == store["code"]
        )
        available_tokens = self._list_available_store_retail_seed_tokens()
        if requested_identity_ids:
            available_tokens = [
                row
                for row in available_tokens
                if str(row.get("identity_no") or row.get("token_no") or "").strip().upper() in requested_identity_ids
            ]
        if not available_tokens:
            raise HTTPException(status_code=400, detail="当前没有可用于门店零售演练的仓库 token。请先完成分拣确认入库，或检查待送店 token 是否存在。")

        seeded_at = now_iso()
        source_statuses = sorted({str(row.get("status") or "").strip().lower() for row in available_tokens if str(row.get("status") or "").strip()})
        seeded_items: list[dict[str, Any]] = []
        selected_tokens = self._pick_store_retail_seed_tokens(store["code"], available_tokens, max_items)
        rack_pool = [
            str(row.get("rack_code") or "").strip().upper()
            for row in self.list_store_racks(store["code"])
            if str(row.get("rack_code") or "").strip()
        ]
        rack_rng = random.Random(f"retail-seed-rack::{store['code']}::{len(selected_tokens)}")
        rack_rng.shuffle(rack_pool)
        rack_cursor = 0

        for token in selected_tokens:
            token_no = str(token.get("token_no") or "").strip().upper()
            if not token_no:
                continue
            category_name = str(token.get("category_name") or "").strip()
            category_main, _, category_sub = category_name.partition("/")
            category_main = category_main.strip() or "mixed"
            category_sub = category_sub.strip() or category_main
            unit_cost = round(float(token.get("unit_cost_kes") or 0.0), 2)
            rack_code, rack_cursor = self._pick_store_retail_seed_rack_code(
                store["code"],
                token,
                rack_pool,
                rack_cursor,
            )

            token["store_rack_code"] = rack_code
            token["selling_price_kes"] = self._derive_store_retail_seed_price(
                token,
                float(token.get("launch_price_kes") or token.get("suggested_price_kes") or 0.0),
                unit_cost,
            )
            product = self._ensure_item_token_product_exists(token_no, actor=actor["username"], rack_code=rack_code)
            selling_price = round(float(token.get("selling_price_kes") or product.get("launch_price") or 0.0), 2)
            if not rack_code:
                rack_code = str(product.get("rack_code") or "").strip().upper()
            if not unit_cost:
                unit_cost = round(float(product.get("cost_price") or 0.0), 2)

            self._add_store_lot(
                store_code=store["code"],
                barcode=product["barcode"],
                qty=1,
                unit_cost=unit_cost,
                source_type="store_retail_demo_seed",
                source_no=token_no,
                store_rack_code=rack_code,
                note=note,
            )
            self._record_inventory_movement(
                movement_type="store_retail_demo_seed_in",
                barcode=product["barcode"],
                product_name=product["product_name"],
                quantity_delta=1,
                location_type="store",
                location_code=store["code"],
                reference_type="store_retail_demo_seed",
                reference_no=token_no,
                actor=actor["username"],
                note=note,
                details={"identity_id": str(token.get("identity_no") or token_no).strip().upper(), "rack_code": rack_code},
            )

            token["store_code"] = store["code"]
            token.setdefault("identity_no", token_no)
            token["selling_price_kes"] = selling_price
            token["store_rack_code"] = rack_code
            token["printed_at"] = token.get("printed_at") or seeded_at
            token["printed_by"] = token.get("printed_by") or actor["username"]
            token["shelved_at"] = seeded_at
            token["shelved_by"] = actor["username"]
            token["updated_at"] = seeded_at
            token["status"] = "shelved_in_store"
            token["final_item_barcode"] = {
                "barcode_value": product["barcode"],
                "identity_id": str(token.get("identity_no") or token_no).strip().upper(),
                "printed_at": token["printed_at"],
            }

            seeded_items.append(
                {
                    "identity_id": str(token.get("identity_no") or token_no).strip().upper(),
                    "barcode": product["barcode"],
                    "product_name": product["product_name"],
                    "category_main": category_main,
                    "category_sub": category_sub,
                    "store_code": store["code"],
                    "store_rack_code": rack_code,
                    "selling_price": selling_price,
                    "unit_cost": unit_cost,
                    "seeded_at": seeded_at,
                }
            )

        current_qty_on_hand = sum(
            int(row.get("qty_on_hand") or 0)
            for row in self.store_stock.values()
            if str(row.get("store_code") or "").strip().upper() == store["code"]
        )
        remaining_available_token_count = max(len(available_tokens) - len(seeded_items), 0)
        self._log_event(
            event_type="store.retail_demo_seeded",
            entity_type="store",
            entity_id=store["code"],
            actor=actor["username"],
            summary=f"Store retail demo seed created for {store['code']}",
            details={
                "generated_count": len(seeded_items),
                "initial_qty_on_hand": initial_qty_on_hand,
                "current_qty_on_hand": current_qty_on_hand,
                "note": note,
            },
        )
        self._persist()
        return {
            "store_code": store["code"],
            "seeded_by": actor["username"],
            "generated_count": len(seeded_items),
            "initial_qty_on_hand": initial_qty_on_hand,
            "current_qty_on_hand": current_qty_on_hand,
            "remaining_available_token_count": remaining_available_token_count,
            "source_statuses": source_statuses,
            "items": seeded_items,
        }

    def generate_recent_store_sales(self, payload: dict[str, Any]) -> dict[str, Any]:
        store = self._ensure_store_exists(payload["store_code"])
        actor = self._require_user_role(
            payload["generated_by"],
            {"store_manager", "area_supervisor"},
            store_code=store["code"],
        )
        days = min(max(int(payload.get("days", 14) or 14), 1), 14)
        max_items = max(int(payload.get("max_items", 14) or 14), 1)
        requested_identity_ids = {
            str(value or "").strip().upper()
            for value in payload.get("identity_ids", []) or []
            if str(value or "").strip()
        }
        simulation_cashier = self._pick_store_simulation_sales_actor(
            store["code"],
            requested_by=actor["username"],
            preferred_cashier_name=str(payload.get("cashier_name") or "").strip(),
        )
        shift = self._find_open_shift_for_cashier(store["code"], simulation_cashier)
        created_shift = False
        if not shift:
            shift = self.open_cashier_shift(
                {
                    "opened_by": simulation_cashier,
                    "store_code": store["code"],
                    "opening_float_cash": 0.0,
                    "note": str(payload.get("note") or "").strip() or f"{days} day simulated sales seed",
                }
            )
            created_shift = True

        initial_qty_on_hand = sum(
            int(row.get("qty_on_hand") or 0)
            for row in self.store_stock.values()
            if str(row.get("store_code") or "").strip().upper() == store["code"]
        )
        eligible_items: list[dict[str, Any]] = []
        for token in self.item_barcode_tokens.values():
            if str(token.get("store_code") or "").strip().upper() != store["code"]:
                continue
            barcode = str(token.get("barcode_value") or token.get("token_no") or "").strip().upper()
            if not barcode:
                continue
            identity_id = self._resolve_identity_id_for_barcode(barcode)
            if requested_identity_ids and identity_id not in requested_identity_ids:
                continue
            product = self.get_product_by_barcode(barcode)
            canonical_barcode = str(product.get("barcode") or barcode).strip().upper()
            stock_key = f"{store['code']}||{canonical_barcode}"
            qty_on_hand = int(self.store_stock.get(stock_key, {}).get("qty_on_hand", 0) or 0)
            if qty_on_hand <= 0:
                continue
            selling_price = round(
                float(
                    token.get("selling_price_kes")
                    or token.get("suggested_price_kes")
                    or product.get("launch_price")
                    or 0.0
                ),
                2,
            )
            if selling_price <= 0:
                continue
            eligible_items.append(
                {
                    "identity_id": identity_id,
                    "barcode": canonical_barcode,
                    "selling_price": selling_price,
                    "shelved_at": str(token.get("shelved_at") or token.get("printed_at") or token.get("created_at") or ""),
                }
            )

        eligible_items = sorted(
            eligible_items,
            key=lambda row: (row["shelved_at"], row["identity_id"]),
        )[:max_items]
        if not eligible_items:
            raise HTTPException(status_code=400, detail=f"Store {store['code']} has no in-store identities available for recent sales simulation")

        now_utc = datetime.now(timezone.utc)
        generated_sales: list[dict[str, Any]] = []
        for index, item in enumerate(eligible_items):
            days_ago = index % days
            sold_at_dt = (now_utc - timedelta(days=days_ago)).replace(
                hour=10 + (index % 8),
                minute=(index * 7) % 60,
                second=0,
                microsecond=0,
            )
            order_no = f"SIMSALE-{store['code']}-{now_utc.strftime('%Y%m%d%H%M%S')}-{index + 1:03d}"
            sale = self.create_sale_transaction(
                {
                    "order_no": order_no,
                    "store_code": store["code"],
                    "cashier_name": simulation_cashier,
                    "shift_no": shift["shift_no"],
                    "sold_at": sold_at_dt.isoformat(),
                    "power_mode": "simulation_14d",
                    "note": str(payload.get("note") or "").strip() or "14 day simulated sales seed",
                    "items": [
                        {
                            "barcode": item["barcode"],
                            "qty": 1,
                            "selling_price": item["selling_price"],
                        }
                    ],
                    "payments": [{"method": "cash", "amount": item["selling_price"]}],
                }
            )
            generated_sales.append(
                {
                    "identity_id": item["identity_id"],
                    "barcode": item["barcode"],
                    "order_no": sale["order_no"],
                    "store_code": store["code"],
                    "shift_no": shift["shift_no"],
                    "cashier_name": simulation_cashier,
                    "days_ago": days_ago,
                    "sold_at": sale["sold_at"],
                    "selling_price": item["selling_price"],
                }
            )

        if created_shift:
            closing_cash_counted = round(sum(row["selling_price"] for row in generated_sales), 2)
            self.close_cashier_shift(
                shift["shift_no"],
                {
                    "closed_by": simulation_cashier,
                    "closing_cash_counted": closing_cash_counted,
                    "note": str(payload.get("note") or "").strip() or "Close simulated 14 day sales shift",
                },
            )
            shift_row = self.get_cashier_shift(shift["shift_no"])
            earliest_sold_at = min(row["sold_at"] for row in generated_sales)
            latest_sold_at = max(row["sold_at"] for row in generated_sales)
            shift_row["opened_at"] = earliest_sold_at
            shift_row["closed_at"] = latest_sold_at

        remaining_qty_on_hand = sum(
            int(row.get("qty_on_hand") or 0)
            for row in self.store_stock.values()
            if str(row.get("store_code") or "").strip().upper() == store["code"]
        )
        result = {
            "store_code": store["code"],
            "days": days,
            "max_items": max_items,
            "generated_by": actor["username"],
            "sales_actor": simulation_cashier,
            "shift_no": shift["shift_no"],
            "generated_count": len(generated_sales),
            "total_qty": len(generated_sales),
            "total_amount": round(sum(row["selling_price"] for row in generated_sales), 2),
            "initial_qty_on_hand": initial_qty_on_hand,
            "remaining_qty_on_hand": remaining_qty_on_hand,
            "consumed_qty": initial_qty_on_hand - remaining_qty_on_hand,
            "sales": generated_sales,
        }
        self._log_event(
            event_type="sale.simulated_14d_generated",
            entity_type="store",
            entity_id=store["code"],
            actor=actor["username"],
            summary=f"Generated {len(generated_sales)} recent simulated sales for {store['code']}",
            details={
                "days": days,
                "shift_no": shift["shift_no"],
                "sales_actor": simulation_cashier,
                "generated_count": len(generated_sales),
                "identity_ids": [row["identity_id"] for row in generated_sales],
            },
        )
        self._persist()
        return result

    def import_mpesa_collections(self, payload: dict[str, Any]) -> list[dict[str, Any]]:
        actor = self._resolve_mpesa_import_actor(payload["imported_by"])
        source_batch_no = payload.get("source_batch_no", "").strip()
        results: list[dict[str, Any]] = []
        existing_by_receipt = {row["receipt_no"]: row for row in self.mpesa_collections}
        for item in payload.get("items", []):
            normalized_item = {
                "receipt_no": str(item["receipt_no"]).strip().upper(),
                "store_code": str(item["store_code"]).strip().upper(),
                "amount": round(float(item["amount"]), 2),
                "collected_at": item["collected_at"],
                "imported_at": now_iso(),
                "imported_by": actor["username"],
                "customer_id": str(item.get("customer_id", "")).strip(),
                "phone_number": str(item.get("phone_number", "")).strip(),
                "payer_name": str(item.get("payer_name", "")).strip(),
                "reference": str(item.get("reference", "")).strip(),
                "note": str(item.get("note", "")).strip(),
                "source_batch_no": source_batch_no,
            }
            duplicate = existing_by_receipt.get(normalized_item["receipt_no"])
            if duplicate:
                self._create_payment_anomaly(
                    anomaly_type="mpesa_duplicate",
                    store_code=normalized_item["store_code"],
                    created_by=actor["username"],
                    payment_method="mpesa",
                    amount_received=normalized_item["amount"],
                    reference=normalized_item["receipt_no"],
                    customer_id=normalized_item.get("customer_id", ""),
                    source_type="mpesa_import",
                    note="Duplicate M-Pesa receipt imported again.",
                    entity_id=normalized_item["receipt_no"],
                )
                results.append({**duplicate, "match_status": "duplicate"})
                continue
            match = self._match_mpesa_collection(normalized_item)
            row = {
                "id": next(self._mpesa_collection_ids),
                **normalized_item,
                **match,
            }
            self.mpesa_collections.append(row)
            existing_by_receipt[row["receipt_no"]] = row
            if row["match_status"] == "unmatched":
                self._create_payment_anomaly(
                    anomaly_type="mpesa_unmatched",
                    store_code=row["store_code"],
                    created_by=actor["username"],
                    payment_method="mpesa",
                    amount_received=row["amount"],
                    reference=row["receipt_no"],
                    customer_id=row.get("customer_id", ""),
                    source_type="mpesa_import",
                    note="Imported M-Pesa payment could not be matched to a sale.",
                    entity_id=row["receipt_no"],
                )
            results.append(row)

        self._log_event(
            event_type="mpesa.imported",
            entity_type="mpesa_collection_batch",
            entity_id=source_batch_no or f"manual-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
            actor=actor["username"],
            summary=f"M-Pesa collections imported ({len(results)} rows)",
            details={
                "source_batch_no": source_batch_no,
                "row_count": len(results),
                "matched_count": sum(1 for row in results if row["match_status"] == "matched"),
                "duplicate_count": sum(1 for row in results if row["match_status"] == "duplicate"),
            },
        )
        self._persist()
        return sorted(results, key=lambda row: row["collected_at"], reverse=True)

    def ingest_mpesa_callback(self, payload: dict[str, Any]) -> dict[str, Any]:
        callback_body = payload.get("Body", {}).get("stkCallback", {})
        metadata_items = callback_body.get("CallbackMetadata", {}).get("Item", [])
        metadata_map = {}
        if isinstance(metadata_items, list):
            for row in metadata_items:
                if not isinstance(row, dict):
                    continue
                name = str(row.get("Name", "")).strip()
                if not name:
                    continue
                metadata_map[name] = row.get("Value")

        result_code = int(
            callback_body.get("ResultCode", payload.get("result_code", payload.get("ResultCode", 0))) or 0
        )
        result_desc = str(
            callback_body.get("ResultDesc", payload.get("result_desc", payload.get("ResultDesc", ""))) or ""
        ).strip()
        source_batch_no = str(
            callback_body.get("CheckoutRequestID")
            or payload.get("CheckoutRequestID")
            or payload.get("source_batch_no")
            or f"SAF-CALLBACK-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
        ).strip()
        if result_code != 0:
            self._log_event(
                event_type="mpesa.callback_ignored",
                entity_type="mpesa_callback",
                entity_id=source_batch_no,
                actor="safaricom_callback",
                summary="Safaricom callback received with non-success result",
                details={"result_code": result_code, "result_desc": result_desc},
            )
            self._persist()
            return {
                "status": "ignored",
                "message": "Callback received but payment was not successful.",
                "result_code": result_code,
                "result_desc": result_desc,
                "source_batch_no": source_batch_no,
                "receipt_no": "",
                "store_code": "",
                "amount": 0.0,
                "customer_id": "",
                "match_status": "",
                "matched_order_no": "",
                "matched_shift_no": "",
            }

        receipt_no = str(
            metadata_map.get("MpesaReceiptNumber")
            or payload.get("receipt_no")
            or payload.get("MpesaReceiptNumber")
            or ""
        ).strip().upper()
        store_code = str(
            payload.get("store_code")
            or metadata_map.get("AccountReference")
            or metadata_map.get("BillRefNumber")
            or ""
        ).strip().upper()
        if not store_code:
            store_code = "UTAWALA"

        transaction_date_value = metadata_map.get("TransactionDate") or payload.get("collected_at")
        collected_at = ""
        if transaction_date_value:
            text = str(transaction_date_value).strip()
            try:
                parsed = datetime.strptime(text, "%Y%m%d%H%M%S").replace(tzinfo=NAIROBI_TZ)
                collected_at = parsed.astimezone(timezone.utc).isoformat()
            except ValueError:
                collected_at = text
        if not collected_at:
            collected_at = now_iso()

        items = [
            {
                "receipt_no": receipt_no,
                "store_code": store_code,
                "amount": metadata_map.get("Amount", payload.get("amount", 0)),
                "collected_at": collected_at,
                "customer_id": str(
                    payload.get("customer_id")
                    or metadata_map.get("BillRefNumber")
                    or metadata_map.get("AccountReference")
                    or ""
                ).strip(),
                "phone_number": str(metadata_map.get("PhoneNumber") or payload.get("phone_number") or "").strip(),
                "payer_name": str(payload.get("payer_name") or "").strip(),
                "reference": str(
                    payload.get("reference")
                    or callback_body.get("MerchantRequestID")
                    or callback_body.get("CheckoutRequestID")
                    or source_batch_no
                ).strip(),
                "note": str(payload.get("note") or "safaricom callback").strip(),
            }
        ]
        imported_rows = self.import_mpesa_collections(
            {
                "imported_by": "safaricom_callback",
                "source_batch_no": source_batch_no,
                "items": items,
            }
        )
        row = imported_rows[0]
        return {
            "status": "accepted",
            "message": "Safaricom callback ingested successfully.",
            "result_code": result_code,
            "result_desc": result_desc,
            "source_batch_no": source_batch_no,
            "receipt_no": row["receipt_no"],
            "store_code": row["store_code"],
            "amount": row["amount"],
            "customer_id": row.get("customer_id", ""),
            "match_status": row.get("match_status", ""),
            "matched_order_no": row.get("matched_order_no", ""),
            "matched_shift_no": row.get("matched_shift_no", ""),
        }

    def list_mpesa_collections(
        self,
        store_code: Optional[str] = None,
        match_status: Optional[str] = None,
        customer_id: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        rows = list(self.mpesa_collections)
        if store_code:
            normalized_store = store_code.strip().upper()
            rows = [row for row in rows if row["store_code"].upper() == normalized_store]
        if match_status:
            normalized_status = match_status.strip().lower()
            rows = [row for row in rows if row["match_status"].lower() == normalized_status]
        if customer_id:
            normalized_customer = customer_id.strip()
            rows = [row for row in rows if row.get("customer_id", "") == normalized_customer]
        return sorted(rows, key=lambda row: row["collected_at"], reverse=True)

    def list_mpesa_customer_insights(
        self,
        store_code: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        grouped: dict[str, dict[str, Any]] = {}
        for row in self.list_mpesa_collections(store_code=store_code):
            customer_id = row.get("customer_id", "").strip()
            if not customer_id:
                continue
            insight = grouped.setdefault(
                customer_id,
                {
                    "customer_id": customer_id,
                    "transaction_count": 0,
                    "total_spent": 0.0,
                    "last_seen_at": "",
                    "stores": set(),
                    "order_nos": set(),
                },
            )
            insight["transaction_count"] += 1
            insight["total_spent"] += row["amount"]
            insight["stores"].add(row["store_code"])
            if row.get("matched_order_no"):
                insight["order_nos"].add(row["matched_order_no"])
            if not insight["last_seen_at"] or row["collected_at"] > insight["last_seen_at"]:
                insight["last_seen_at"] = row["collected_at"]

        results = []
        for insight in grouped.values():
            total_spent = round(insight["total_spent"], 2)
            transaction_count = insight["transaction_count"]
            results.append(
                {
                    "customer_id": insight["customer_id"],
                    "transaction_count": transaction_count,
                    "total_spent": total_spent,
                    "last_seen_at": insight["last_seen_at"],
                    "stores": sorted(insight["stores"]),
                    "order_nos": sorted(insight["order_nos"]),
                    "average_ticket": round(total_spent / transaction_count, 2) if transaction_count else 0.0,
                }
            )
        return sorted(results, key=lambda row: (-row["total_spent"], row["customer_id"]))

    def sync_offline_sales_batch(self, payload: dict[str, Any]) -> dict[str, Any]:
        actor = self._require_user_role(payload["uploaded_by"], {"cashier", "store_manager", "area_supervisor", "admin"})
        sync_batch_no = f"SYNC-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{next(self._offline_sync_ids):03d}"
        results: list[dict[str, Any]] = []
        store_codes: set[str] = set()
        accepted_count = 0
        duplicate_count = 0
        failed_count = 0

        for sale in payload.get("sales", []):
            client_sale_id = sale["client_sale_id"].strip()
            if client_sale_id in self.offline_sale_registry:
                duplicate_count += 1
                registry_row = self.offline_sale_registry[client_sale_id]
                results.append(
                    {
                        "client_sale_id": client_sale_id,
                        "order_no": registry_row.get("order_no", sale["order_no"]),
                        "status": "duplicate",
                        "message": "This offline sale was already synced.",
                        "sale_id": registry_row.get("sale_id"),
                    }
                )
                continue

            try:
                sale_payload = {
                    **sale,
                    "cashier_name": sale.get("cashier_name", "").strip() or actor["username"],
                    "shift_no": sale.get("shift_no", "").strip(),
                    "power_mode": sale.get("power_mode", "offline") or "offline",
                    "sync_batch_no": sync_batch_no,
                    "client_sale_id": client_sale_id,
                    "note": (
                        f"{sale.get('note', '').strip()} [offline sync from {payload['device_id']}]"
                    ).strip(),
                }
                transaction = self.create_sale_transaction(sale_payload)
                self.offline_sale_registry[client_sale_id] = {
                    "client_sale_id": client_sale_id,
                    "order_no": transaction["order_no"],
                    "sale_id": transaction["id"],
                    "sync_batch_no": sync_batch_no,
                    "synced_at": now_iso(),
                }
                accepted_count += 1
                store_codes.add(transaction["store_code"])
                results.append(
                    {
                        "client_sale_id": client_sale_id,
                        "order_no": transaction["order_no"],
                        "status": "accepted",
                        "message": "Offline sale synced successfully.",
                        "sale_id": transaction["id"],
                    }
                )
            except HTTPException as error:
                failed_count += 1
                results.append(
                    {
                        "client_sale_id": client_sale_id,
                        "order_no": sale["order_no"],
                        "status": "failed",
                        "message": str(error.detail),
                        "sale_id": None,
                    }
                )

        batch = {
            "sync_batch_no": sync_batch_no,
            "store_codes": sorted(store_codes),
            "device_id": payload["device_id"].strip(),
            "uploaded_at": now_iso(),
            "uploaded_by": actor["username"],
            "note": payload.get("note", "").strip(),
            "accepted_count": accepted_count,
            "duplicate_count": duplicate_count,
            "failed_count": failed_count,
            "results": results,
        }
        self.offline_sync_batches[sync_batch_no] = batch
        self._log_event(
            event_type="sales.offline_sync_imported",
            entity_type="offline_sync_batch",
            entity_id=sync_batch_no,
            actor=actor["username"],
            summary=f"Offline sales sync {sync_batch_no} uploaded",
            details={
                "device_id": batch["device_id"],
                "accepted_count": accepted_count,
                "duplicate_count": duplicate_count,
                "failed_count": failed_count,
            },
        )
        self._persist()
        return batch

    def list_offline_sync_batches(
        self,
        device_id: Optional[str] = None,
        store_code: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        rows = list(self.offline_sync_batches.values())
        if device_id:
            normalized_device = device_id.strip()
            rows = [row for row in rows if row["device_id"] == normalized_device]
        if store_code:
            normalized_store = store_code.strip().upper()
            rows = [row for row in rows if normalized_store in row.get("store_codes", [])]
        return sorted(rows, key=lambda row: row["uploaded_at"], reverse=True)

    def create_user(self, payload: dict[str, Any]) -> dict[str, Any]:
        actor = self._require_user_role(payload["created_by"], {"admin", "area_supervisor"})
        if any(user["username"] == payload["username"] for user in self.users.values()):
            raise HTTPException(status_code=409, detail=f"Username {payload['username']} already exists")
        if payload.get("store_code"):
            self._ensure_store_exists(payload["store_code"])

        user = {
            "id": next(self._user_ids),
            "created_at": now_iso(),
            "username": payload["username"],
            "full_name": payload["full_name"],
            "role_code": payload["role_code"],
            "store_code": payload.get("store_code"),
            "is_active": payload.get("is_active", True),
            **hash_password(payload["password"]),
        }
        self.users[user["id"]] = user
        self._log_event(
            event_type="user.created",
            entity_type="user",
            entity_id=user["username"],
            actor=actor["username"],
            summary=f"User {user['username']} created",
            details={"role_code": user["role_code"], "store_code": user.get("store_code")},
        )
        self._persist()
        return self._public_user(user)

    def list_users(self) -> list[dict[str, Any]]:
        return [self._public_user(user) for user in self.users.values()]

    def reset_test_history(self, actor_username: str) -> dict[str, Any]:
        self._require_user_role(actor_username, {"admin"})

        cleared_counts = {
            "关单主档": len(self.inbound_shipments),
            "包裹批次": len(self.parcel_batches),
            "bale条码": len(self.bale_barcodes),
            "分拣任务": len(self.sorting_tasks),
            "分拣库存": len(self.sorting_stock),
            "商品档案": len(self.products),
            "收货单": len(self.goods_receipts),
            "打印任务": len(self.print_jobs),
            "仓库库存": sum(len(rows) for rows in self.warehouse_stock.values()),
            "门店库存": sum(len(rows) for rows in self.store_stock.values()),
            "调拨单": len(self.transfer_orders),
            "调拨建议": len(self.transfer_recommendations),
            "门店收货会话": len(self.transfer_receiving_sessions),
            "退仓单": len(self.return_orders),
            "销售单": len(self.sales_transactions),
            "作废申请": len(self.sale_void_requests),
            "退款申请": len(self.sale_refund_requests),
            "门店货架位": len(self.store_rack_locations),
            "库存调整": len(self.inventory_adjustments),
            "库存流水": len(self.inventory_movements),
            "审计日志": len(self.audit_events),
            "收银班次": len(self.cashier_shifts),
            "交班记录": len(self.cashier_handover_logs),
            "支付异常": len(self.payment_anomalies),
            "M-Pesa流水": len(self.mpesa_collections),
            "离线同步批次": len(self.offline_sync_batches),
            "离线销售登记": len(self.offline_sale_registry),
            "门店限价规则": len(self.price_rules),
        }

        preserved_users = {user_id: dict(row) for user_id, row in self.users.items()}
        preserved_sessions = {token: dict(row) for token, row in self.auth_sessions.items()}
        preserved_stores = {code: dict(row) for code, row in self.stores.items()}
        preserved_suppliers = {code: dict(row) for code, row in self.suppliers.items()}
        preserved_cargo_types = {code: dict(row) for code, row in self.cargo_types.items()}
        preserved_label_templates = {code: dict(row) for code, row in self.label_templates.items()}

        self._reset_runtime()

        if preserved_users:
            self.users = preserved_users
        if preserved_sessions:
            self.auth_sessions = preserved_sessions
        if preserved_stores:
            self.stores = preserved_stores
        if preserved_suppliers:
            self.suppliers = preserved_suppliers
        if preserved_cargo_types:
            self.cargo_types = preserved_cargo_types
        if preserved_label_templates:
            self.label_templates = preserved_label_templates

        self._set_counters()
        self._persist()

        cleared_summary = "、".join(
            f"{label}{count}" for label, count in cleared_counts.items() if count
        ) or "没有可清除的历史数据"
        return {
            "message": f"测试历史数据已清空：{cleared_summary}。已保留账号、门店、供应商、标签模板和基础主数据。",
        }

    def generate_warehouse_mainflow_demo(self, actor_username: str) -> dict[str, Any]:
        self._require_user_role(actor_username, {"admin", "warehouse_supervisor"})

        timestamp_key = datetime.now(timezone.utc).strftime("%m%d%H%M%S")
        unload_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        customs_notice_no = f"DEMO-MF-{timestamp_key}"
        source_pool_token = f"CN-SRC-{customs_notice_no}-01"
        per_bale_weight_kg = 50.0
        service_supervisor = "warehouse_supervisor_1"
        service_clerk = "warehouse_clerk_1"

        category_plans = [
            {
                "source_category_main": "tops",
                "source_category_sub": "summer+",
                "package_count": 20,
                "sorted_bales": 10,
                "sorting_category_name": "tops / lady tops",
                "result_rows": [
                    {"grade": "P", "qty": 120, "estimated_unit_cost_kes": 96.0},
                    {"grade": "S", "qty": 90, "estimated_unit_cost_kes": 74.0},
                ],
            },
            {
                "source_category_main": "jacket",
                "source_category_sub": "winter+",
                "package_count": 14,
                "sorted_bales": 7,
                "sorting_category_name": "jacket / jacket",
                "result_rows": [
                    {"grade": "P", "qty": 60, "estimated_unit_cost_kes": 145.0},
                    {"grade": "S", "qty": 40, "estimated_unit_cost_kes": 110.0},
                ],
            },
            {
                "source_category_main": "pants",
                "source_category_sub": "jeans+",
                "package_count": 12,
                "sorted_bales": 6,
                "sorting_category_name": "pants / jeans pant",
                "result_rows": [
                    {"grade": "P", "qty": 70, "estimated_unit_cost_kes": 122.0},
                    {"grade": "S", "qty": 50, "estimated_unit_cost_kes": 95.0},
                ],
            },
            {
                "source_category_main": "dress",
                "source_category_sub": "dress+",
                "package_count": 16,
                "sorted_bales": 8,
                "sorting_category_name": "dress / short dress",
                "result_rows": [
                    {"grade": "P", "qty": 90, "estimated_unit_cost_kes": 138.0},
                    {"grade": "S", "qty": 70, "estimated_unit_cost_kes": 104.0},
                ],
            },
        ]

        china_source_lines = []
        for index, plan in enumerate(category_plans, start=1):
            china_source_lines.append(
                {
                    "source_bale_token": f"{source_pool_token}-{index:03d}",
                    "supplier_name": "Youxun",
                    "category_main": plan["source_category_main"],
                    "category_sub": plan["source_category_sub"],
                    "package_count": plan["package_count"],
                    "unit_weight_kg": per_bale_weight_kg,
                    "unit_cost_amount": 380.0 + index * 25,
                    "unit_cost_currency": "CNY",
                }
            )

        self.create_or_update_china_source_record(
            {
                "source_pool_token": source_pool_token,
                "container_type": "40HQ",
                "customs_notice_no": customs_notice_no,
                "lines": china_source_lines,
            },
            created_by=service_supervisor,
        )
        self.update_china_source_cost(
            source_pool_token,
            {
                "cost_entries": {
                    "head_transport": {
                        "currency": "CNY",
                        "amount": 8600,
                        "payment_method": "bank",
                        "payer": "china_finance",
                        "payment_reference": f"HEAD-{timestamp_key}",
                        "documents": [],
                    },
                    "customs_clearance": {
                        "currency": "KES",
                        "amount": 186000,
                        "payment_method": "bank",
                        "payer": "kenya_finance",
                        "payment_reference": f"CLEAR-{timestamp_key}",
                        "documents": [],
                    },
                    "tail_transport": {
                        "currency": "KES",
                        "amount": 42000,
                        "payment_method": "cash",
                        "payer": "warehouse_ops",
                        "payment_reference": f"ROAD-{timestamp_key}",
                        "documents": [],
                    },
                }
            },
            updated_by=service_supervisor,
        )

        shipment = self.create_inbound_shipment(
            {
                "shipment_type": "sea",
                "customs_notice_no": customs_notice_no,
                "unload_date": unload_date,
                "coc_goods_manifest": "warehouse mainflow overview demo",
                "note": "系统测试工具生成的主分拣流 demo，不触发真实入仓 barcode 打印。",
                "coc_documents": [],
            }
        )

        for index, plan in enumerate(category_plans, start=1):
            self.create_parcel_batch(
                {
                    "intake_type": "sea_freight",
                    "inbound_shipment_no": shipment["shipment_no"],
                    "source_bale_token": china_source_lines[index - 1]["source_bale_token"],
                    "supplier_name": "Youxun",
                    "cargo_type": "second hand apparel",
                    "category_main": plan["source_category_main"],
                    "category_sub": plan["source_category_sub"],
                    "package_count": plan["package_count"],
                    "total_weight": per_bale_weight_kg,
                    "received_by": service_clerk,
                    "note": "warehouse mainflow demo parcel batch",
                }
            )

        self.confirm_inbound_shipment_intake(
            shipment["shipment_no"],
            {
                "declared_total_packages": sum(int(plan["package_count"]) for plan in category_plans),
                "confirmed_by": service_supervisor,
                "note": "warehouse mainflow demo intake confirmed",
            },
        )
        generated_bales = self.generate_bale_barcodes(shipment["shipment_no"], service_supervisor)

        bales_by_source_token: dict[str, list[dict[str, Any]]] = {}
        for row in generated_bales:
            token = str(row.get("source_bale_token") or "").strip()
            bales_by_source_token.setdefault(token, []).append(row)

        sorting_task_nos: list[str] = []
        for index, plan in enumerate(category_plans, start=1):
            source_bale_token = china_source_lines[index - 1]["source_bale_token"]
            selected_bales = (bales_by_source_token.get(source_bale_token) or [])[: int(plan["sorted_bales"])]
            task = self.create_sorting_task(
                {
                    "bale_barcodes": [str(row.get("bale_barcode") or "").strip().upper() for row in selected_bales],
                    "handler_names": ["Sorter A", "Sorter B"],
                    "note": f"{plan['source_category_sub']} demo sorting task",
                    "created_by": service_supervisor,
                }
            )
            sorting_task_nos.append(task["task_no"])
            self.submit_sorting_task_results(
                task["task_no"],
                {
                    "created_by": service_supervisor,
                    "result_items": [
                        {
                            "category_name": plan["sorting_category_name"],
                            "grade": row["grade"],
                            "qty": row["qty"],
                            "confirm_to_inventory": True,
                            "estimated_unit_cost_kes": row["estimated_unit_cost_kes"],
                        }
                        for row in plan["result_rows"]
                    ],
                    "note": f"{plan['source_category_sub']} demo 已完成分拣入库",
                    "mark_task_completed": True,
                    "cost_status_override": "cost_locked",
                    "estimated_unit_cost_kes": plan["result_rows"][0]["estimated_unit_cost_kes"],
                    "cost_model_code": "sorting_piece_weight_v2",
                    "source_bale_tokens": [source_bale_token],
                    "source_pool_tokens": [source_pool_token],
                    "loss_record": {
                        "has_loss": False,
                        "loss_qty": 0,
                        "loss_weight_kg": 0,
                        "photos": [],
                        "note": "",
                    },
                },
            )

        raw_rows = self.list_raw_bales(shipment_no=shipment["shipment_no"])
        total_bales = len(raw_rows)
        sorted_bales = sum(1 for row in raw_rows if str(row.get("status") or "").strip().lower() == "sorted")
        remaining_raw_bales = sum(
            1 for row in raw_rows if str(row.get("status") or "").strip().lower() == "ready_for_sorting"
        )
        printed_bales = sum(1 for row in raw_rows if row.get("printed_at"))

        return {
            "message": f"已生成仓库主分拣 demo：{shipment['shipment_no']}，共 {total_bales} 包，已分拣 {sorted_bales} 包；本次没有真实打印入仓 barcode。",
            "demo_name": "仓库主分拣 Demo",
            "customs_notice_no": customs_notice_no,
            "shipment_no": shipment["shipment_no"],
            "source_pool_token": source_pool_token,
            "unload_date": unload_date,
            "per_bale_weight_kg": per_bale_weight_kg,
            "total_bales": total_bales,
            "sorted_bales": sorted_bales,
            "remaining_raw_bales": remaining_raw_bales,
            "printed_bales": printed_bales,
            "route_cost_currency": "KES",
            "route_cost_kes": 42000.0,
            "head_transport_cny": 8600.0,
            "customs_clearance_kes": 186000.0,
            "tail_transport_kes": 42000.0,
            "sorting_task_nos": sorting_task_nos,
            "categories": [
                {
                    "source_category_main": plan["source_category_main"],
                    "source_category_sub": plan["source_category_sub"],
                    "package_count": plan["package_count"],
                    "sorted_bales": plan["sorted_bales"],
                    "remaining_raw_bales": int(plan["package_count"]) - int(plan["sorted_bales"]),
                    "sorting_category_name": plan["sorting_category_name"],
                }
                for plan in category_plans
            ],
        }

    def generate_store_replenishment_demo(self, actor_username: str) -> dict[str, Any]:
        self._require_user_role(actor_username, {"admin"})
        self.reset_test_history(actor_username)

        timestamp_key = datetime.now(timezone.utc).strftime("%m%d%H%M%S")
        unload_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        customs_notice_no = f"DEMO-RPL-{timestamp_key}"
        source_pool_token = f"CN-SRC-{customs_notice_no}-01"
        warehouse_code = "WH1"
        store_code = "UTAWALA"
        per_bale_weight_kg = 50.0
        package_count_per_category = 24
        total_generated_qty_per_category = 2300
        store_seed_qty_per_category = 300
        recent_sales_qty_per_category = 210
        waiting_store_dispatch_qty_per_category = 600
        waiting_store_dispatch_bale_size = 100
        waiting_store_dispatch_bales_per_category = waiting_store_dispatch_qty_per_category // waiting_store_dispatch_bale_size
        warehouse_loose_qty_per_category = (
            total_generated_qty_per_category - store_seed_qty_per_category - waiting_store_dispatch_qty_per_category
        )
        service_supervisor = "warehouse_supervisor_1"
        service_clerk = "warehouse_clerk_1"
        service_store_manager = next(
            (
                str(user.get("username") or "").strip()
                for user in sorted(self.users.values(), key=lambda row: str(row.get("username") or "").lower())
                if user.get("is_active", True)
                and user.get("role_code") == "store_manager"
                and str(user.get("store_code") or "").strip().upper() == store_code
            ),
            "",
        )
        if not service_store_manager:
            raise HTTPException(status_code=400, detail=f"Store {store_code} has no active store manager for replenishment demo generation")

        category_presets = DEFAULT_APPAREL_CATEGORY_PRESETS[:10]
        category_plans: list[dict[str, Any]] = []
        for index, preset in enumerate(category_presets, start=1):
            grade_p_qty = 1180 + index * 10
            grade_s_qty = total_generated_qty_per_category - grade_p_qty
            category_plans.append(
                {
                    "source_category_main": preset["category_main"],
                    "source_category_sub": preset["category_sub"],
                    "sorting_category_name": f"{preset['category_main']} / {preset['category_sub']}",
                    "package_count": package_count_per_category,
                    "sorted_bales": package_count_per_category,
                    "total_generated_qty": total_generated_qty_per_category,
                    "store_seed_qty": store_seed_qty_per_category,
                    "recent_14d_sales_qty": recent_sales_qty_per_category,
                    "waiting_store_dispatch_qty": waiting_store_dispatch_qty_per_category,
                    "waiting_store_dispatch_bale_count": waiting_store_dispatch_bales_per_category,
                    "warehouse_loose_qty": warehouse_loose_qty_per_category,
                    "result_rows": [
                        {"grade": "P", "qty": grade_p_qty, "estimated_unit_cost_kes": float(preset["cost_p"])},
                        {"grade": "S", "qty": grade_s_qty, "estimated_unit_cost_kes": float(preset["cost_s"])},
                    ],
                }
            )

        original_persist = self._persist
        self._persist = lambda: None
        success = False
        try:
            china_source_lines = []
            for index, plan in enumerate(category_plans, start=1):
                china_source_lines.append(
                    {
                        "source_bale_token": f"{source_pool_token}-{index:03d}",
                        "supplier_name": "Youxun",
                        "category_main": plan["source_category_main"],
                        "category_sub": plan["source_category_sub"],
                        "package_count": plan["package_count"],
                        "unit_weight_kg": per_bale_weight_kg,
                        "unit_cost_amount": 420.0 + index * 18,
                        "unit_cost_currency": "CNY",
                    }
                )

            self.create_or_update_china_source_record(
                {
                    "source_pool_token": source_pool_token,
                    "container_type": "40HQ",
                    "customs_notice_no": customs_notice_no,
                    "lines": china_source_lines,
                },
                created_by=service_supervisor,
            )
            self.update_china_source_cost(
                source_pool_token,
                {
                    "cost_entries": {
                        "head_transport": {
                            "currency": "CNY",
                            "amount": 12800,
                            "payment_method": "bank",
                            "payer": "china_finance",
                            "payment_reference": f"HEAD-{timestamp_key}",
                            "documents": [],
                        },
                        "customs_clearance": {
                            "currency": "KES",
                            "amount": 265000,
                            "payment_method": "bank",
                            "payer": "kenya_finance",
                            "payment_reference": f"CLEAR-{timestamp_key}",
                            "documents": [],
                        },
                        "tail_transport": {
                            "currency": "KES",
                            "amount": 68500,
                            "payment_method": "cash",
                            "payer": "warehouse_ops",
                            "payment_reference": f"ROAD-{timestamp_key}",
                            "documents": [],
                        },
                    }
                },
                updated_by=service_supervisor,
            )

            shipment = self.create_inbound_shipment(
                {
                    "shipment_type": "sea",
                    "customs_notice_no": customs_notice_no,
                    "unload_date": unload_date,
                    "coc_goods_manifest": "store replenishment one-click demo",
                    "note": "系统测试工具生成的一键门店补货 demo，会走真实主分拣、待送店压包、门店 identity 和 14 天销售。",
                    "coc_documents": [],
                }
            )

            for index, plan in enumerate(category_plans, start=1):
                self.create_parcel_batch(
                    {
                        "intake_type": "sea_freight",
                        "inbound_shipment_no": shipment["shipment_no"],
                        "source_bale_token": china_source_lines[index - 1]["source_bale_token"],
                        "supplier_name": "Youxun",
                        "cargo_type": "second hand apparel",
                        "category_main": plan["source_category_main"],
                        "category_sub": plan["source_category_sub"],
                        "package_count": plan["package_count"],
                        "total_weight": round(plan["package_count"] * per_bale_weight_kg, 2),
                        "received_by": service_clerk,
                        "note": "store replenishment demo parcel batch",
                    }
                )

            self.confirm_inbound_shipment_intake(
                shipment["shipment_no"],
                {
                    "declared_total_packages": sum(int(plan["package_count"]) for plan in category_plans),
                    "confirmed_by": service_supervisor,
                    "note": "store replenishment demo intake confirmed",
                },
            )
            generated_bales = self.generate_bale_barcodes(shipment["shipment_no"], service_supervisor)

            bales_by_source_token: dict[str, list[dict[str, Any]]] = {}
            for row in generated_bales:
                source_bale_token = str(row.get("source_bale_token") or "").strip()
                bales_by_source_token.setdefault(source_bale_token, []).append(row)

            sorting_task_nos: list[str] = []
            for index, plan in enumerate(category_plans, start=1):
                source_bale_token = china_source_lines[index - 1]["source_bale_token"]
                selected_bales = bales_by_source_token.get(source_bale_token, [])
                task = self.create_sorting_task(
                    {
                        "bale_barcodes": [str(row.get("bale_barcode") or "").strip().upper() for row in selected_bales],
                        "handler_names": ["Sorter A", "Sorter B"],
                        "note": f"{plan['source_category_sub']} replenishment demo sorting task",
                        "created_by": service_supervisor,
                    }
                )
                sorting_task_nos.append(task["task_no"])
                self.submit_sorting_task_results(
                    task["task_no"],
                    {
                        "created_by": service_supervisor,
                        "result_items": [
                            {
                                "category_name": plan["sorting_category_name"],
                                "grade": row["grade"],
                                "qty": row["qty"],
                                "confirm_to_inventory": True,
                                "estimated_unit_cost_kes": row["estimated_unit_cost_kes"],
                            }
                            for row in plan["result_rows"]
                        ],
                        "note": f"{plan['source_category_sub']} replenishment demo 已完成分拣入库",
                        "mark_task_completed": True,
                        "cost_status_override": "cost_locked",
                        "estimated_unit_cost_kes": plan["result_rows"][0]["estimated_unit_cost_kes"],
                        "cost_model_code": "sorting_piece_weight_v2",
                        "source_bale_tokens": [source_bale_token],
                        "source_pool_tokens": [source_pool_token],
                        "loss_record": {
                            "has_loss": False,
                            "loss_qty": 0,
                            "loss_weight_kg": 0,
                            "photos": [],
                            "note": "",
                        },
                    },
                )

            available_tokens = self._list_available_store_retail_seed_tokens()
            available_tokens_by_category: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
            for token in available_tokens:
                category_main, category_sub = self._split_category_name_parts(str(token.get("category_name") or ""))
                available_tokens_by_category[(category_main, category_sub)].append(token)
            for bucket in available_tokens_by_category.values():
                bucket.sort(key=lambda row: str(row.get("token_no") or ""))

            selected_seed_identity_ids: list[str] = []
            for plan in category_plans:
                key = (plan["source_category_main"], plan["source_category_sub"])
                bucket = available_tokens_by_category.get(key, [])
                if len(bucket) < int(plan["store_seed_qty"]):
                    raise HTTPException(status_code=409, detail=f"{plan['sorting_category_name']} 可用于门店演练的 token 不足，不能生成 300 件在店 identity。")
                selected_seed_identity_ids.extend(
                    str(row.get("identity_no") or row.get("token_no") or "").strip().upper()
                    for row in bucket[: int(plan["store_seed_qty"])]
                )

            seed_result = self.seed_store_retail_samples(
                {
                    "store_code": store_code,
                    "seeded_by": service_store_manager,
                    "max_items": len(selected_seed_identity_ids),
                    "identity_ids": selected_seed_identity_ids,
                    "note": "一键门店补货 demo：生成在店 identity",
                }
            )

            seeded_items_by_category: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
            seeded_items_by_identity: dict[str, dict[str, Any]] = {}
            for row in seed_result["items"]:
                key = (
                    str(row.get("category_main") or "").strip(),
                    str(row.get("category_sub") or "").strip(),
                )
                seeded_items_by_category[key].append(row)
                seeded_items_by_identity[str(row.get("identity_id") or "").strip().upper()] = row
            for bucket in seeded_items_by_category.values():
                bucket.sort(key=lambda row: str(row.get("identity_id") or ""))

            selected_sales_identity_ids: list[str] = []
            for plan in category_plans:
                key = (plan["source_category_main"], plan["source_category_sub"])
                bucket = seeded_items_by_category.get(key, [])
                if len(bucket) < int(plan["recent_14d_sales_qty"]):
                    raise HTTPException(status_code=409, detail=f"{plan['sorting_category_name']} 当前在店 identity 不足，不能生成 14 天销量样本。")
                selected_sales_identity_ids.extend(
                    str(row.get("identity_id") or "").strip().upper()
                    for row in bucket[: int(plan["recent_14d_sales_qty"])]
                )

            recent_sales_result = self.generate_recent_store_sales(
                {
                    "store_code": store_code,
                    "generated_by": service_store_manager,
                    "days": 14,
                    "max_items": len(selected_sales_identity_ids),
                    "identity_ids": selected_sales_identity_ids,
                    "note": "一键门店补货 demo：生成最近 14 天真实销量样本",
                }
            )

            waiting_store_dispatch_bale_nos: list[str] = []
            for plan in category_plans:
                for bale_index in range(int(plan["waiting_store_dispatch_bale_count"])):
                    task = self.create_store_prep_bale_task(
                        {
                            "task_type": "store_dispatch",
                            "category_sub": plan["source_category_sub"],
                            "target_qty": waiting_store_dispatch_bale_size,
                            "assigned_employee": service_clerk,
                            "note": f"{plan['sorting_category_name']} 第 {bale_index + 1} 个待送店 demo 压包",
                            "created_by": service_supervisor,
                        }
                    )
                    completed = self.complete_store_prep_bale_task(
                        task["task_no"],
                        {
                            "updated_by": service_supervisor,
                            "actual_qty": waiting_store_dispatch_bale_size,
                            "note": f"{plan['sorting_category_name']} 已压成 100 件待送店包",
                        },
                    )
                    waiting_store_dispatch_bale_nos.append(str(completed.get("prepared_bale_no") or "").strip().upper())

            recommendation = self.create_transfer_recommendation(
                {
                    "from_warehouse_code": warehouse_code,
                    "to_store_code": store_code,
                    "preferred_categories": [],
                    "max_suggestions": len(category_plans),
                    "created_by": service_store_manager,
                }
            )

            warehouse_loose_qty = 0
            warehouse_waiting_store_dispatch_qty = 0
            warehouse_by_category: dict[tuple[str, str], dict[str, int]] = defaultdict(lambda: {"loose": 0, "packed": 0})
            for token in self.item_barcode_tokens.values():
                if str(token.get("store_code") or "").strip().upper():
                    continue
                status = str(token.get("status") or "").strip().lower()
                category_main, category_sub = self._split_category_name_parts(str(token.get("category_name") or ""))
                if status == "pending_store_print":
                    warehouse_loose_qty += 1
                    warehouse_by_category[(category_main, category_sub)]["loose"] += 1
                elif status == "packed_waiting_store_dispatch":
                    warehouse_waiting_store_dispatch_qty += 1
                    warehouse_by_category[(category_main, category_sub)]["packed"] += 1

            store_remaining_qty = sum(
                int(row.get("qty_on_hand") or 0)
                for row in self.store_stock.values()
                if str(row.get("store_code") or "").strip().upper() == store_code
            )
            sold_qty_by_category: dict[tuple[str, str], int] = defaultdict(int)
            for sale_row in recent_sales_result["sales"]:
                identity_id = str(sale_row.get("identity_id") or "").strip().upper()
                source_row = seeded_items_by_identity.get(identity_id, {})
                key = (
                    str(source_row.get("category_main") or "").strip(),
                    str(source_row.get("category_sub") or "").strip(),
                )
                sold_qty_by_category[key] += 1

            waiting_bales = self.list_store_prep_bales(status="waiting_store_dispatch")
            waiting_bales_by_category: dict[tuple[str, str], int] = defaultdict(int)
            for row in waiting_bales:
                key = (
                    str(row.get("category_main") or "").strip(),
                    str(row.get("category_sub") or "").strip(),
                )
                waiting_bales_by_category[key] += 1

            total_bales = len(generated_bales)
            categories_summary = [
                {
                    "category_main": plan["source_category_main"],
                    "category_sub": plan["source_category_sub"],
                    "sorting_category_name": plan["sorting_category_name"],
                    "total_generated_qty": plan["total_generated_qty"],
                    "store_seed_qty": len(seeded_items_by_category.get((plan["source_category_main"], plan["source_category_sub"]), [])),
                    "recent_14d_sales_qty": sold_qty_by_category.get((plan["source_category_main"], plan["source_category_sub"]), 0),
                    "warehouse_loose_qty": warehouse_by_category[(plan["source_category_main"], plan["source_category_sub"])]["loose"],
                    "waiting_store_dispatch_qty": warehouse_by_category[(plan["source_category_main"], plan["source_category_sub"])]["packed"],
                    "waiting_store_dispatch_bale_count": waiting_bales_by_category.get((plan["source_category_main"], plan["source_category_sub"]), 0),
                }
                for plan in category_plans
            ]

            result = {
                "message": (
                    f"已生成一键门店补货 demo：{shipment['shipment_no']}。"
                    f"仓库剩余 {warehouse_loose_qty + warehouse_waiting_store_dispatch_qty} 件，"
                    f"门店已上架 {seed_result['generated_count']} 件，最近 14 天已售 {recent_sales_result['generated_count']} 件，"
                    f"补货建议 {recommendation['recommendation_no']} 已生成，尚未创建调拨单。"
                ),
                "demo_name": "门店补货 Demo",
                "customs_notice_no": customs_notice_no,
                "shipment_no": shipment["shipment_no"],
                "source_pool_token": source_pool_token,
                "unload_date": unload_date,
                "warehouse_code": warehouse_code,
                "store_code": store_code,
                "category_count": len(category_plans),
                "per_bale_weight_kg": per_bale_weight_kg,
                "total_bales": total_bales,
                "sorted_bales": total_bales,
                "warehouse_total_qty": warehouse_loose_qty + warehouse_waiting_store_dispatch_qty,
                "warehouse_loose_qty": warehouse_loose_qty,
                "warehouse_waiting_store_dispatch_qty": warehouse_waiting_store_dispatch_qty,
                "waiting_store_dispatch_bale_count": len(waiting_bales),
                "waiting_store_dispatch_bale_size": waiting_store_dispatch_bale_size,
                "store_seed_qty": seed_result["generated_count"],
                "store_remaining_qty": store_remaining_qty,
                "recent_14d_sales_qty": recent_sales_result["generated_count"],
                "recent_14d_sales_amount": recent_sales_result["total_amount"],
                "recommendation_no": recommendation["recommendation_no"],
                "recommendation_item_count": len(recommendation["items"]),
                "recommendation_total_requested_qty": int(recommendation["analysis_summary"].get("total_requested_qty", 0) or 0),
                "sorting_task_nos": sorting_task_nos,
                "waiting_store_dispatch_bale_nos": waiting_store_dispatch_bale_nos,
                "categories": categories_summary,
            }
            success = True
            return result
        finally:
            self._persist = original_persist
            if success:
                self._persist()

    def create_label_print_job(self, payload: dict[str, Any]) -> dict[str, Any]:
        actor = self._require_user_role(payload["requested_by"], {"warehouse_clerk", "warehouse_supervisor"})
        job = self._build_label_print_job(
            barcode=payload["barcode"],
            copies=payload["copies"],
            printer_name=payload["printer_name"],
            requested_by=actor["username"],
        )
        self._persist()
        return job

    def queue_bale_barcode_print_jobs(
        self,
        shipment_no: str,
        items: list[dict[str, Any]],
        requested_by: str,
        printer_name: str = "Deli DL-720C",
        template_code: str = "warehouse_in",
    ) -> dict[str, Any]:
        actor = self._require_user_role(requested_by, {"warehouse_clerk", "warehouse_supervisor"})
        normalized_shipment_no = str(shipment_no or "").strip().upper()
        if not normalized_shipment_no:
            raise HTTPException(status_code=400, detail="请先选择船单")
        shipment = self.inbound_shipments.get(normalized_shipment_no)
        if not shipment:
            raise HTTPException(status_code=404, detail="运输主档不存在")
        if not items:
            raise HTTPException(status_code=400, detail="请至少选择一个 bale barcode 再打印")
        jobs: list[dict[str, Any]] = []
        printed_at = now_iso()
        template = self.get_label_template(template_code, template_scope="bale")
        label_size = f"{int(template.get('width_mm') or 60)}x{int(template.get('height_mm') or 40)}"
        parcel_batch_map = {
            str(batch.get("batch_no") or "").strip().upper(): batch
            for batch in self.list_parcel_batches(shipment_no=normalized_shipment_no)
        }
        for item in items:
            bale_reference = str(item.get("bale_barcode") or "").strip().upper()
            copies = int(item.get("copies") or 1)
            if not bale_reference:
                raise HTTPException(status_code=400, detail="存在空的 bale barcode")
            bale = self._find_raw_bale_by_reference_no_defaults(bale_reference)
            if not bale:
                raise HTTPException(status_code=404, detail=f"找不到 bale barcode：{bale_reference}")
            bale_barcode = str(bale.get("bale_barcode") or "").strip().upper()
            legacy_bale_barcode = str(bale.get("legacy_bale_barcode") or "").strip().upper()
            if str(bale.get("shipment_no") or "").strip().upper() != normalized_shipment_no:
                raise HTTPException(status_code=409, detail=f"{bale_reference} 不属于当前船单 {normalized_shipment_no}")
            batch_no = str(bale.get("parcel_batch_no") or "").strip().upper()
            batch = parcel_batch_map.get(batch_no, {})
            supplier_name = str(bale.get("supplier_name") or "").strip() or str(batch.get("supplier_name") or "").strip() or "-"
            category_main = str(bale.get("category_main") or "").strip()
            category_sub = str(bale.get("category_sub") or "").strip()
            category_display = " / ".join(part for part in [category_main, category_sub] if part) or "-"
            serial_no = int(bale.get("serial_no") or 0)
            batch_total_packages = int(batch.get("package_count") or 0) or serial_no or 1
            job = {
                "id": next(self._print_job_ids),
                "job_type": "bale_barcode_label",
                "status": "queued",
                "created_at": printed_at,
                "product_id": None,
                "document_no": normalized_shipment_no,
                "barcode": bale_barcode,
                "product_name": category_display,
                "template_code": template["template_code"],
                "label_size": label_size,
                "copies": copies,
                "printer_name": printer_name,
                "requested_by": actor["username"],
                "printed_at": None,
                "printed_by": "",
                "error_message": "",
                "print_payload": {
                    "symbology": "Code128",
                    "barcode_value": str(bale.get("scan_token") or "").strip().upper() or bale_barcode,
                    "scan_token": str(bale.get("scan_token") or "").strip().upper() or bale_barcode,
                    "bale_barcode": bale_barcode,
                    "legacy_bale_barcode": legacy_bale_barcode,
                    "human_readable": str(bale.get("scan_token") or "").strip().upper() or bale_barcode,
                    "supplier_name": supplier_name,
                    "category_main": category_main,
                    "category_sub": category_sub,
                    "category_display": category_display,
                    "package_position_label": f"第 {serial_no} 包 / 共 {batch_total_packages} 包",
                    "serial_no": serial_no,
                    "total_packages": batch_total_packages,
                    "shipment_no": normalized_shipment_no,
                    "parcel_batch_no": batch_no,
                    "unload_date": str(bale.get("unload_date") or batch.get("unload_date") or shipment.get("unload_date") or "").strip(),
                    "received_at": str(bale.get("received_at") or shipment.get("received_at") or "").strip(),
                    "template_code": template["template_code"],
                    "template_name": template.get("name", ""),
                    "template_scope": template.get("template_scope", "bale"),
                    "template_fields": template.get("fields", []),
                    "label_size": label_size,
                    "paper_preset": str(template.get("paper_preset") or "").strip().lower(),
                    "width_mm": int(template.get("width_mm") or 60),
                    "height_mm": int(template.get("height_mm") or 40),
                    "layout": self._normalize_label_template_layout(
                        "bale",
                        template.get("layout"),
                        int(template.get("width_mm") or 60),
                        int(template.get("height_mm") or 40),
                    ),
                },
            }
            self.print_jobs.append(job)
            bale["updated_at"] = printed_at
            self._log_event(
                event_type="print.bale_label_queued",
                entity_type="print_job",
                entity_id=str(job["id"]),
                actor=actor["username"],
                summary=f"Bale label print queued for {bale_barcode}",
                details={
                    "shipment_no": normalized_shipment_no,
                    "bale_barcode": bale_barcode,
                    "legacy_bale_barcode": legacy_bale_barcode,
                    "copies": copies,
                },
            )
            jobs.append(job)
        self._persist()
        return {
            "shipment_no": normalized_shipment_no,
            "print_jobs": jobs,
            "total_selected_bales": len(jobs),
            "total_print_copies": sum(int(job["copies"]) for job in jobs),
        }

    def _build_label_print_job(
        self,
        barcode: str,
        copies: int,
        printer_name: str,
        requested_by: str,
        source_document_no: str = "",
    ) -> dict[str, Any]:
        product = self.get_product_by_barcode(barcode)
        template_code = str(product.get("label_template_code") or "apparel_40x30").strip().lower() or "apparel_40x30"
        template_row = self.label_templates.get(template_code) or {}
        label_size = (
            f"{int(template_row.get('width_mm') or 40)}x{int(template_row.get('height_mm') or 30)}"
            if template_row
            else ("60x40" if template_code == "apparel_60x40" else "40x30")
        )
        trimmed_name = product["product_name"][:24]
        job = {
            "id": next(self._print_job_ids),
            "job_type": "barcode_label",
            "status": "queued",
            "created_at": now_iso(),
            "product_id": product["id"],
            "barcode": product["barcode"],
            "product_name": product["product_name"],
            "template_code": template_code,
            "label_size": label_size,
            "document_no": source_document_no,
            "printed_at": None,
            "printed_by": "",
            "error_message": "",
            "print_payload": {
                "symbology": "Code128",
                "barcode_value": product["barcode"],
                "human_readable": product["barcode"],
                "product_name": trimmed_name,
                "price": product.get("launch_price"),
                "short_suffix": str(product.get("rack_code") or "").strip().upper(),
                "template_code": template_code,
                "template_scope": str(template_row.get("template_scope") or "product").strip().lower(),
                "label_size": label_size,
            },
            "copies": copies,
            "printer_name": printer_name,
            "requested_by": requested_by,
        }
        self.print_jobs.append(job)
        self._log_event(
            event_type="print.label_queued",
            entity_type="print_job",
            entity_id=str(job["id"]),
            actor=requested_by,
            summary=f"Label print queued for {product['barcode']}",
            details={**job["print_payload"], "copies": copies, "source_document_no": source_document_no},
        )
        return job

    def queue_receipt_label_print_jobs(self, receipt_no: str, requested_by: str) -> list[dict[str, Any]]:
        actor = self._require_user_role(requested_by, {"warehouse_clerk", "warehouse_supervisor"})
        receipt = self.get_goods_receipt(receipt_no)
        jobs: list[dict[str, Any]] = []
        for item in receipt["items"]:
            jobs.append(
                self._build_label_print_job(
                    barcode=item["barcode"],
                    copies=item["received_qty"],
                    printer_name="Deli DL-720C",
                    requested_by=actor["username"],
                    source_document_no=receipt["receipt_no"],
                )
            )
        self._persist()
        return jobs

    def list_transfer_recommendations(self) -> list[dict[str, Any]]:
        return list(self.transfer_recommendations.values())

    def get_transfer_recommendation(self, recommendation_no: str) -> dict[str, Any]:
        recommendation = self.transfer_recommendations.get(recommendation_no)
        if not recommendation:
            raise HTTPException(status_code=404, detail=f"Unknown transfer recommendation {recommendation_no}")
        return recommendation

    def _parse_transfer_recommendation_datetime(self, value: Any) -> Optional[datetime]:
        normalized = str(value or "").strip()
        if not normalized:
            return None
        if normalized.endswith("Z"):
            normalized = f"{normalized[:-1]}+00:00"
        try:
            parsed = datetime.fromisoformat(normalized)
        except ValueError:
            return None
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)

    def _build_transfer_recommendation_key(self, category_main: Any, category_sub: Any) -> str:
        return (
            f"{self._normalize_transfer_category_value(category_main)}||"
            f"{self._normalize_transfer_category_value(category_sub)}"
        )

    def _ensure_transfer_recommendation_bucket(
        self,
        metrics: dict[str, dict[str, Any]],
        category_main: Any,
        category_sub: Any,
    ) -> dict[str, Any]:
        key = self._build_transfer_recommendation_key(category_main, category_sub)
        bucket = metrics.get(key)
        if bucket:
            return bucket
        bucket = {
            "recommendation_key": key,
            "category_main": str(category_main or "").strip(),
            "category_sub": str(category_sub or "").strip(),
            "warehouse_available_qty": 0,
            "dispatchable_token_qty": 0,
            "current_store_qty": 0,
            "pending_shelving_qty": 0,
            "in_transit_qty": 0,
            "recent_14d_sales_qty": 0,
            "source_count": 0,
        }
        metrics[key] = bucket
        return bucket

    def _collect_transfer_recommendation_metrics(
        self,
        warehouse_code: str,
        store_code: str,
    ) -> dict[str, dict[str, Any]]:
        normalized_warehouse = str(warehouse_code or "").strip().upper()
        normalized_store = str(store_code or "").strip().upper()
        metrics: dict[str, dict[str, Any]] = {}
        self._rebuild_store_dispatch_bales()

        for stock_key, stock_row in self.warehouse_stock.items():
            current_warehouse, barcode = stock_key.split("||", 1)
            if current_warehouse.strip().upper() != normalized_warehouse:
                continue
            available_qty = int(stock_row.get("qty_on_hand", 0) or 0)
            if available_qty <= 0:
                continue
            try:
                product = self.get_product_by_barcode(barcode)
            except HTTPException:
                continue
            bucket = self._ensure_transfer_recommendation_bucket(
                metrics,
                product.get("category_main", ""),
                product.get("category_sub", ""),
            )
            bucket["warehouse_available_qty"] += available_qty
            bucket["source_count"] += 1

        dispatchable_token_statuses = {
            "pending_store_print",
            "packed_waiting_store_dispatch",
            "reserved_waiting_store_dispatch",
        }
        for token in self.item_barcode_tokens.values():
            if str(token.get("store_code") or "").strip().upper():
                continue
            if str(token.get("status") or "").strip().lower() not in dispatchable_token_statuses:
                continue

            category_main = ""
            category_sub = ""
            barcode = str(token.get("barcode") or "").strip().upper()
            if barcode:
                try:
                    product = self.get_product_by_barcode(barcode)
                except HTTPException:
                    product = None
                if product:
                    category_main = str(product.get("category_main") or "").strip()
                    category_sub = str(product.get("category_sub") or "").strip()

            if not category_main and not category_sub:
                category_main, category_sub = self._split_category_name_parts(str(token.get("category_name") or ""))
            if not category_main and not category_sub:
                continue

            bucket = self._ensure_transfer_recommendation_bucket(metrics, category_main, category_sub)
            bucket["dispatchable_token_qty"] += 1

        for stock_key, stock_row in self.store_stock.items():
            current_store, barcode = stock_key.split("||", 1)
            if current_store.strip().upper() != normalized_store:
                continue
            current_qty = int(stock_row.get("qty_on_hand", 0) or 0)
            if current_qty <= 0:
                continue
            try:
                product = self.get_product_by_barcode(barcode)
            except HTTPException:
                continue
            bucket = self._ensure_transfer_recommendation_bucket(
                metrics,
                product.get("category_main", ""),
                product.get("category_sub", ""),
            )
            bucket["current_store_qty"] += current_qty

        pending_store_statuses = {"pending_store_print", "print_failed", "print_queued", "printed_in_store"}
        for token in self.item_barcode_tokens.values():
            if str(token.get("store_code") or "").strip().upper() != normalized_store:
                continue
            if str(token.get("status") or "").strip().lower() not in pending_store_statuses:
                continue
            bale_no = str(token.get("store_dispatch_bale_no") or "").strip().upper()
            bale = self.store_dispatch_bales.get(bale_no) if bale_no else None
            bale_status = str((bale or {}).get("status") or "").strip().lower()
            if not str(token.get("accepted_by") or "").strip() and bale_status in {"created", "packed", "labelled", "in_transit"}:
                continue
            try:
                product = self.get_product_by_barcode(str(token.get("barcode") or "").strip().upper())
            except HTTPException:
                continue
            bucket = self._ensure_transfer_recommendation_bucket(
                metrics,
                product.get("category_main", ""),
                product.get("category_sub", ""),
            )
            bucket["pending_shelving_qty"] += 1

        window_end = datetime.now(timezone.utc)
        window_start = window_end - timedelta(days=14)
        for sale in self.sales_transactions:
            if str(sale.get("store_code") or "").strip().upper() != normalized_store:
                continue
            sale_status = str(sale.get("sale_status") or "").strip().lower()
            if sale_status in {"voided", "cancelled"}:
                continue
            sold_at = self._parse_transfer_recommendation_datetime(sale.get("sold_at") or sale.get("created_at"))
            if sold_at is None or sold_at < window_start or sold_at > window_end:
                continue
            for item in sale.get("items", []):
                qty = int(item.get("qty", 0) or 0)
                if qty <= 0:
                    continue
                try:
                    product = self.get_product_by_barcode(str(item.get("barcode") or "").strip().upper())
                except HTTPException:
                    continue
                bucket = self._ensure_transfer_recommendation_bucket(
                    metrics,
                    product.get("category_main", ""),
                    product.get("category_sub", ""),
                )
                bucket["recent_14d_sales_qty"] += qty

        for bale in self.list_store_dispatch_bales(store_code=normalized_store):
            if str(bale.get("status") or "").strip().lower() != "in_transit":
                continue
            for token_no in bale.get("token_nos", []):
                token = self.item_barcode_tokens.get(str(token_no or "").strip().upper())
                if not token:
                    continue
                try:
                    product = self.get_product_by_barcode(str(token.get("barcode") or "").strip().upper())
                except HTTPException:
                    continue
                bucket = self._ensure_transfer_recommendation_bucket(
                    metrics,
                    product.get("category_main", ""),
                    product.get("category_sub", ""),
                )
                bucket["in_transit_qty"] += 1

        for bucket in metrics.values():
            dispatchable_token_qty = int(bucket.get("dispatchable_token_qty", 0) or 0)
            if dispatchable_token_qty <= 0:
                continue
            bucket["warehouse_available_qty"] = max(
                int(bucket.get("warehouse_available_qty", 0) or 0),
                dispatchable_token_qty,
            )
            bucket["source_count"] = max(int(bucket.get("source_count", 0) or 0), 1)

        return metrics

    def create_transfer_recommendation(self, payload: dict[str, Any]) -> dict[str, Any]:
        store = self._ensure_store_exists(payload["to_store_code"])
        actor = self._require_user_role(
            payload["created_by"],
            {"store_manager", "warehouse_supervisor", "area_supervisor"},
            store_code=store["code"],
        )
        preferred_categories = [row.strip().lower() for row in payload.get("preferred_categories", []) if row.strip()]
        recommendation_no = (
            f"TRR-{datetime.now(timezone.utc).strftime('%Y%m%d')}-"
            f"{next(self._transfer_recommendation_ids):03d}"
        )
        candidates: list[dict[str, Any]] = []
        metrics = self._collect_transfer_recommendation_metrics(payload["from_warehouse_code"], store["code"])

        for bucket in metrics.values():
            category_tokens = {
                self._normalize_transfer_category_value(bucket.get("category_main")),
                self._normalize_transfer_category_value(bucket.get("category_sub")),
            }
            if preferred_categories and not category_tokens.intersection(preferred_categories):
                continue

            warehouse_available_qty = int(bucket.get("warehouse_available_qty", 0) or 0)
            if warehouse_available_qty <= 0:
                continue
            current_store_qty = int(bucket.get("current_store_qty", 0) or 0)
            pending_shelving_qty = int(bucket.get("pending_shelving_qty", 0) or 0)
            in_transit_qty = int(bucket.get("in_transit_qty", 0) or 0)
            recent_sales_qty = int(bucket.get("recent_14d_sales_qty", 0) or 0)
            avg_daily_sales_qty = round(recent_sales_qty / 14, 2)
            effective_store_qty = current_store_qty + pending_shelving_qty + in_transit_qty
            requested_qty = min(warehouse_available_qty, max(recent_sales_qty - effective_store_qty, 0))
            if requested_qty <= 0:
                continue

            score = (
                requested_qty * 20
                + recent_sales_qty * 10
                + (60 if current_store_qty == 0 else 0)
                + (40 if effective_store_qty == 0 else 0)
            )
            candidates.append(
                {
                    "recommendation_key": bucket["recommendation_key"],
                    "category_main": bucket["category_main"],
                    "category_sub": bucket["category_sub"],
                    "warehouse_available_qty": warehouse_available_qty,
                    "current_store_qty": current_store_qty,
                    "pending_shelving_qty": pending_shelving_qty,
                    "in_transit_qty": in_transit_qty,
                    "effective_store_qty": effective_store_qty,
                    "recent_14d_sales_qty": recent_sales_qty,
                    "avg_daily_sales_qty": avg_daily_sales_qty,
                    "requested_qty": requested_qty,
                    "suggested_qty": requested_qty,
                    "source_count": int(bucket.get("source_count", 0) or 0),
                    "reason": (
                        f"近 14 天销量 {recent_sales_qty} 件，门店现货 {current_store_qty} 件，"
                        f"待上架 {pending_shelving_qty} 件，在途 {in_transit_qty} 件，"
                        f"按卖多少补多少逻辑，扣掉现货、待上架和在途后建议补 {requested_qty} 件。"
                    ),
                    "score": score,
                }
            )

        candidates.sort(
            key=lambda item: (
                -int(item["score"]),
                -int(item["requested_qty"]),
                self._build_transfer_recommendation_key(item.get("category_main"), item.get("category_sub")),
            )
        )
        items = candidates[: payload["max_suggestions"]]
        analysis_summary = {
            "candidate_count": len(candidates),
            "selected_count": len(items),
            "recent_sales_window_days": 14,
            "replenishment_mode": "sales_sell_through",
            "total_requested_qty": sum(item["requested_qty"] for item in items),
            "total_recent_14d_sales_qty": sum(item["recent_14d_sales_qty"] for item in items),
            "preferred_categories": payload.get("preferred_categories", []),
            "source_basis": [
                "recent_14d_sales",
                "current_store_stock",
                "pending_shelving",
                "in_transit_dispatch_bales",
                "sales_sell_through_gap",
            ],
            "notes": [
                "建议先按类目形成补货需求，再由仓库按库存拆成实际商品行执行。",
                "区域经理只保留例外审批和监督，不再作为日常逐单手工建单人。",
                "当前按卖多少补多少：近 14 天销量减去门店现货、待上架和在途，得出建议补货件数。",
            ],
        }
        recommendation = {
            "recommendation_no": recommendation_no,
            "from_warehouse_code": payload["from_warehouse_code"],
            "to_store_code": store["code"],
            "created_by": actor["username"],
            "created_at": now_iso(),
            "preferred_categories": payload.get("preferred_categories", []),
            "analysis_summary": analysis_summary,
            "items": items,
        }
        self.transfer_recommendations[recommendation_no] = recommendation
        self._log_event(
            event_type="transfer.recommendation_created",
            entity_type="transfer_recommendation",
            entity_id=recommendation_no,
            actor=actor["username"],
            summary=f"Transfer recommendation {recommendation_no} created for {store['code']}",
            details={
                "selected_count": len(items),
                "total_requested_qty": analysis_summary["total_requested_qty"],
                "preferred_categories": recommendation["preferred_categories"],
            },
        )
        self._persist()
        return recommendation

    def create_transfer_from_recommendation(self, recommendation_no: str, payload: dict[str, Any]) -> dict[str, Any]:
        recommendation = self.get_transfer_recommendation(recommendation_no)
        actor = self._require_user_role(
            payload["created_by"],
            {"store_manager"},
            store_code=str(recommendation.get("to_store_code") or "").strip().upper() or None,
        )
        selected_keys = {
            str(row or "").strip().lower()
            for row in payload.get("selected_demand_keys", [])
            if str(row or "").strip()
        }
        selected_barcodes = {row.strip().upper() for row in payload.get("selected_barcodes", []) if row.strip()}
        items: list[dict[str, Any]] = []
        for item in recommendation["items"]:
            recommendation_key = str(
                item.get("recommendation_key")
                or self._build_transfer_recommendation_key(item.get("category_main"), item.get("category_sub"))
            ).strip().lower()
            barcode = str(item.get("barcode") or "").strip().upper()
            if selected_keys and recommendation_key not in selected_keys:
                continue
            if selected_barcodes and barcode and barcode not in selected_barcodes:
                continue
            requested_qty = int(item.get("requested_qty", item.get("suggested_qty", 0)) or 0)
            if requested_qty <= 0:
                continue
            category_main = str(item.get("category_main") or "").strip()
            category_sub = str(item.get("category_sub") or "").strip()
            if category_main and category_sub:
                items.append(
                    {
                        "category_main": category_main,
                        "category_sub": category_sub,
                        "requested_qty": requested_qty,
                    }
                )
            elif barcode:
                items.append({"barcode": barcode, "requested_qty": requested_qty})
        if not items:
            raise HTTPException(status_code=400, detail="No recommendation items selected")
        order = self.create_transfer_order(
            {
                "from_warehouse_code": recommendation["from_warehouse_code"],
                "to_store_code": recommendation["to_store_code"],
                "created_by": actor["username"],
                "approval_required": payload["approval_required"],
                "items": items,
            }
        )
        self._log_event(
            event_type="transfer.created_from_recommendation",
            entity_type="transfer_order",
            entity_id=order["transfer_no"],
            actor=actor["username"],
            summary=f"Transfer {order['transfer_no']} created from recommendation {recommendation_no}",
            details={"recommendation_no": recommendation_no, "item_count": len(items)},
        )
        self._persist()
        return order

    def _normalize_transfer_category_value(self, value: Any) -> str:
        return str(value or "").strip().lower()

    def _merge_transfer_demand_line(
        self,
        demand_lines: list[dict[str, Any]],
        category_main: str,
        category_sub: str,
        grade: str,
        requested_qty: int,
    ) -> None:
        normalized_main = self._normalize_transfer_category_value(category_main)
        normalized_sub = self._normalize_transfer_category_value(category_sub)
        normalized_grade = self._normalize_transfer_category_value(grade)
        for row in demand_lines:
            if (
                self._normalize_transfer_category_value(row.get("category_main")) == normalized_main
                and self._normalize_transfer_category_value(row.get("category_sub")) == normalized_sub
                and self._normalize_transfer_category_value(row.get("grade")) == normalized_grade
            ):
                row["requested_qty"] += requested_qty
                return
        demand_lines.append(
            {
                "category_main": str(category_main or "").strip(),
                "category_sub": str(category_sub or "").strip(),
                "grade": str(grade or "").strip().upper(),
                "requested_qty": requested_qty,
            }
        )

    def _merge_transfer_resolved_item(
        self,
        merged_items: dict[str, dict[str, Any]],
        product: dict[str, Any],
        grade: str,
        requested_qty: int,
    ) -> None:
        barcode = product["barcode"]
        normalized_grade = str(grade or "").strip().upper()
        merged_key = f"{barcode}||{normalized_grade}"
        existing = merged_items.get(merged_key)
        if existing:
            existing["requested_qty"] += requested_qty
            return
        merged_items[merged_key] = {
            "barcode": barcode,
            "product_name": product["product_name"],
            "category_main": product.get("category_main", ""),
            "category_sub": product.get("category_sub", ""),
            "grade": normalized_grade,
            "requested_qty": requested_qty,
            "approved_qty": 0,
            "received_qty": 0,
            "discrepancy_qty": 0,
            "lot_allocations": [],
            "received_lot_allocations": [],
            "pending_restore_allocations": [],
        }

    def _list_warehouse_transfer_candidates(
        self,
        warehouse_code: str,
        category_main: str,
        category_sub: str,
    ) -> list[dict[str, Any]]:
        normalized_warehouse = str(warehouse_code or "").strip().upper()
        normalized_main = self._normalize_transfer_category_value(category_main)
        normalized_sub = self._normalize_transfer_category_value(category_sub)
        rows: list[dict[str, Any]] = []
        for stock_key, stock_row in self.warehouse_stock.items():
            current_warehouse, barcode = stock_key.split("||", 1)
            if current_warehouse.strip().upper() != normalized_warehouse:
                continue
            available_qty = int(stock_row.get("qty_on_hand", 0) or 0)
            if available_qty <= 0:
                continue
            product = self.get_product_by_barcode(barcode)
            if (
                self._normalize_transfer_category_value(product.get("category_main")) != normalized_main
                or self._normalize_transfer_category_value(product.get("category_sub")) != normalized_sub
            ):
                continue
            rows.append(
                {
                    "barcode": barcode,
                    "product": product,
                    "available_qty": available_qty,
                }
            )
        return sorted(rows, key=lambda row: (-int(row["available_qty"]), row["barcode"]))

    def _resolve_transfer_order_items(
        self,
        warehouse_code: str,
        raw_items: list[dict[str, Any]],
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        pending_usage: dict[str, int] = defaultdict(int)
        merged_items: dict[str, dict[str, Any]] = {}
        demand_lines: list[dict[str, Any]] = []

        for raw_item in raw_items:
            requested_qty = int(raw_item.get("requested_qty", 0) or 0)
            if requested_qty <= 0:
                raise HTTPException(status_code=400, detail="Transfer requested_qty must be greater than 0")
            grade = str(raw_item.get("grade") or "").strip().upper()

            barcode = str(raw_item.get("barcode") or "").strip().upper()
            if barcode:
                product = self.get_product_by_barcode(barcode)
                stock_key = f"{warehouse_code}||{product['barcode']}"
                warehouse_row = self.warehouse_stock.get(stock_key)
                available_qty = max(0, int(warehouse_row.get("qty_on_hand", 0) or 0) - pending_usage[product["barcode"]]) if warehouse_row else 0
                if available_qty < requested_qty:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Insufficient warehouse stock for {product['barcode']}: "
                            f"requested {requested_qty}, available {available_qty}"
                        ),
                    )
                pending_usage[product["barcode"]] += requested_qty
                self._merge_transfer_demand_line(
                    demand_lines,
                    product.get("category_main", ""),
                    product.get("category_sub", ""),
                    grade,
                    requested_qty,
                )
                self._merge_transfer_resolved_item(merged_items, product, grade, requested_qty)
                continue

            category_main = str(raw_item.get("category_main") or "").strip()
            category_sub = str(raw_item.get("category_sub") or "").strip()
            if not category_main or not category_sub:
                raise HTTPException(
                    status_code=400,
                    detail="Each transfer demand line must include barcode or category_main/category_sub",
                )

            self._merge_transfer_demand_line(demand_lines, category_main, category_sub, grade, requested_qty)
            candidates = self._list_warehouse_transfer_candidates(warehouse_code, category_main, category_sub)
            remaining_qty = requested_qty
            for candidate in candidates:
                free_qty = max(0, int(candidate["available_qty"]) - pending_usage[candidate["barcode"]])
                if free_qty <= 0:
                    continue
                take_qty = min(remaining_qty, free_qty)
                pending_usage[candidate["barcode"]] += take_qty
                self._merge_transfer_resolved_item(merged_items, candidate["product"], grade, take_qty)
                remaining_qty -= take_qty
                if remaining_qty <= 0:
                    break

        items = sorted(
            merged_items.values(),
            key=lambda row: (
                str(row.get("category_main") or "").lower(),
                str(row.get("category_sub") or "").lower(),
                str(row.get("grade") or "").lower(),
                str(row.get("barcode") or ""),
            ),
        )
        demand_lines.sort(
            key=lambda row: (
                self._normalize_transfer_category_value(row.get("category_main")),
                self._normalize_transfer_category_value(row.get("category_sub")),
                self._normalize_transfer_category_value(row.get("grade")),
            )
        )
        return demand_lines, items

    def create_transfer_print_job(self, transfer_no: str, payload: dict[str, Any]) -> dict[str, Any]:
        actor = self._require_user_role(payload["requested_by"], {"warehouse_clerk", "warehouse_supervisor"})
        order = self.get_transfer_order(transfer_no)
        job = {
            "id": next(self._print_job_ids),
            "job_type": "transfer_order",
            "status": "queued",
            "created_at": now_iso(),
            "product_id": None,
            "document_no": transfer_no,
            "barcode": "",
            "product_name": f"{order['from_warehouse_code']} -> {order['to_store_code']}",
            "template_code": "transfer_order_default",
            "label_size": "",
            "printed_at": None,
            "printed_by": "",
            "error_message": "",
            "print_payload": {
                "document_type": "transfer_order",
                "transfer_no": transfer_no,
                "from_warehouse_code": order["from_warehouse_code"],
                "to_store_code": order["to_store_code"],
                "status": order["status"],
                "items": [
                    {
                        "barcode": item["barcode"],
                        "product_name": item["product_name"],
                        "category_main": item.get("category_main", ""),
                        "category_sub": item.get("category_sub", ""),
                        "requested_qty": item["requested_qty"],
                        "approved_qty": item["approved_qty"],
                        "received_qty": item["received_qty"],
                    }
                    for item in order["items"]
                ],
                "demand_lines": list(order.get("demand_lines", [])),
                "signatures": [
                    "warehouse_picker",
                    "dispatcher",
                    "store_manager",
                ],
            },
            **payload,
        }
        self.print_jobs.append(job)
        self._log_event(
            event_type="print.transfer_queued",
            entity_type="print_job",
            entity_id=str(job["id"]),
            actor=actor["username"],
            summary=f"Transfer print queued for {transfer_no}",
            details=job["print_payload"],
        )
        self._persist()
        return job

    def create_transfer_dispatch_bundle(self, transfer_no: str, payload: dict[str, Any]) -> dict[str, Any]:
        actor = self._require_user_role(payload["requested_by"], {"warehouse_clerk", "warehouse_supervisor"})
        order = self.get_transfer_order(transfer_no)
        if order["approval_status"] != "approved" and order["status"] not in {"approved", "dispatched", "received"}:
            raise HTTPException(status_code=400, detail="Transfer must be approved before dispatch printing")

        transfer_job = self.create_transfer_print_job(
            transfer_no,
            {
                "copies": payload["copies"],
                "printer_name": payload["printer_name"],
                "requested_by": actor["username"],
            },
        )
        label_jobs: list[dict[str, Any]] = []
        for item in order["items"]:
            copies = item["approved_qty"] if payload["label_copies_mode"] == "approved_qty" else 1
            if copies <= 0:
                continue
            label_jobs.append(
                self._build_label_print_job(
                    barcode=item["barcode"],
                    copies=copies,
                    printer_name=payload["printer_name"],
                    requested_by=actor["username"],
                    source_document_no=transfer_no,
                )
            )
        dispatch_bales = self._build_transfer_dispatch_bales(
            order,
            actor["username"],
            grouping_mode=payload.get("grouping_mode", "by_category"),
            max_items_per_bale=int(payload.get("max_items_per_bale") or 30),
        )
        self._log_event(
            event_type="print.dispatch_bundle_queued",
            entity_type="transfer_order",
            entity_id=transfer_no,
            actor=actor["username"],
            summary=f"Dispatch print bundle queued for {transfer_no}",
            details={"transfer_print_job_id": transfer_job["id"], "label_job_count": len(label_jobs), "dispatch_bale_count": len(dispatch_bales)},
        )
        self._persist()
        return {
            "transfer_no": transfer_no,
            "status": order.get("status", ""),
            "delivery_batch_no": order.get("delivery_batch_no", ""),
            "shipment_session_no": order.get("shipment_session_no", ""),
            "transfer_print_job": transfer_job,
            "label_print_jobs": label_jobs,
            "total_label_copies": sum(job["copies"] for job in label_jobs),
            "store_dispatch_bales": dispatch_bales,
            "generated_bale_count": len(dispatch_bales),
        }

    def list_store_delivery_execution_orders(self, transfer_no: Optional[str] = None) -> list[dict[str, Any]]:
        rows = [
            self._normalize_store_delivery_execution_order(row)
            for row in self.store_delivery_execution_orders.values()
        ]
        if transfer_no:
            normalized_transfer_no = str(transfer_no or "").strip().upper()
            rows = [
                row
                for row in rows
                if str(row.get("source_transfer_no") or "").strip().upper() == normalized_transfer_no
            ]
        rows.sort(
            key=lambda row: (
                str(row.get("created_at") or ""),
                str(row.get("execution_order_no") or ""),
            ),
            reverse=True,
        )
        return rows

    def create_store_delivery_execution_order(self, transfer_no: str, payload: dict[str, Any]) -> dict[str, Any]:
        order = self.get_transfer_order(transfer_no)
        actor = self._require_user_role(payload["created_by"], {"warehouse_clerk", "warehouse_supervisor"})
        if order["approval_status"] != "approved" and order["status"] not in {"approved", "dispatched", "received", "receiving_in_progress"}:
            raise HTTPException(status_code=400, detail="Transfer must be approved before creating store delivery execution order")

        transfer_no_upper = str(transfer_no or "").strip().upper()
        existing = next(
            (
                row
                for row in self.store_delivery_execution_orders.values()
                if str(row.get("source_transfer_no") or "").strip().upper() == transfer_no_upper
                and str(row.get("status") or "").strip().lower() != "cancelled"
            ),
            None,
        )
        if existing:
            return self._normalize_store_delivery_execution_order(existing)

        self._rebuild_store_dispatch_bales()
        dispatch_rows = [
            row
            for row in self.store_dispatch_bales.values()
            if str(row.get("transfer_no") or "").strip().upper() == transfer_no_upper
        ]
        if not dispatch_rows:
            raise HTTPException(
                status_code=409,
                detail="该补货申请还没有可送店包裹，不能生成正式门店送货执行单 barcode。请先完成仓库核对和打包。",
            )
        source_store_prep_codes = sorted(
            {
                str(code or "").strip().upper()
                for row in dispatch_rows
                for code in (row.get("source_bales") if isinstance(row.get("source_bales"), list) else [])
                if str(code or "").strip().upper().startswith("SDB")
            }
        )
        source_gap_fill_codes = sorted(
            {
                str(code or "").strip().upper()
                for row in dispatch_rows
                for code in (row.get("source_bales") if isinstance(row.get("source_bales"), list) else [])
                if str(code or "").strip().upper().startswith("LPK")
            }
        )
        execution_order_no = self._store_delivery_execution_order_no()
        created_at = now_iso()
        sdo_packages: list[dict[str, Any]] = []
        known_package_item_counts: list[int] = []
        for row in dispatch_rows:
            raw_item_count = row.get("item_count")
            parsed_item_count: Optional[int] = None
            if raw_item_count is not None and raw_item_count != "":
                try:
                    candidate = int(float(raw_item_count))
                    if candidate >= 0:
                        parsed_item_count = candidate
                except (TypeError, ValueError):
                    parsed_item_count = None
            if parsed_item_count is not None:
                known_package_item_counts.append(parsed_item_count)
            sdo_packages.append(
                {
                    "source_type": "LPK" if str(row.get("bale_no") or "").strip().upper().startswith("LPK") else "SDB",
                    "source_code": str(row.get("bale_no") or "").strip().upper(),
                    "item_count": parsed_item_count,
                    "category_summary": str(row.get("category_summary") or row.get("category_name") or "").strip(),
                    "category_name": str(row.get("category_name") or "").strip(),
                }
            )
        total_item_count: Optional[int] = None
        if sdo_packages and len(known_package_item_counts) == len(sdo_packages):
            total_item_count = sum(known_package_item_counts)
        created = self._normalize_store_delivery_execution_order(
            {
                "execution_order_no": execution_order_no,
                "official_delivery_barcode": execution_order_no,
                "source_transfer_no": transfer_no_upper,
                "replenishment_request_no": transfer_no_upper,
                "from_warehouse_code": str(order.get("from_warehouse_code") or "").strip().upper(),
                "to_store_code": str(order.get("to_store_code") or "").strip().upper(),
                "source_store_prep_bale_codes": source_store_prep_codes,
                "source_gap_fill_task_codes": source_gap_fill_codes,
                "package_count": len(dispatch_rows),
                "total_item_count": total_item_count,
                "packages": sdo_packages,
                "status": "printed" if payload.get("mark_as_printed") else "pending_print",
                "created_by": actor["username"],
                "created_at": created_at,
                "printed_at": created_at if payload.get("mark_as_printed") else None,
                "notes": str(payload.get("notes") or payload.get("note") or "").strip(),
            }
        )
        self.store_delivery_execution_orders[execution_order_no] = created
        order["store_delivery_execution_order_no"] = execution_order_no
        order["official_delivery_barcode"] = execution_order_no
        order["store_delivery_execution_status"] = created["status"]
        order["store_delivery_execution_created_at"] = created_at
        self._log_event(
            event_type="transfer.store_delivery_execution.created",
            entity_type="store_delivery_execution_order",
            entity_id=execution_order_no,
            actor=actor["username"],
            summary=f"Store delivery execution order {execution_order_no} created for {transfer_no_upper}",
            details={
                "source_transfer_no": transfer_no_upper,
                "package_count": created["package_count"],
                "official_delivery_barcode": execution_order_no,
            },
        )
        self._persist()
        return created

    def list_print_jobs(self, status: Optional[str] = None) -> list[dict[str, Any]]:
        if not status:
            return self.print_jobs
        normalized = status.strip().lower()
        return [job for job in self.print_jobs if job["status"].lower() == normalized]

    def create_bale_label_print_station_job(self, payload: dict[str, Any]) -> dict[str, Any]:
        actor = self._require_user_role(
            payload["requested_by"],
            {"warehouse_clerk", "warehouse_supervisor", "area_supervisor", "store_manager", "store_clerk"},
        )
        job = {
            "id": next(self._print_station_job_ids),
            "label_type": "BALE_LABEL",
            "code": str(payload.get("code") or "").strip().upper(),
            "supplier": str(payload.get("supplier") or "").strip(),
            "category": str(payload.get("category") or "").strip(),
            "subcategory": str(payload.get("subcategory") or "").strip(),
            "batch": str(payload.get("batch") or "").strip(),
            "ship_reference": str(payload.get("ship_reference") or "").strip(),
            "total_number": int(payload.get("total_number") or 0),
            "sequence_number": int(payload.get("sequence_number") or 0),
            "requested_by": actor["username"],
            "requested_at": now_iso(),
            "status": "pending",
            "station_id": "",
            "claimed_at": None,
            "printed_at": None,
            "error_message": "",
        }
        if not job["code"]:
            raise HTTPException(status_code=400, detail="Bale print job code is required")
        self.print_station_jobs.append(job)
        self._persist()
        return job

    def list_pending_print_station_jobs(self, station_id: str = "") -> list[dict[str, Any]]:
        _ = station_id
        return [job for job in self.print_station_jobs if str(job.get("status") or "").lower() == "pending"]

    def _get_print_station_job(self, job_id: int) -> dict[str, Any]:
        for job in self.print_station_jobs:
            if int(job.get("id", 0)) == int(job_id):
                return job
        raise HTTPException(status_code=404, detail=f"Unknown print-station job {job_id}")

    def claim_print_station_job(self, job_id: int, station_id: str) -> dict[str, Any]:
        job = self._get_print_station_job(job_id)
        if job["status"] != "pending":
            raise HTTPException(status_code=400, detail=f"Print-station job {job_id} is not pending")
        job["status"] = "claimed"
        job["station_id"] = str(station_id or "").strip()
        job["claimed_at"] = now_iso()
        job["error_message"] = ""
        self._persist()
        return job

    def complete_print_station_job(self, job_id: int, station_id: str) -> dict[str, Any]:
        job = self._get_print_station_job(job_id)
        if job["status"] not in {"pending", "claimed"}:
            raise HTTPException(status_code=400, detail=f"Print-station job {job_id} cannot be completed")
        job["status"] = "printed"
        job["station_id"] = str(station_id or "").strip()
        job["printed_at"] = now_iso()
        if not job.get("claimed_at"):
            job["claimed_at"] = job["printed_at"]
        job["error_message"] = ""
        self._persist()
        return job

    def fail_print_station_job(self, job_id: int, station_id: str, error_message: str) -> dict[str, Any]:
        job = self._get_print_station_job(job_id)
        if job["status"] == "printed":
            raise HTTPException(status_code=400, detail=f"Print-station job {job_id} already printed")
        job["status"] = "failed"
        job["station_id"] = str(station_id or "").strip()
        job["error_message"] = str(error_message or "").strip()
        if not job["error_message"]:
            raise HTTPException(status_code=400, detail="error_message is required")
        self._persist()
        return job

    def get_print_job(self, job_id: int) -> dict[str, Any]:
        for job in self.print_jobs:
            if job["id"] == job_id:
                return job
        raise HTTPException(status_code=404, detail=f"Unknown print job {job_id}")

    def mark_print_job_printed(self, job_id: int, printed_by: str) -> dict[str, Any]:
        job = self.get_print_job(job_id)
        allowed_roles = {"warehouse_clerk", "warehouse_supervisor"}
        if str(job.get("job_type") or "") == "item_token_label":
            allowed_roles |= {"store_manager", "store_clerk", "area_supervisor"}
        actor = self._require_user_role(printed_by, allowed_roles)
        if job["status"] != "queued":
            raise HTTPException(status_code=400, detail=f"Print job {job_id} is not queued")
        job["status"] = "printed"
        job["printed_at"] = now_iso()
        job["printed_by"] = actor["username"]
        job["error_message"] = ""
        if str(job.get("job_type") or "") == "bale_barcode_label":
            bale = self._find_raw_bale_by_reference_no_defaults(str(job.get("barcode") or "").strip().upper())
            if bale:
                bale["printed_at"] = job["printed_at"]
                bale["printed_by"] = actor["username"]
                bale["updated_at"] = job["printed_at"]
        if str(job.get("job_type") or "") == "item_token_label":
            token_no = str(job.get("barcode") or "").strip().upper()
            token = self.item_barcode_tokens.get(token_no)
            if token:
                self._enforce_store_clerk_assignment(
                    actor,
                    str(token.get("assigned_employee") or "").strip(),
                    f"门店配货 bale {str(token.get('store_dispatch_bale_no') or '').strip().upper() or token_no}",
                )
                token["status"] = "printed_in_store"
                token["identity_no"] = token_no
                barcode_value = str((job.get("print_payload") or {}).get("barcode_value") or token.get("barcode_value") or token_no).strip().upper()
                token["barcode_value"] = barcode_value
                token["printed_at"] = job["printed_at"]
                token["printed_by"] = actor["username"]
                token["updated_at"] = job["printed_at"]
                token["final_item_barcode"] = {
                    "barcode_value": barcode_value,
                    "identity_id": str(token.get("identity_no") or token_no).strip().upper(),
                    "printed_at": job["printed_at"],
                    "printed_by": actor["username"],
                    "status": token["status"],
                }
                product = self._ensure_item_token_product_exists(
                    token_no,
                    actor=actor["username"],
                    rack_code=str(token.get("store_rack_code") or token.get("suggested_rack_code") or "").strip().upper(),
                )
                if token.get("selling_price_kes") is not None:
                    product["launch_price"] = round(float(token.get("selling_price_kes") or 0.0), 2)
                if str(token.get("store_rack_code") or "").strip():
                    product["rack_code"] = str(token.get("store_rack_code") or "").strip().upper()
                product["updated_at"] = job["printed_at"]
                bale_no = str(token.get("store_dispatch_bale_no") or "").strip().upper()
                if bale_no and bale_no in self.store_dispatch_bales:
                    self._refresh_store_dispatch_bale_summary(self.store_dispatch_bales[bale_no])
        self._log_event(
            event_type="print.job_completed",
            entity_type="print_job",
            entity_id=str(job_id),
            actor=actor["username"],
            summary=f"Print job {job_id} marked printed",
            details={"job_type": job["job_type"], "document_no": job.get("document_no", "")},
        )
        self._persist()
        return job

    def mark_print_job_failed(self, job_id: int, failed_by: str, note: str) -> dict[str, Any]:
        job = self.get_print_job(job_id)
        allowed_roles = {"warehouse_clerk", "warehouse_supervisor"}
        if str(job.get("job_type") or "") == "item_token_label":
            allowed_roles |= {"store_manager", "store_clerk", "area_supervisor"}
        actor = self._require_user_role(failed_by, allowed_roles)
        if job["status"] != "queued":
            raise HTTPException(status_code=400, detail=f"Print job {job_id} is not queued")
        job["status"] = "failed"
        job["printed_at"] = now_iso()
        job["printed_by"] = actor["username"]
        job["error_message"] = note
        if str(job.get("job_type") or "") == "item_token_label":
            token_no = str(job.get("barcode") or "").strip().upper()
            token = self.item_barcode_tokens.get(token_no)
            if token:
                self._enforce_store_clerk_assignment(
                    actor,
                    str(token.get("assigned_employee") or "").strip(),
                    f"门店配货 bale {str(token.get('store_dispatch_bale_no') or '').strip().upper() or token_no}",
                )
                token["status"] = "print_failed"
                token["updated_at"] = job["printed_at"]
                bale_no = str(token.get("store_dispatch_bale_no") or "").strip().upper()
                if bale_no and bale_no in self.store_dispatch_bales:
                    self._refresh_store_dispatch_bale_summary(self.store_dispatch_bales[bale_no])
        self._log_event(
            event_type="print.job_failed",
            entity_type="print_job",
            entity_id=str(job_id),
            actor=actor["username"],
            summary=f"Print job {job_id} marked failed",
            details={"job_type": job["job_type"], "note": note},
        )
        self._persist()
        return job

    def list_inventory_adjustments(self) -> list[dict[str, Any]]:
        return self.inventory_adjustments

    def list_inventory_movements(
        self,
        barcode: Optional[str] = None,
        location_code: Optional[str] = None,
        movement_type: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        rows = list(self.inventory_movements)
        if barcode:
            rows = [row for row in rows if row["barcode"] == barcode.strip()]
        if location_code:
            normalized_location = location_code.strip().upper()
            rows = [row for row in rows if row["location_code"].upper() == normalized_location]
        if movement_type:
            normalized_type = movement_type.strip().lower()
            rows = [row for row in rows if row["movement_type"].lower() == normalized_type]
        return sorted(rows, key=lambda row: row["id"], reverse=True)

    def create_transfer_order(self, payload: dict[str, Any]) -> dict[str, Any]:
        store = self._ensure_store_exists(payload["to_store_code"])
        actor = self._require_user_role(
            payload["created_by"],
            {"store_manager", "warehouse_supervisor", "area_supervisor"},
            store_code=store["code"],
        )
        transfer_no = f"TO-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{next(self._transfer_ids):03d}"
        demand_lines, items = self._resolve_transfer_order_items(payload["from_warehouse_code"], payload["items"])

        order = {
            "transfer_no": transfer_no,
            "from_warehouse_code": payload["from_warehouse_code"],
            "to_store_code": store["code"],
            "required_arrival_date": str(payload.get("required_arrival_date") or "").strip(),
            "created_by": payload["created_by"],
            "approval_required": payload["approval_required"],
            "status": "submitted" if payload["approval_required"] else "approved",
            "approval_status": "pending" if payload["approval_required"] else "approved",
            "created_at": now_iso(),
            "submitted_at": now_iso(),
            "approved_at": None,
            "approved_by": None,
            "received_at": None,
            "received_by": None,
            "closed_at": None,
            "delivery_batch_no": "",
            "shipment_session_no": "",
            "store_receipt_status": "not_started",
            "store_delivery_execution_order_no": "",
            "official_delivery_barcode": "",
            "store_delivery_execution_status": "",
            "store_delivery_execution_created_at": None,
            "discrepancy_approval_status": None,
            "discrepancy_approved_by": None,
            "discrepancy_approved_at": None,
            "discrepancies": [],
            "demand_lines": demand_lines,
            "items": items,
        }

        if not payload["approval_required"]:
            self._reserve_transfer_inventory(order, actor=actor["username"])

        self.transfer_orders[transfer_no] = order
        self._log_event(
            event_type="transfer.created",
            entity_type="transfer_order",
            entity_id=transfer_no,
            actor=actor["username"],
            summary=f"Transfer {transfer_no} created for {store['code']}",
            details={"item_count": len(items), "approval_required": payload["approval_required"]},
        )
        self._persist()
        return order

    def list_transfer_orders(self) -> list[dict[str, Any]]:
        return list(self.transfer_orders.values())

    def get_transfer_order(self, transfer_no: str) -> dict[str, Any]:
        order = self.transfer_orders.get(transfer_no)
        if not order:
            raise HTTPException(status_code=404, detail=f"Unknown transfer order {transfer_no}")
        return order

    def _transfer_requested_qty(self, order: Optional[dict[str, Any]]) -> int:
        if not order:
            return 0
        demand_lines = order.get("demand_lines") or []
        if demand_lines:
            return sum(int(row.get("requested_qty") or 0) for row in demand_lines)
        return sum(int(row.get("requested_qty") or 0) for row in order.get("items", []))

    def create_picking_wave(self, payload: dict[str, Any]) -> dict[str, Any]:
        selected_request_nos = [
            str(no or "").strip().upper() for no in payload.get("selected_replenishment_request_nos", [])
            if str(no or "").strip()
        ]
        if not selected_request_nos:
            raise HTTPException(status_code=400, detail="selected_replenishment_request_nos must not be empty")
        transfer_orders = [self.transfer_orders.get(no) for no in selected_request_nos]
        missing = [selected_request_nos[idx] for idx, row in enumerate(transfer_orders) if not row]
        if missing:
            raise HTTPException(status_code=404, detail=f"Unknown transfer order(s): {', '.join(missing)}")

        stores_included = sorted({str(order["to_store_code"]) for order in transfer_orders if order})
        total_requested_qty = sum(self._transfer_requested_qty(order) for order in transfer_orders)
        total_shortage_qty = total_requested_qty
        wave_no = f"WAVE-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{next(self._picking_wave_ids):03d}"
        wave = {
            "wave_no": wave_no,
            "wave_name": str(payload.get("wave_name") or "").strip(),
            "warehouse_code": str(payload.get("warehouse_code") or "").strip().upper(),
            "planned_picking_date": str(payload.get("planned_picking_date") or "").strip(),
            "required_arrival_date": str(payload.get("required_arrival_date") or "").strip(),
            "selected_replenishment_request_nos": selected_request_nos,
            "stores_included": stores_included,
            "total_requested_qty": total_requested_qty,
            "total_shortage_qty": total_shortage_qty,
            "sdb_count": 0,
            "lpk_count": 0,
            "status": "planned",
            "created_by": "warehouse_clerk_1",
            "created_at": now_iso(),
            "notes": str(payload.get("notes") or "").strip(),
        }
        self.picking_waves[wave_no] = wave
        self._persist()
        return wave

    def list_picking_waves(self) -> list[dict[str, Any]]:
        return sorted(self.picking_waves.values(), key=lambda row: row["created_at"], reverse=True)

    def get_picking_wave(self, wave_no: str) -> dict[str, Any]:
        wave = self.picking_waves.get(wave_no.strip().upper())
        if not wave:
            raise HTTPException(status_code=404, detail=f"Unknown picking wave {wave_no}")
        return wave

    def list_transfer_receiving_sessions(self, transfer_no: Optional[str] = None) -> list[dict[str, Any]]:
        rows = list(self.transfer_receiving_sessions.values())
        if transfer_no:
            rows = [row for row in rows if row["transfer_no"] == transfer_no]
        return sorted(rows, key=lambda row: row["created_at"], reverse=True)

    def get_transfer_receiving_session(self, session_no: str) -> dict[str, Any]:
        session = self.transfer_receiving_sessions.get(session_no)
        if not session:
            raise HTTPException(status_code=404, detail=f"Unknown receiving session {session_no}")
        return session

    def _build_store_placement_suggestion(self, store_code: str, barcode: str) -> dict[str, Any]:
        store = self._ensure_store_exists(store_code)
        product = self.get_product_by_barcode(barcode)
        stock_key = f"{store['code']}||{product['barcode']}"
        store_row = self.store_stock.get(stock_key)
        previous_rack_code = store_row.get("store_rack_code", "") if store_row else ""

        suggested_codes: list[str] = []
        if previous_rack_code:
            suggested_codes.append(previous_rack_code)

        category_terms = [
            str(product.get("category_sub", "")).strip().lower(),
            str(product.get("category_main", "")).strip().lower(),
        ]
        for row in self.list_store_racks(store["code"]):
            hint = str(row.get("category_hint", "")).strip().lower()
            if not hint:
                continue
            if any(term and (term in hint or hint in term) for term in category_terms):
                rack_code = row["rack_code"]
                if rack_code not in suggested_codes:
                    suggested_codes.append(rack_code)

        return {
            "barcode": product["barcode"],
            "product_name": product["product_name"],
            "store_code": store["code"],
            "category_main": product["category_main"],
            "category_sub": product["category_sub"],
            "previous_rack_code": previous_rack_code,
            "suggested_rack_codes": suggested_codes[:5],
        }

    def _refresh_receiving_session_summary(self, session: dict[str, Any]) -> None:
        order = self.get_transfer_order(session["transfer_no"])
        batch_totals: dict[str, int] = defaultdict(int)
        latest_rack_codes: dict[str, str] = {}
        for batch in session["batches"]:
            batch_totals[batch["barcode"]] += batch["received_qty"]
            latest_rack_codes[batch["barcode"]] = batch["rack_code"]

        summaries: list[dict[str, Any]] = []
        tracked_barcodes = set()
        for item in order["items"]:
            suggestion = self._build_store_placement_suggestion(session["store_code"], item["barcode"])
            received_qty = batch_totals.get(item["barcode"], 0)
            approved_qty = item["approved_qty"] or item["requested_qty"]
            summaries.append(
                {
                    "barcode": item["barcode"],
                    "product_name": item["product_name"],
                    "category_main": suggestion["category_main"],
                    "category_sub": suggestion["category_sub"],
                    "approved_qty": approved_qty,
                    "received_qty": received_qty,
                    "discrepancy_qty": approved_qty - received_qty,
                    "previous_rack_code": suggestion["previous_rack_code"],
                    "suggested_rack_codes": suggestion["suggested_rack_codes"],
                    "latest_rack_code": latest_rack_codes.get(item["barcode"], ""),
                }
            )
            tracked_barcodes.add(item["barcode"])

        unexpected_batches = [
            batch for batch in session["batches"] if batch["barcode"] not in tracked_barcodes
        ]
        total_received_qty = sum(batch["received_qty"] for batch in session["batches"])
        session["item_summaries"] = summaries
        session["analysis_summary"] = {
            "batch_count": len(session["batches"]),
            "total_received_qty": total_received_qty,
            "tracked_barcodes": len(tracked_barcodes),
            "unexpected_batch_count": len(unexpected_batches),
            "discrepancy_barcode_count": sum(1 for row in summaries if row["discrepancy_qty"] != 0),
        }

    def start_transfer_receiving_session(self, transfer_no: str, payload: dict[str, Any]) -> dict[str, Any]:
        order = self.get_transfer_order(transfer_no)
        actor = self._require_user_role(payload["started_by"], {"store_manager"}, store_code=order["to_store_code"])
        if order["status"] in {"received", "discrepancy_confirmed", "cancelled"}:
            raise HTTPException(status_code=400, detail="Transfer order is already closed for receipt")

        for session in self.transfer_receiving_sessions.values():
            if session["transfer_no"] == transfer_no and session["status"] == "open":
                self._refresh_receiving_session_summary(session)
                return session

        session_no = f"RS-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{next(self._receiving_session_ids):03d}"
        session = {
            "session_no": session_no,
            "transfer_no": transfer_no,
            "store_code": order["to_store_code"],
            "warehouse_code": order["from_warehouse_code"],
            "status": "open",
            "created_by": actor["username"],
            "created_at": now_iso(),
            "finalized_at": None,
            "finalized_by": None,
            "note": payload.get("note", ""),
            "item_summaries": [],
            "batches": [],
            "analysis_summary": {},
        }
        self._refresh_receiving_session_summary(session)
        self.transfer_receiving_sessions[session_no] = session
        order["status"] = "receiving_in_progress"
        order["active_receiving_session_no"] = session_no
        self._log_event(
            event_type="transfer.receiving_session_started",
            entity_type="receiving_session",
            entity_id=session_no,
            actor=actor["username"],
            summary=f"Receiving session {session_no} started for {transfer_no}",
            details={"transfer_no": transfer_no, "store_code": order["to_store_code"]},
        )
        self._persist()
        return session

    def get_receiving_session_placement_suggestion(self, session_no: str, barcode: str) -> dict[str, Any]:
        session = self.get_transfer_receiving_session(session_no)
        return self._build_store_placement_suggestion(session["store_code"], barcode)

    def add_receiving_session_batch(self, session_no: str, payload: dict[str, Any]) -> dict[str, Any]:
        session = self.get_transfer_receiving_session(session_no)
        actor = self._require_user_role(payload["recorded_by"], {"store_manager"}, store_code=session["store_code"])
        if session["status"] != "open":
            raise HTTPException(status_code=400, detail="Receiving session is not open")

        product = self.get_product_by_barcode(payload["barcode"])
        rack_key = f"{session['store_code']}||{payload['rack_code']}"
        if rack_key not in self.store_rack_locations:
            raise HTTPException(status_code=404, detail=f"Unknown rack {payload['rack_code']} for store {session['store_code']}")

        suggestion = self._build_store_placement_suggestion(session["store_code"], product["barcode"])
        batch = {
            "batch_id": next(self._receiving_batch_ids),
            "barcode": product["barcode"],
            "product_name": product["product_name"],
            "category_main": product["category_main"],
            "category_sub": product["category_sub"],
            "received_qty": payload["received_qty"],
            "rack_code": payload["rack_code"],
            "previous_rack_code": suggestion["previous_rack_code"],
            "suggested_rack_codes": suggestion["suggested_rack_codes"],
            "created_by": actor["username"],
            "created_at": now_iso(),
            "note": payload.get("note", ""),
        }
        session["batches"].append(batch)
        self._refresh_receiving_session_summary(session)
        self._log_event(
            event_type="transfer.receiving_batch_recorded",
            entity_type="receiving_session",
            entity_id=session_no,
            actor=actor["username"],
            summary=f"Receiving batch {batch['batch_id']} recorded for {session_no}",
            details={
                "barcode": batch["barcode"],
                "received_qty": batch["received_qty"],
                "rack_code": batch["rack_code"],
            },
        )
        self._persist()
        return session

    def finalize_transfer_receiving_session(self, session_no: str, payload: dict[str, Any]) -> dict[str, Any]:
        session = self.get_transfer_receiving_session(session_no)
        actor = self._require_user_role(payload["finalized_by"], {"store_manager"}, store_code=session["store_code"])
        if session["status"] != "open":
            raise HTTPException(status_code=400, detail="Receiving session is not open")

        order = self.get_transfer_order(session["transfer_no"])
        batch_totals: dict[str, int] = defaultdict(int)
        latest_rack_codes: dict[str, str] = {}
        for batch in session["batches"]:
            batch_totals[batch["barcode"]] += batch["received_qty"]
            latest_rack_codes[batch["barcode"]] = batch["rack_code"]

        order_item_by_barcode = {item["barcode"]: item for item in order["items"]}
        discrepancies: list[dict[str, Any]] = []

        for barcode, actual_qty in batch_totals.items():
            expected_item = order_item_by_barcode.get(barcode)
            if expected_item is None:
                product = self.get_product_by_barcode(barcode)
                rack_code = latest_rack_codes.get(barcode, "")
                self._add_store_lot(
                    store_code=session["store_code"],
                    barcode=barcode,
                    qty=actual_qty,
                    unit_cost=product["cost_price"],
                    source_type="unexpected_transfer_in",
                    source_no=order["transfer_no"],
                    store_rack_code=rack_code,
                    note=f"Unexpected item received in session {session_no}",
                )
                self._record_inventory_movement(
                    movement_type="store_transfer_in",
                    barcode=barcode,
                    product_name=product["product_name"],
                    quantity_delta=actual_qty,
                    location_type="store",
                    location_code=session["store_code"],
                    reference_type="transfer_order",
                    reference_no=order["transfer_no"],
                    actor=actor["username"],
                    note=f"Unexpected item received in session {session_no}",
                    details={"rack_code": rack_code, "source_type": "unexpected_transfer_in"},
                )
                discrepancies.append(
                    {
                        "barcode": barcode,
                        "issue_type": "wrong_item",
                        "expected_qty": 0,
                        "actual_qty": actual_qty,
                        "note": f"Unexpected item received in session {session_no}",
                    }
                )

        for item in order["items"]:
            approved_qty = item["approved_qty"] or item["requested_qty"]
            actual_qty = batch_totals.get(item["barcode"], 0)
            item["received_qty"] = actual_qty
            item["discrepancy_qty"] = approved_qty - actual_qty
            used_allocations, leftover_allocations = self._allocations_for_quantity(
                item.get("lot_allocations", []),
                min(actual_qty, approved_qty),
            )
            item["received_lot_allocations"] = used_allocations
            item["pending_restore_allocations"] = leftover_allocations
            rack_code = latest_rack_codes.get(item["barcode"], "")
            for allocation in used_allocations:
                self._add_store_lot(
                    store_code=session["store_code"],
                    barcode=item["barcode"],
                    qty=allocation["qty"],
                    unit_cost=allocation["unit_cost"],
                    source_type="transfer_in",
                    source_no=order["transfer_no"],
                    store_rack_code=rack_code,
                    note=f"Receiving session {session_no}",
                )
            if used_allocations:
                self._record_inventory_movement(
                    movement_type="store_transfer_in",
                    barcode=item["barcode"],
                    product_name=item["product_name"],
                    quantity_delta=sum(allocation["qty"] for allocation in used_allocations),
                    location_type="store",
                    location_code=session["store_code"],
                    reference_type="transfer_order",
                    reference_no=order["transfer_no"],
                    actor=actor["username"],
                    note=f"Batch receiving finalized via {session_no}",
                    details={
                        "rack_code": rack_code,
                        "receiving_session_no": session_no,
                        "lot_allocations": used_allocations,
                    },
                )
            if actual_qty < approved_qty:
                discrepancies.append(
                    {
                        "barcode": item["barcode"],
                        "issue_type": "short",
                        "expected_qty": approved_qty,
                        "actual_qty": actual_qty,
                        "note": payload.get("note", "") or f"Short receipt during {session_no}",
                    }
                )
            elif actual_qty > approved_qty:
                discrepancies.append(
                    {
                        "barcode": item["barcode"],
                        "issue_type": "excess",
                        "expected_qty": approved_qty,
                        "actual_qty": actual_qty,
                        "note": payload.get("note", "") or f"Excess receipt during {session_no}",
                    }
                )

            if actual_qty > approved_qty:
                extra_qty = actual_qty - approved_qty
                product = self.get_product_by_barcode(item["barcode"])
                self._add_store_lot(
                    store_code=session["store_code"],
                    barcode=item["barcode"],
                    qty=extra_qty,
                    unit_cost=product["cost_price"],
                    source_type="transfer_excess",
                    source_no=order["transfer_no"],
                    store_rack_code=latest_rack_codes.get(item["barcode"], ""),
                    note=f"Excess receipt during {session_no}",
                )
                self._record_inventory_movement(
                    movement_type="store_transfer_in",
                    barcode=item["barcode"],
                    product_name=item["product_name"],
                    quantity_delta=extra_qty,
                    location_type="store",
                    location_code=session["store_code"],
                    reference_type="transfer_order",
                    reference_no=order["transfer_no"],
                    actor=actor["username"],
                    note=f"Excess receipt during {session_no}",
                    details={"receiving_session_no": session_no, "source_type": "transfer_excess"},
                )

        session["status"] = "finalized"
        session["finalized_at"] = now_iso()
        session["finalized_by"] = actor["username"]
        if payload.get("note"):
            session["note"] = payload["note"]
        self._refresh_receiving_session_summary(session)

        order["received_at"] = now_iso()
        order["received_by"] = actor["username"]
        order["discrepancies"] = discrepancies
        order["active_receiving_session_no"] = None
        order["status"] = "received"
        order["discrepancy_approval_status"] = "pending" if discrepancies else "not_required"

        self._log_event(
            event_type="transfer.receiving_session_finalized",
            entity_type="receiving_session",
            entity_id=session_no,
            actor=actor["username"],
            summary=f"Receiving session {session_no} finalized",
            details={
                "transfer_no": order["transfer_no"],
                "discrepancy_count": len(discrepancies),
                "total_received_qty": session["analysis_summary"].get("total_received_qty", 0),
            },
        )
        self._persist()
        return session

    def create_return_order(self, payload: dict[str, Any]) -> dict[str, Any]:
        store = self._ensure_store_exists(payload["from_store_code"])
        actor = self._require_user_role(payload["created_by"], {"store_manager", "area_supervisor"}, store_code=store["code"])
        return_no = f"RO-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{next(self._return_ids):03d}"
        items: list[dict[str, Any]] = []

        for item in payload["items"]:
            resolved = self.resolve_barcode(item["barcode"], context="pos")
            if resolved["barcode_type"] != "STORE_ITEM" or resolved.get("reject_reason"):
                raise HTTPException(status_code=400, detail=resolved.get("reject_reason") or f"{item['barcode']} is not a store item barcode")
            product = self.get_product_by_barcode(item["barcode"])
            identity_id = self._resolve_identity_id_for_barcode(product["barcode"])
            stock_key = f"{store['code']}||{product['barcode']}"
            store_row = self.store_stock.get(stock_key)
            available_qty = store_row.get("qty_on_hand", 0) if store_row else 0
            if available_qty < item["requested_qty"]:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Insufficient store stock for {product['barcode']} in {store['code']}: "
                        f"requested {item['requested_qty']}, available {available_qty}"
                    ),
                )

            items.append(
                {
                    "identity_id": identity_id,
                    "barcode": product["barcode"],
                    "product_name": product["product_name"],
                    "requested_qty": item["requested_qty"],
                    "returned_qty": 0,
                    "note": item.get("note", ""),
                    "lot_allocations": [],
                }
            )

        order = {
            "return_no": return_no,
            "from_store_code": store["code"],
            "to_warehouse_code": payload["to_warehouse_code"],
            "reason": payload["reason"],
            "status": "pending_dispatch",
            "created_by": actor["username"],
            "created_at": now_iso(),
            "dispatched_at": None,
            "dispatched_by": None,
            "received_at": None,
            "received_by": None,
            "ret_rack_code": "",
            "items": items,
        }
        self.return_orders[return_no] = order
        self._log_event(
            event_type="return.created",
            entity_type="return_order",
            entity_id=return_no,
            actor=actor["username"],
            summary=f"Return {return_no} created from {store['code']}",
            details={
                "item_count": len(items),
                "reason": payload["reason"],
                "identity_ids": [item.get("identity_id", "") for item in items if item.get("identity_id")],
            },
        )
        self._persist()
        return order

    def list_return_orders(self) -> list[dict[str, Any]]:
        return list(self.return_orders.values())

    def list_return_candidates(self, store_code: str) -> list[dict[str, Any]]:
        store = self._ensure_store_exists(store_code)
        rows: list[dict[str, Any]] = []
        for row in self.store_stock.values():
            if row["store_code"] != store["code"]:
                continue
            if row.get("qty_on_hand", 0) <= 0:
                continue
            product = self.get_product_by_barcode(row["barcode"])
            rows.append(
                {
                    "identity_id": self._resolve_identity_id_for_barcode(row["barcode"]),
                    "barcode": row["barcode"],
                    "product_name": row["product_name"],
                    "category_main": product["category_main"],
                    "category_sub": product["category_sub"],
                    "qty_on_hand": row["qty_on_hand"],
                    "store_rack_code": row.get("store_rack_code", ""),
                }
            )
        return sorted(rows, key=lambda item: (item["category_main"], item["category_sub"], item["barcode"]))

    def create_return_order_from_selection(self, payload: dict[str, Any]) -> dict[str, Any]:
        candidates = self.list_return_candidates(payload["from_store_code"])
        select_all = bool(payload.get("select_all", True))
        selected = {value.strip().upper() for value in payload.get("selected_barcodes", []) if value.strip()}
        excluded = {value.strip().upper() for value in payload.get("excluded_barcodes", []) if value.strip()}

        if select_all:
            chosen_rows = [row for row in candidates if row["barcode"] not in excluded]
        else:
            chosen_rows = [row for row in candidates if row["barcode"] in selected]

        if not chosen_rows:
            raise HTTPException(status_code=400, detail="No store items selected for return")

        create_payload = {
            "from_store_code": payload["from_store_code"],
            "to_warehouse_code": payload["to_warehouse_code"],
            "reason": payload.get("reason", "cycle_end_return"),
            "created_by": payload["created_by"],
            "items": [
                {
                    "barcode": row["barcode"],
                    "requested_qty": row["qty_on_hand"],
                    "note": payload.get("note", ""),
                }
                for row in chosen_rows
            ],
        }
        return self.create_return_order(create_payload)

    def get_return_order(self, return_no: str) -> dict[str, Any]:
        order = self.return_orders.get(return_no)
        if not order:
            raise HTTPException(status_code=404, detail=f"Unknown return order {return_no}")
        return order

    def dispatch_return_order(self, return_no: str, payload: dict[str, Any]) -> dict[str, Any]:
        order = self.get_return_order(return_no)
        actor = self._require_user_role(payload["dispatched_by"], {"store_manager", "area_supervisor"}, store_code=order["from_store_code"])
        if order["status"] != "pending_dispatch":
            raise HTTPException(status_code=400, detail="Return order is not pending dispatch")

        for item in order["items"]:
            stock_key = f"{order['from_store_code']}||{item['barcode']}"
            store_row = self.store_stock.get(stock_key)
            available_qty = store_row.get("qty_on_hand", 0) if store_row else 0
            if available_qty < item["requested_qty"]:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Insufficient store stock for {item['barcode']} in {order['from_store_code']}: "
                        f"requested {item['requested_qty']}, available {available_qty}"
                    ),
                )

        for item in order["items"]:
            stock_key = f"{order['from_store_code']}||{item['barcode']}"
            allocations = self._consume_lots_fifo(self.store_lots[stock_key], item["requested_qty"])
            self._sync_store_stock_from_lots(order["from_store_code"], item["barcode"])
            item["returned_qty"] = item["requested_qty"]
            item["lot_allocations"] = allocations
            self._record_inventory_movement(
                movement_type="store_return_out",
                barcode=item["barcode"],
                product_name=item["product_name"],
                quantity_delta=-item["requested_qty"],
                location_type="store",
                location_code=order["from_store_code"],
                reference_type="return_order",
                reference_no=return_no,
                actor=actor["username"],
                note=payload.get("note", "") or f"Return to {order['to_warehouse_code']}",
                details={
                    "to_warehouse_code": order["to_warehouse_code"],
                    "lot_allocations": allocations,
                    "identity_id": item.get("identity_id", ""),
                },
            )

        order["status"] = "dispatched"
        order["dispatched_at"] = now_iso()
        order["dispatched_by"] = actor["username"]
        self._log_event(
            event_type="return.dispatched",
            entity_type="return_order",
            entity_id=return_no,
            actor=actor["username"],
            summary=f"Return {return_no} dispatched from {order['from_store_code']}",
            details={
                "note": payload.get("note", ""),
                "identity_ids": [item.get("identity_id", "") for item in order.get("items", []) if item.get("identity_id")],
            },
        )
        self._persist()
        return order

    def receive_return_order(self, return_no: str, payload: dict[str, Any]) -> dict[str, Any]:
        order = self.get_return_order(return_no)
        actor = self._require_user_role(payload["received_by"], {"warehouse_clerk", "warehouse_supervisor"})
        if order["status"] != "dispatched":
            raise HTTPException(status_code=400, detail="Return order is not ready for warehouse receipt")

        ret_rack_code = payload["ret_rack_code"]
        for item in order["items"]:
            lot_allocations = item.get("lot_allocations", [])
            if lot_allocations:
                for allocation in lot_allocations:
                    self._add_warehouse_lot(
                        warehouse_code=order["to_warehouse_code"],
                        barcode=item["barcode"],
                        qty=allocation["qty"],
                        unit_cost=allocation["unit_cost"],
                        source_type="store_return_in",
                        source_no=return_no,
                        rack_code=ret_rack_code,
                        note=payload.get("note", "") or f"Return received into {ret_rack_code}",
                    )
            else:
                self._apply_warehouse_stock_delta(
                    order["to_warehouse_code"],
                    item["barcode"],
                    item["returned_qty"],
                    reference_type="return_order",
                    reference_no=return_no,
                    actor=actor["username"],
                    note=payload.get("note", "") or f"Return received into {ret_rack_code}",
                    details={"ret_rack_code": ret_rack_code, "identity_id": item.get("identity_id", "")},
                )
            stock_key = f"{order['to_warehouse_code']}||{item['barcode']}"
            self.warehouse_stock[stock_key]["rack_code"] = ret_rack_code
            self.warehouse_stock[stock_key]["updated_at"] = now_iso()
            self._record_inventory_movement(
                movement_type="warehouse_return_in",
                barcode=item["barcode"],
                product_name=item["product_name"],
                quantity_delta=item["returned_qty"],
                location_type="warehouse",
                location_code=order["to_warehouse_code"],
                reference_type="return_order",
                reference_no=return_no,
                actor=actor["username"],
                note=payload.get("note", "") or f"Return received into {ret_rack_code}",
                details={
                    "ret_rack_code": ret_rack_code,
                    "lot_allocations": lot_allocations,
                    "identity_id": item.get("identity_id", ""),
                },
            )

        order["status"] = "received"
        order["received_at"] = now_iso()
        order["received_by"] = actor["username"]
        order["ret_rack_code"] = ret_rack_code
        self._log_event(
            event_type="return.received",
            entity_type="return_order",
            entity_id=return_no,
            actor=actor["username"],
            summary=f"Return {return_no} received into {order['to_warehouse_code']}",
            details={
                "ret_rack_code": ret_rack_code,
                "note": payload.get("note", ""),
                "identity_ids": [item.get("identity_id", "") for item in order.get("items", []) if item.get("identity_id")],
            },
        )
        self._persist()
        return order

    def approve_transfer_order(self, transfer_no: str, payload: dict[str, Any]) -> dict[str, Any]:
        actor = self._require_user_role(payload["approved_by"], {"warehouse_supervisor"})
        order = self.get_transfer_order(transfer_no)
        if order["approval_status"] != "pending":
            raise HTTPException(status_code=400, detail="Transfer order is not pending approval")

        if not payload["approved"]:
            order["approval_status"] = "rejected"
            order["status"] = "closed"
            order["approved_at"] = now_iso()
            order["approved_by"] = payload["approved_by"]
            order["closed_at"] = order["approved_at"]
            self._log_event(
                event_type="transfer.rejected",
                entity_type="transfer_order",
                entity_id=transfer_no,
                actor=actor["username"],
                summary=f"Transfer {transfer_no} rejected",
                details={"note": payload.get("note", "")},
            )
            self._persist()
            return order

        self._reserve_transfer_inventory(order, actor=actor["username"])
        order["approval_status"] = "approved"
        order["status"] = "approved"
        order["approved_at"] = now_iso()
        order["approved_by"] = payload["approved_by"]
        self._log_event(
            event_type="transfer.approved",
            entity_type="transfer_order",
            entity_id=transfer_no,
            actor=actor["username"],
            summary=f"Transfer {transfer_no} approved",
            details={"approved_items": len(order["items"])},
        )
        self._persist()
        return order

    def ship_transfer_order(self, transfer_no: str, payload: dict[str, Any]) -> dict[str, Any]:
        actor = self._require_user_role(payload["shipped_by"], {"warehouse_supervisor"})
        order = self.get_transfer_order(transfer_no)
        if order["status"] not in {"approved", "packed", "shipped"}:
            raise HTTPException(status_code=400, detail="Transfer order is not ready for shipment")
        self._rebuild_store_dispatch_bales()
        related_bales = [
            bale for bale in self.store_dispatch_bales.values()
            if str(bale.get("transfer_no") or "").strip().upper() == str(order.get("transfer_no") or "").strip().upper()
        ]
        if not related_bales:
            related_bales = self._build_transfer_dispatch_bales(
                order,
                actor["username"],
                grouping_mode=str(order.get("dispatch_grouping_mode") or "by_category"),
                max_items_per_bale=int(order.get("dispatch_max_items_per_bale") or 100),
            )
        if not related_bales:
            raise HTTPException(status_code=400, detail="Transfer order has no dispatch bales to ship")

        shipped_at = now_iso()
        order["shipment_session_no"] = order.get("shipment_session_no") or self._transfer_shipment_session_no(transfer_no)
        order["status"] = "shipped"
        order["store_receipt_status"] = "pending_receipt"
        order["shipped_at"] = shipped_at
        order["shipped_by"] = actor["username"]
        order["driver_name"] = str(payload.get("driver_name") or "").strip()
        order["vehicle_no"] = str(payload.get("vehicle_no") or "").strip().upper()
        order["shipment_note"] = str(payload.get("note") or "").strip()
        for bale in related_bales:
            bale["dispatched_at"] = shipped_at
            bale["dispatched_by"] = actor["username"]
            bale["updated_at"] = shipped_at
            self._refresh_store_dispatch_bale_summary(bale)
        self._sync_transfer_dispatch_progress(transfer_no)
        self._log_event(
            event_type="transfer.shipped",
            entity_type="transfer_order",
            entity_id=transfer_no,
            actor=actor["username"],
            summary=f"Transfer {transfer_no} shipped",
            details={
                "delivery_batch_no": order.get("delivery_batch_no", ""),
                "shipment_session_no": order["shipment_session_no"],
                "driver_name": order["driver_name"],
                "vehicle_no": order["vehicle_no"],
            },
        )
        self._persist()
        return order

    def receive_transfer_order(self, transfer_no: str, payload: dict[str, Any]) -> dict[str, Any]:
        order = self.get_transfer_order(transfer_no)
        actor = self._require_user_role(payload["receiver_name"], {"store_manager"}, store_code=order["to_store_code"])
        if order["status"] not in {"approved", "dispatched"}:
            raise HTTPException(status_code=400, detail="Transfer order is not ready for receipt")

        discrepancy_by_barcode = {row["barcode"]: row for row in payload["discrepancies"]}

        for item in order["items"]:
            requested_qty = item["requested_qty"]
            discrepancy = discrepancy_by_barcode.get(item["barcode"])
            if discrepancy:
                actual_qty = discrepancy["actual_qty"]
                item["received_qty"] = actual_qty
                item["discrepancy_qty"] = requested_qty - actual_qty
            else:
                actual_qty = requested_qty
                item["received_qty"] = actual_qty
                item["discrepancy_qty"] = 0

            used_allocations, leftover_allocations = self._allocations_for_quantity(
                item.get("lot_allocations", []),
                min(actual_qty, requested_qty),
            )
            item["received_lot_allocations"] = used_allocations
            item["pending_restore_allocations"] = leftover_allocations
            for allocation in used_allocations:
                self._add_store_lot(
                    store_code=order["to_store_code"],
                    barcode=item["barcode"],
                    qty=allocation["qty"],
                    unit_cost=allocation["unit_cost"],
                    source_type="transfer_in",
                    source_no=transfer_no,
                    note=f"Direct transfer receipt in {order['to_store_code']}",
                )
            if actual_qty > requested_qty:
                product = self.get_product_by_barcode(item["barcode"])
                self._add_store_lot(
                    store_code=order["to_store_code"],
                    barcode=item["barcode"],
                    qty=actual_qty - requested_qty,
                    unit_cost=product["cost_price"],
                    source_type="transfer_excess",
                    source_no=transfer_no,
                    note=f"Direct transfer excess in {order['to_store_code']}",
                )
            if actual_qty:
                self._record_inventory_movement(
                    movement_type="store_transfer_in",
                    barcode=item["barcode"],
                    product_name=item["product_name"],
                    quantity_delta=actual_qty,
                    location_type="store",
                    location_code=order["to_store_code"],
                    reference_type="transfer_order",
                    reference_no=transfer_no,
                    actor=actor["username"],
                    note=f"Received from {order['from_warehouse_code']}",
                    details={"from_warehouse_code": order["from_warehouse_code"], "lot_allocations": used_allocations},
                )

        order["received_at"] = now_iso()
        order["received_by"] = payload["receiver_name"]
        order["discrepancies"] = payload["discrepancies"]

        has_discrepancy = any(item["discrepancy_qty"] != 0 for item in order["items"])
        if has_discrepancy:
            order["status"] = "received"
            order["discrepancy_approval_status"] = "pending"
        else:
            order["status"] = "received"
            order["discrepancy_approval_status"] = "not_required"

        self._log_event(
            event_type="transfer.received",
            entity_type="transfer_order",
            entity_id=transfer_no,
            actor=actor["username"],
            summary=f"Transfer {transfer_no} received at {order['to_store_code']}",
            details={"has_discrepancy": has_discrepancy, "discrepancy_count": len(order["discrepancies"])},
        )
        self._persist()
        return order

    def approve_transfer_discrepancy(self, transfer_no: str, payload: dict[str, Any]) -> dict[str, Any]:
        actor = self._require_user_role(payload["approved_by"], {"area_supervisor"})
        order = self.get_transfer_order(transfer_no)
        if order["discrepancy_approval_status"] != "pending":
            raise HTTPException(status_code=400, detail="No pending discrepancy approval")

        order["discrepancy_approval_status"] = "approved" if payload["approved"] else "rejected"
        order["discrepancy_approved_by"] = payload["approved_by"]
        order["discrepancy_approved_at"] = now_iso()
        order["status"] = "discrepancy_confirmed" if payload["approved"] else "received"
        if payload["approved"]:
            self._create_inventory_adjustments(order, payload["approved_by"], payload.get("note", ""))
        self._log_event(
            event_type="transfer.discrepancy_reviewed",
            entity_type="transfer_order",
            entity_id=transfer_no,
            actor=actor["username"],
            summary=f"Transfer {transfer_no} discrepancy {order['discrepancy_approval_status']}",
            details={"note": payload.get("note", "")},
        )
        self._persist()
        return order

    def create_sale_transaction(self, payload: dict[str, Any]) -> dict[str, Any]:
        store = self._ensure_store_exists(payload["store_code"])
        actor = self._require_user_role(payload["cashier_name"], {"cashier", "store_manager"}, store_code=store["code"])
        shift_no = payload.get("shift_no", "").strip()
        if shift_no:
            shift = self.get_cashier_shift(shift_no)
            if shift["store_code"] != store["code"]:
                raise HTTPException(status_code=400, detail=f"Shift {shift_no} does not belong to store {store['code']}")
            if shift["status"] != "open":
                raise HTTPException(status_code=400, detail=f"Shift {shift_no} is not open")
        else:
            open_shift = self._find_open_shift_for_cashier(store["code"], actor["username"])
            if not open_shift:
                raise HTTPException(status_code=400, detail="No open cashier shift for this store. Please open a shift first.")
            shift = open_shift
            shift_no = shift["shift_no"]

        line_items: list[dict[str, Any]] = []
        total_qty = 0
        total_amount = 0.0
        total_cost = 0.0
        total_profit = 0.0
        override_alert_count = 0
        policy_breach_count = 0
        payments = payload.get("payments", [])
        if not payments:
            raise HTTPException(status_code=400, detail="At least one payment line is required")

        for item in payload["items"]:
            resolved = self.resolve_barcode(item["barcode"], context="pos")
            if resolved["barcode_type"] != "STORE_ITEM" or resolved.get("reject_reason"):
                raise HTTPException(status_code=400, detail=resolved.get("reject_reason") or f"{item['barcode']} is not a store item barcode")
            product = self.get_product_by_barcode(item["barcode"])
            stock_key = f"{store['code']}||{product['barcode']}"
            store_row = self.store_stock.get(stock_key)
            available_qty = store_row.get("qty_on_hand", 0) if store_row else 0
            if available_qty < item["qty"]:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Insufficient store stock for {product['barcode']} in {store['code']}: "
                        f"requested {item['qty']}, available {available_qty}"
                    ),
                )

        for item in payload["items"]:
            product = self.get_product_by_barcode(item["barcode"])
            stock_key = f"{store['code']}||{product['barcode']}"
            lot_allocations = self._consume_lots_fifo(self.store_lots[stock_key], item["qty"])
            self._sync_store_stock_from_lots(store["code"], product["barcode"])
            identity_id = self._resolve_identity_id_for_barcode(product["barcode"])
            pricing = self._resolve_effective_price_rule(store["code"], product)
            expected_price = pricing["expected_price"]
            price_override = round(item["selling_price"], 2) != round(expected_price, 2)
            price_policy_breach = (
                pricing["price_cap"] is not None and round(item["selling_price"], 2) > round(pricing["price_cap"], 2)
            )
            if price_override and not item.get("override_reason", "").strip():
                raise HTTPException(
                    status_code=400,
                    detail=f"Price override for {product['barcode']} requires an override reason",
                )
            self._record_inventory_movement(
                movement_type="sale_out",
                barcode=product["barcode"],
                product_name=product["product_name"],
                quantity_delta=-item["qty"],
                location_type="store",
                location_code=store["code"],
                reference_type="sale_order",
                reference_no=payload["order_no"],
                actor=actor["username"],
                note=f"POS sale in {store['code']}",
                details={
                    "selling_price": item["selling_price"],
                    "lot_allocations": lot_allocations,
                    "identity_id": identity_id,
                },
            )

            line_total = round(item["qty"] * item["selling_price"], 2)
            line_cost = round(sum(allocation["line_cost"] for allocation in lot_allocations), 2)
            average_cost_price = round(line_cost / item["qty"], 2) if item["qty"] else 0.0
            line_profit = round(line_total - line_cost, 2)
            total_qty += item["qty"]
            total_amount += line_total
            total_cost += line_cost
            total_profit += line_profit
            if price_override:
                override_alert_count += 1
            if price_policy_breach:
                policy_breach_count += 1
            line_items.append(
                {
                    "identity_id": identity_id,
                    "barcode": product["barcode"],
                    "product_name": product["product_name"],
                    "qty": item["qty"],
                    "launch_price": product["launch_price"],
                    "expected_price": expected_price,
                    "price_cap": pricing["price_cap"],
                    "price_rule_no": pricing["rule_no"],
                    "cost_price": average_cost_price,
                    "average_cost_price": average_cost_price,
                    "selling_price": item["selling_price"],
                    "line_total": line_total,
                    "line_profit": line_profit,
                    "price_override": price_override,
                    "override_reason": item.get("override_reason", "").strip(),
                    "customer_id": item.get("customer_id", "").strip(),
                    "price_policy_breach": price_policy_breach,
                    "returned_qty": 0,
                    "returned_amount_total": 0.0,
                    "lot_allocations": lot_allocations,
                    "returned_lot_allocations": [],
                }
            )
            if price_override:
                self._log_event(
                    event_type="sale.price_override_alert",
                    entity_type="sale",
                    entity_id=payload["order_no"],
                    actor=actor["username"],
                    summary=f"Price override for {product['barcode']} in {store['code']}",
                    details={
                        "barcode": product["barcode"],
                        "launch_price": product["launch_price"],
                        "expected_price": expected_price,
                        "price_cap": pricing["price_cap"],
                        "price_rule_no": pricing["rule_no"],
                        "identity_id": identity_id,
                        "selling_price": item["selling_price"],
                        "override_reason": item.get("override_reason", "").strip(),
                        "shift_no": shift_no,
                    },
                )
            if price_policy_breach:
                self._log_event(
                    event_type="sale.price_policy_breach",
                    entity_type="sale",
                    entity_id=payload["order_no"],
                    actor=actor["username"],
                    summary=f"Price cap breached for {product['barcode']} in {store['code']}",
                    details={
                        "barcode": product["barcode"],
                        "expected_price": expected_price,
                        "price_cap": pricing["price_cap"],
                        "price_rule_no": pricing["rule_no"],
                        "identity_id": identity_id,
                        "selling_price": item["selling_price"],
                        "override_reason": item.get("override_reason", "").strip(),
                        "shift_no": shift_no,
                    },
                )

        normalized_payments = [
            {
                "method": payment["method"].strip().lower(),
                "amount": round(payment["amount"], 2),
                "reference": payment.get("reference", "").strip().upper(),
                "customer_id": payment.get("customer_id", "").strip(),
            }
            for payment in payments
        ]
        payment_total = round(sum(payment["amount"] for payment in normalized_payments), 2)
        total_amount = round(total_amount, 2)
        raw_overage = round(max(payment_total - total_amount, 0.0), 2)
        cash_total = round(
            sum(payment["amount"] for payment in normalized_payments if payment["method"] == "cash"),
            2,
        )
        change_due = round(min(cash_total, raw_overage), 2)
        amount_due = round(max(total_amount - payment_total, 0.0), 2)
        amount_overpaid = round(max(raw_overage - change_due, 0.0), 2)
        payment_anomalies: list[dict[str, Any]] = []
        existing_payment_refs = {
            (payment.get("method", "").strip().lower(), payment.get("reference", "").strip().upper())
            for sale in self.sales_transactions
            for payment in sale.get("payments", [])
            if payment.get("reference", "").strip()
        }
        mpesa_receipts = {
            row.get("receipt_no", "").strip().upper()
            for row in self.mpesa_collections
            if row.get("receipt_no", "").strip()
        }
        seen_local_refs: set[tuple[str, str]] = set()
        for payment in normalized_payments:
            reference_key = (payment["method"], payment["reference"])
            if not payment["reference"]:
                continue
            if reference_key in seen_local_refs:
                payment_anomalies.append(
                    self._create_payment_anomaly(
                        anomaly_type="duplicate_payment",
                        store_code=store["code"],
                        created_by=actor["username"],
                        order_no=payload["order_no"],
                        shift_no=shift_no,
                        payment_method=payment["method"],
                        amount_expected=total_amount,
                        amount_received=payment["amount"],
                        amount_difference=round(payment["amount"], 2),
                        reference=payment["reference"],
                        customer_id=payment.get("customer_id", ""),
                        source_type="sale_payment",
                        note="Same payment reference was entered more than once on the same sale.",
                        entity_id=payload["order_no"],
                    )
                )
                continue
            seen_local_refs.add(reference_key)
            if reference_key in existing_payment_refs or (
                payment["method"] == "mpesa" and payment["reference"] in mpesa_receipts
            ):
                payment_anomalies.append(
                    self._create_payment_anomaly(
                        anomaly_type="duplicate_payment",
                        store_code=store["code"],
                        created_by=actor["username"],
                        order_no=payload["order_no"],
                        shift_no=shift_no,
                        payment_method=payment["method"],
                        amount_expected=total_amount,
                        amount_received=payment["amount"],
                        amount_difference=round(payment["amount"], 2),
                        reference=payment["reference"],
                        customer_id=payment.get("customer_id", ""),
                        source_type="sale_payment",
                        note="Payment reference already exists in previous sales or imported M-Pesa collections.",
                        entity_id=payload["order_no"],
                    )
                )
        if amount_due > 0:
            dominant_method = normalized_payments[0]["method"] if normalized_payments else "unknown"
            customer_id = next((payment.get("customer_id", "") for payment in normalized_payments if payment.get("customer_id")), "")
            payment_anomalies.append(
                self._create_payment_anomaly(
                    anomaly_type="underpaid",
                    store_code=store["code"],
                    created_by=actor["username"],
                    order_no=payload["order_no"],
                    shift_no=shift_no,
                    payment_method=dominant_method,
                    amount_expected=total_amount,
                    amount_received=payment_total,
                    amount_difference=round(-amount_due, 2),
                    customer_id=customer_id,
                    source_type="sale_payment",
                    note="Customer paid less than the total sale amount.",
                    entity_id=payload["order_no"],
                )
            )
        if amount_overpaid > 0:
            customer_id = next((payment.get("customer_id", "") for payment in normalized_payments if payment.get("customer_id")), "")
            primary_overpaid_payment = next(
                (
                    payment
                    for payment in normalized_payments
                    if payment["method"] != "cash" and payment["amount"] > 0
                ),
                normalized_payments[0] if normalized_payments else {"method": "unknown", "reference": "", "amount": amount_overpaid},
            )
            payment_anomalies.append(
                self._create_payment_anomaly(
                    anomaly_type="overpaid",
                    store_code=store["code"],
                    created_by=actor["username"],
                    order_no=payload["order_no"],
                    shift_no=shift_no,
                    payment_method=primary_overpaid_payment["method"],
                    amount_expected=total_amount,
                    amount_received=payment_total,
                    amount_difference=amount_overpaid,
                    reference=primary_overpaid_payment.get("reference", ""),
                    customer_id=customer_id,
                    source_type="sale_payment",
                    note="Non-cash payment exceeds the sale total and should be reviewed or refunded.",
                    entity_id=payload["order_no"],
                )
            )
        if any(row["anomaly_type"] == "duplicate_payment" for row in payment_anomalies):
            payment_status = "duplicate_payment"
        elif amount_due > 0:
            payment_status = "partially_paid"
        elif amount_overpaid > 0:
            payment_status = "overpaid"
        else:
            payment_status = "paid"

        transaction = {
            "id": next(self._sale_ids),
            "client_sale_id": payload.get("client_sale_id", "").strip(),
            "sync_batch_no": payload.get("sync_batch_no", "").strip(),
            "order_no": payload["order_no"],
            "store_code": store["code"],
            "cashier_name": payload["cashier_name"],
            "shift_no": shift_no,
            "sold_at": payload["sold_at"] or now_iso(),
            "created_at": payload["sold_at"] or now_iso(),
            "total_qty": total_qty,
            "total_amount": total_amount,
            "payment_total": payment_total,
            "sale_status": "completed",
            "void_no": "",
            "void_request_count": 0,
            "refund_no": "",
            "refund_request_count": 0,
            "refund_amount_total": 0.0,
            "refund_qty_total": 0,
            "payment_status": payment_status,
            "amount_due": amount_due,
            "amount_overpaid": amount_overpaid,
            "payment_anomaly_count": len(payment_anomalies),
            "payment_anomaly_nos": [row["anomaly_no"] for row in payment_anomalies],
            "change_due": change_due,
            "total_cost": round(total_cost, 2),
            "total_profit": round(total_profit, 2),
            "power_mode": payload.get("power_mode", "online"),
            "note": payload.get("note", ""),
            "override_alert_count": override_alert_count,
            "policy_breach_count": policy_breach_count,
            "voided_at": None,
            "voided_by": "",
            "void_reason": "",
            "refunded_at": None,
            "refunded_by": "",
            "refund_reason": "",
            "identity_ids": [item["identity_id"] for item in line_items if item.get("identity_id")],
            "items": line_items,
            "payments": normalized_payments,
        }
        self.sales_transactions.append(transaction)
        self._log_event(
            event_type="sale.posted",
            entity_type="sale",
            entity_id=payload["order_no"],
            actor=actor["username"],
            summary=f"Sale {payload['order_no']} posted in {store['code']}",
            details={
                "total_amount": transaction["total_amount"],
                "total_qty": transaction["total_qty"],
                "payment_total": payment_total,
                "payment_status": payment_status,
                "payment_anomaly_count": len(payment_anomalies),
                "shift_no": shift_no,
                "power_mode": transaction["power_mode"],
                "client_sale_id": transaction["client_sale_id"],
                "sync_batch_no": transaction["sync_batch_no"],
                "identity_ids": transaction["identity_ids"],
            },
        )
        self._persist()
        return transaction

    def get_dashboard_summary(self) -> list[dict[str, Any]]:
        today_key = self._nairobi_day_key()
        open_transfer_count = sum(
            1
            for order in self.transfer_orders.values()
            if order["status"] not in {"received", "discrepancy_confirmed", "cancelled"}
        )
        today_sales_amount = round(
            sum(
                txn["total_amount"]
                for txn in self.sales_transactions
                if self._nairobi_day_key(txn.get("created_at")) == today_key
                and txn.get("sale_status", "completed") != "voided"
            ),
            2,
        )
        today_refund_amount = round(
            sum(
                row.get("refund_amount_total", 0.0)
                for row in self.sale_refund_requests.values()
                if row.get("status") == "approved"
                and self._nairobi_day_key(row.get("reviewed_at")) == today_key
            ),
            2,
        )
        active_price_rules = sum(1 for rule in self.price_rules.values() if rule.get("status") == "active")
        price_alert_count = sum(
            txn.get("override_alert_count", 0)
            for txn in self.sales_transactions
            if self._nairobi_day_key(txn.get("created_at")) == today_key
        )
        mpesa_today = round(
            sum(row["amount"] for row in self.mpesa_collections if self._nairobi_day_key(row.get("collected_at")) == today_key),
            2,
        )
        mpesa_unmatched = sum(
            1
            for row in self.mpesa_collections
            if row.get("match_status") == "unmatched"
        )
        mpesa_customer_count = len(
            {
                row.get("customer_id", "").strip()
                for row in self.mpesa_collections
                if row.get("customer_id", "").strip()
            }
        )
        today_offline_batches = [
            row for row in self.offline_sync_batches.values() if self._nairobi_day_key(row.get("uploaded_at")) == today_key
        ]
        offline_failed_rows = sum(row.get("failed_count", 0) for row in today_offline_batches)
        open_payment_anomalies = sum(
            1 for row in self.payment_anomalies.values() if row.get("status") == "open"
        )
        return [
            {"label": "warehouse_skus", "value": len(self.warehouse_stock)},
            {"label": "open_transfer_orders", "value": open_transfer_count},
            {"label": "active_stores", "value": sum(1 for store in self.stores.values() if store["status"] == "active")},
            {"label": "today_sales", "value": round(today_sales_amount - today_refund_amount, 2)},
            {"label": "active_price_rules", "value": active_price_rules},
            {"label": "price_alerts", "value": price_alert_count},
            {"label": "mpesa_today", "value": mpesa_today},
            {"label": "mpesa_unmatched", "value": mpesa_unmatched},
            {"label": "mpesa_customers", "value": mpesa_customer_count},
            {"label": "offline_sync_today", "value": len(today_offline_batches)},
            {"label": "offline_failed_rows", "value": offline_failed_rows},
            {"label": "payment_anomalies", "value": open_payment_anomalies},
        ]

    def get_store_operating_summary(self) -> list[dict[str, Any]]:
        today_key = self._nairobi_day_key()
        summaries: dict[str, dict[str, Any]] = {}

        for store in self.stores.values():
            summaries[store["code"]] = {
                "store_code": store["code"],
                "store_name": store["name"],
                "status": store["status"],
                "today_sales_amount": 0.0,
                "today_qty": 0,
                "today_profit": 0.0,
                "today_transaction_count": 0,
                "today_average_ticket": 0.0,
                "qty_on_hand": 0,
                "sku_count": 0,
                "pending_inbound_transfers": 0,
                "pending_discrepancies": 0,
                "pending_returns": 0,
                "pending_void_requests": 0,
                "pending_refund_requests": 0,
                "open_payment_anomalies": 0,
                "open_shift_count": 0,
                "handover_pending_count": 0,
                "today_price_alerts": 0,
                "today_mpesa_amount": 0.0,
                "today_refund_amount": 0.0,
                "unmatched_mpesa_count": 0,
                "offline_failed_rows": 0,
                "last_sale_at": None,
            }

        for row in self.store_stock.values():
            summary = summaries.get(row["store_code"])
            if not summary:
                continue
            qty_on_hand = int(row.get("qty_on_hand", 0))
            if qty_on_hand <= 0:
                continue
            summary["qty_on_hand"] += qty_on_hand
            summary["sku_count"] += 1

        for sale in self.sales_transactions:
            store_code = sale.get("store_code", "")
            summary = summaries.get(store_code)
            if not summary:
                continue
            created_at = sale.get("created_at")
            if created_at and (summary["last_sale_at"] is None or created_at > summary["last_sale_at"]):
                summary["last_sale_at"] = created_at
            if sale.get("sale_status", "completed") == "voided":
                continue
            if self._nairobi_day_key(created_at) != today_key:
                continue
            summary["today_sales_amount"] += float(sale.get("total_amount", 0.0))
            summary["today_qty"] += int(sale.get("total_qty", 0))
            summary["today_profit"] += float(sale.get("total_profit", 0.0))
            summary["today_transaction_count"] += 1

        for row in self.sale_refund_requests.values():
            summary = summaries.get(row.get("store_code", ""))
            if not summary:
                continue
            if row.get("status") == "pending_review":
                summary["pending_refund_requests"] += 1
            if row.get("status") == "approved" and self._nairobi_day_key(row.get("reviewed_at")) == today_key:
                summary["today_sales_amount"] -= float(row.get("refund_amount_total", 0.0) or 0.0)
                summary["today_profit"] -= float(row.get("refund_profit_reversal_total", 0.0) or 0.0)
                summary["today_refund_amount"] += float(row.get("refund_amount_total", 0.0) or 0.0)

        for transfer in self.transfer_orders.values():
            store_code = transfer.get("to_store_code", "")
            summary = summaries.get(store_code)
            if not summary:
                continue
            if transfer.get("status") in {"pending_approval", "approved", "dispatched", "receiving_in_progress"}:
                summary["pending_inbound_transfers"] += 1
            if transfer.get("discrepancy_approval_status") == "pending":
                summary["pending_discrepancies"] += 1

        for order in self.return_orders.values():
            store_code = order.get("from_store_code", "")
            summary = summaries.get(store_code)
            if not summary:
                continue
            if order.get("status") not in {"received", "cancelled"}:
                summary["pending_returns"] += 1

        for row in self.sale_void_requests.values():
            if row.get("status") != "pending_review":
                continue
            summary = summaries.get(row.get("store_code", ""))
            if summary:
                summary["pending_void_requests"] += 1

        for shift in self.cashier_shifts.values():
            store_code = shift.get("store_code", "")
            summary = summaries.get(store_code)
            if not summary:
                continue
            status = shift.get("status")
            if status == "open":
                summary["open_shift_count"] += 1
            elif status == "handover_pending":
                summary["handover_pending_count"] += 1

        for event in self.audit_events:
            if event.get("event_type") not in {"sale.price_override_alert", "sale.price_policy_breach"}:
                continue
            if self._nairobi_day_key(event.get("created_at")) != today_key:
                continue
            store_code = event.get("details", {}).get("store_code", "")
            summary = summaries.get(store_code)
            if summary:
                summary["today_price_alerts"] += 1

        for row in self.mpesa_collections:
            store_code = row.get("store_code", "")
            summary = summaries.get(store_code)
            if not summary:
                continue
            if self._nairobi_day_key(row.get("collected_at")) == today_key:
                summary["today_mpesa_amount"] += float(row.get("amount", 0.0))
            if row.get("match_status") == "unmatched":
                summary["unmatched_mpesa_count"] += 1

        for batch in self.offline_sync_batches.values():
            if self._nairobi_day_key(batch.get("uploaded_at")) != today_key:
                continue
            for store_code in batch.get("store_codes", []):
                summary = summaries.get(store_code)
                if summary:
                    summary["offline_failed_rows"] += int(batch.get("failed_count", 0))

        for anomaly in self.payment_anomalies.values():
            if anomaly.get("status") != "open":
                continue
            summary = summaries.get(anomaly.get("store_code", ""))
            if summary:
                summary["open_payment_anomalies"] += 1

        rows = []
        for summary in summaries.values():
            txn_count = summary["today_transaction_count"]
            summary["today_sales_amount"] = round(summary["today_sales_amount"], 2)
            summary["today_profit"] = round(summary["today_profit"], 2)
            summary["today_average_ticket"] = round(summary["today_sales_amount"] / txn_count, 2) if txn_count else 0.0
            summary["today_mpesa_amount"] = round(summary["today_mpesa_amount"], 2)
            summary["today_refund_amount"] = round(summary["today_refund_amount"], 2)
            rows.append(summary)

        return sorted(
            rows,
            key=lambda row: (
                row["status"] != "active",
                -row["today_sales_amount"],
                -row["qty_on_hand"],
                row["store_code"],
            ),
        )

    def get_store_closing_checklist(self, store_code: str) -> dict[str, Any]:
        store = self._ensure_store_exists(store_code)
        summary = next(
            row for row in self.get_store_operating_summary() if row["store_code"] == store["code"]
        )

        open_shifts: list[dict[str, Any]] = []
        for shift in self.list_cashier_shifts(store_code=store["code"]):
            if shift.get("status") not in {"open", "handover_pending"}:
                continue
            report = self._build_shift_report(shift["shift_no"], "t_report")
            open_shifts.append(
                {
                    "shift_no": shift["shift_no"],
                    "cashier_name": shift["cashier_name"],
                    "status": shift["status"],
                    "opened_at": shift["opened_at"],
                    "handover_status": shift.get("handover_status", "not_requested"),
                    "total_sales": report["total_sales"],
                    "total_profit": report["total_profit"],
                    "transaction_count": report["transaction_count"],
                    "cash_variance": shift.get("cash_variance"),
                }
            )

        pending_handovers = [
            {
                "handover_no": row["handover_no"],
                "shift_no": row["shift_no"],
                "cashier_name": row["cashier_name"],
                "requested_at": row["requested_at"],
                "status": row["status"],
                "cash_variance": row["cash_variance"],
            }
            for row in self.list_cashier_handover_logs(store_code=store["code"], status="pending_review")
        ]

        z_report_shift_no = None
        if len(pending_handovers) == 1:
            z_report_shift_no = pending_handovers[0]["shift_no"]
        elif len(open_shifts) == 1 and open_shifts[0]["status"] == "open":
            z_report_shift_no = open_shifts[0]["shift_no"]

        if summary["open_payment_anomalies"] > 0:
            recommended_next_step = "先处理支付异常单，再确认交班和 Z-report。"
        elif summary["pending_void_requests"] > 0:
            recommended_next_step = "先处理待审核作废单，再确认交班和 Z-report。"
        elif summary["pending_refund_requests"] > 0:
            recommended_next_step = "先处理待审核退货 / 退款单，再确认交班和 Z-report。"
        elif pending_handovers:
            recommended_next_step = "先让店长确认交班，再结算 Z-report。"
        elif any(row["status"] == "open" for row in open_shifts):
            recommended_next_step = "先申请交班；如确需直接关店，可直接结算当前班次 Z-report。"
        elif z_report_shift_no:
            recommended_next_step = "可以直接查看或结算当前门店的 Z-report。"
        else:
            recommended_next_step = "当前门店没有待结算班次，可先检查退仓和异常。"

        return {
            "store_code": summary["store_code"],
            "store_name": summary["store_name"],
            "status": summary["status"],
            "today_sales_amount": summary["today_sales_amount"],
            "today_profit": summary["today_profit"],
            "today_qty": summary["today_qty"],
            "qty_on_hand": summary["qty_on_hand"],
            "pending_inbound_transfers": summary["pending_inbound_transfers"],
            "pending_discrepancies": summary["pending_discrepancies"],
            "pending_returns": summary["pending_returns"],
            "pending_void_requests": summary["pending_void_requests"],
            "pending_refund_requests": summary["pending_refund_requests"],
            "open_payment_anomalies": summary["open_payment_anomalies"],
            "today_price_alerts": summary["today_price_alerts"],
            "today_refund_amount": summary["today_refund_amount"],
            "unmatched_mpesa_count": summary["unmatched_mpesa_count"],
            "offline_failed_rows": summary["offline_failed_rows"],
            "open_shifts": open_shifts,
            "pending_handovers": pending_handovers,
            "recommended_next_step": recommended_next_step,
            "z_report_shift_no": z_report_shift_no,
        }

    def list_audit_events(self) -> list[dict[str, Any]]:
        return sorted(self.audit_events, key=lambda row: row["id"], reverse=True)

    def _log_event(
        self,
        event_type: str,
        entity_type: str,
        entity_id: str,
        actor: str,
        summary: str,
        details: dict[str, Any],
    ) -> None:
        self.audit_events.append(
            {
                "id": next(self._audit_ids),
                "event_type": event_type,
                "entity_type": entity_type,
                "entity_id": entity_id,
                "actor": actor,
                "summary": summary,
                "created_at": now_iso(),
                "details": details,
            }
        )

    def _create_inventory_adjustments(self, order: dict[str, Any], approved_by: str, note: str) -> None:
        item_by_barcode = {item["barcode"]: item for item in order["items"]}
        for discrepancy in order["discrepancies"]:
            barcode = discrepancy["barcode"]
            expected_qty = discrepancy["expected_qty"]
            actual_qty = discrepancy["actual_qty"]
            issue_type = discrepancy["issue_type"]
            variance_qty = actual_qty - expected_qty
            item = item_by_barcode.get(barcode, {})

            action = "manual_review"
            status = "logged"

            if issue_type == "short":
                restore_allocations = item.get("pending_restore_allocations", [])
                if restore_allocations:
                    self._restore_lot_allocations_to_warehouse(
                        order["from_warehouse_code"],
                        barcode,
                        restore_allocations,
                    )
                    self._record_inventory_movement(
                        movement_type="warehouse_discrepancy_adjustment",
                        barcode=barcode,
                        product_name=self.get_product_by_barcode(barcode)["product_name"],
                        quantity_delta=sum(row["qty"] for row in restore_allocations),
                        location_type="warehouse",
                        location_code=order["from_warehouse_code"],
                        reference_type="transfer_order",
                        reference_no=order["transfer_no"],
                        actor=approved_by,
                        note="Short receipt restored to warehouse",
                        details={"issue_type": issue_type, "lot_allocations": restore_allocations},
                    )
                elif max(expected_qty - actual_qty, 0):
                    self._apply_warehouse_stock_delta(
                        order["from_warehouse_code"],
                        barcode,
                        max(expected_qty - actual_qty, 0),
                        movement_type="warehouse_discrepancy_adjustment",
                        reference_type="transfer_order",
                        reference_no=order["transfer_no"],
                        actor=approved_by,
                        note="Short receipt restored to warehouse",
                        details={"issue_type": issue_type},
                    )
                action = "restore_to_warehouse"
                status = "applied"
            elif issue_type == "excess":
                deduct_qty = max(actual_qty - expected_qty, 0)
                success = self._apply_warehouse_stock_delta(
                    order["from_warehouse_code"],
                    barcode,
                    -deduct_qty,
                    movement_type="warehouse_discrepancy_adjustment",
                    reference_type="transfer_order",
                    reference_no=order["transfer_no"],
                    actor=approved_by,
                    note="Excess receipt deducted from warehouse",
                    details={"issue_type": issue_type},
                )
                action = "deduct_from_warehouse"
                status = "applied" if success else "pending_manual_resolution"
            elif issue_type == "damaged":
                action = "write_off_review"
                status = "logged"
            elif issue_type == "wrong_item":
                action = "manual_item_reconciliation"
                status = "logged"

            self.inventory_adjustments.append(
                {
                    "id": next(self._adjustment_ids),
                    "transfer_no": order["transfer_no"],
                    "store_code": order["to_store_code"],
                    "warehouse_code": order["from_warehouse_code"],
                    "barcode": barcode,
                    "issue_type": issue_type,
                    "expected_qty": expected_qty,
                    "actual_qty": actual_qty,
                    "variance_qty": variance_qty,
                    "action": action,
                    "status": status,
                    "approved_by": approved_by,
                    "created_at": now_iso(),
                    "note": discrepancy.get("note", note),
                }
            )

    def _apply_warehouse_stock_delta(
        self,
        warehouse_code: str,
        barcode: str,
        delta_qty: int,
        movement_type: Optional[str] = None,
        reference_type: str = "",
        reference_no: str = "",
        actor: str = "",
        note: str = "",
        details: Optional[dict[str, Any]] = None,
    ) -> bool:
        product = self.get_product_by_barcode(barcode)
        stock_key = f"{warehouse_code}||{barcode}"
        if delta_qty > 0:
            unit_cost = (
                (details or {}).get("unit_cost")
                or self.warehouse_stock.get(stock_key, {}).get("cost_price")
                or product["cost_price"]
            )
            self._add_warehouse_lot(
                warehouse_code=warehouse_code,
                barcode=barcode,
                qty=delta_qty,
                unit_cost=unit_cost,
                source_type=(details or {}).get("source_type", movement_type or "adjustment"),
                source_no=reference_no or (details or {}).get("source_no", ""),
                rack_code=(details or {}).get("rack_code", self.warehouse_stock.get(stock_key, {}).get("rack_code", product["rack_code"])),
                note=note,
            )
        elif delta_qty < 0:
            lots = self.warehouse_lots.get(stock_key, [])
            total_qty = sum(lot.get("qty_on_hand", 0) for lot in lots)
            if total_qty < abs(delta_qty):
                return False
            self._consume_lots_fifo(lots, abs(delta_qty))
            self._sync_warehouse_stock_from_lots(warehouse_code, barcode)
        if movement_type and delta_qty != 0:
            self._record_inventory_movement(
                movement_type=movement_type,
                barcode=barcode,
                product_name=product["product_name"],
                quantity_delta=delta_qty,
                location_type="warehouse",
                location_code=warehouse_code,
                reference_type=reference_type,
                reference_no=reference_no,
                actor=actor,
                note=note,
                details=details or {},
            )
        return True

    def initialize_store_racks(
        self,
        store_code: str,
        template_rows: list[dict[str, Any]],
        initialized_by: str,
    ) -> list[dict[str, Any]]:
        store = self._ensure_store_exists(store_code)
        actor = self._require_user_role(initialized_by, {"store_manager", "area_supervisor"}, store_code=store["code"])
        created: list[dict[str, Any]] = []
        for template in template_rows:
            key = f"{store['code']}||{template['rack_code']}"
            if key not in self.store_rack_locations:
                self.store_rack_locations[key] = {
                    "store_code": store["code"],
                    "rack_code": template["rack_code"],
                    "category_hint": template["category_hint"],
                    "status": "active",
                    "created_at": now_iso(),
                    "updated_at": now_iso(),
                }
            created.append(self.store_rack_locations[key])
        self._log_event(
            event_type="store.racks_initialized",
            entity_type="store",
            entity_id=store["code"],
            actor=actor["username"],
            summary=f"Rack template initialized for {store['code']}",
            details={"rack_count": len(created)},
        )
        self._persist()
        return created

    def list_store_racks(self, store_code: str) -> list[dict[str, Any]]:
        store = self._ensure_store_exists(store_code)
        return [
            row for row in self.store_rack_locations.values()
            if row["store_code"] == store["code"]
        ]

    def assign_store_rack(self, store_code: str, barcode: str, rack_code: str, updated_by: str) -> dict[str, Any]:
        store = self._ensure_store_exists(store_code)
        actor = self._require_user_role(updated_by, {"store_manager", "area_supervisor"}, store_code=store["code"])
        rack_key = f"{store['code']}||{rack_code}"
        if rack_key not in self.store_rack_locations:
            raise HTTPException(status_code=404, detail=f"Unknown rack {rack_code} for store {store['code']}")

        stock_key = f"{store['code']}||{barcode}"
        store_row = self.store_stock.get(stock_key)
        if not store_row:
            raise HTTPException(status_code=404, detail=f"No store stock found for {barcode} in {store['code']}")

        previous_rack_code = str(store_row.get("store_rack_code") or "").strip().upper()
        store_row["store_rack_code"] = rack_code
        store_row["updated_at"] = now_iso()

        response = {
            "store_code": store["code"],
            "barcode": barcode,
            "rack_code": rack_code,
            "previous_rack_code": previous_rack_code,
            "updated_by": updated_by,
            "updated_at": store_row["updated_at"],
        }
        self._log_event(
            event_type="store.rack_assigned",
            entity_type="store_stock",
            entity_id=f"{store['code']}::{barcode}",
            actor=actor["username"],
            summary=f"Rack {rack_code} assigned to {barcode} in {store['code']}",
            details=response,
        )
        self._persist()
        return response

    def _reserve_transfer_inventory(self, order: dict[str, Any], actor: str) -> None:
        for item in order["items"]:
            stock_key = f"{order['from_warehouse_code']}||{item['barcode']}"
            warehouse_row = self.warehouse_stock.get(stock_key)
            available_qty = warehouse_row.get("qty_on_hand", 0) if warehouse_row else 0
            if available_qty < item["requested_qty"]:
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient warehouse stock for {item['barcode']}: requested {item['requested_qty']}, available {available_qty}",
                )

        for item in order["items"]:
            stock_key = f"{order['from_warehouse_code']}||{item['barcode']}"
            allocations = self._consume_lots_fifo(self.warehouse_lots[stock_key], item["requested_qty"])
            self._sync_warehouse_stock_from_lots(order["from_warehouse_code"], item["barcode"])
            item["approved_qty"] = item["requested_qty"]
            item["lot_allocations"] = allocations
            item["pending_restore_allocations"] = []
            item["received_lot_allocations"] = []
            self._record_inventory_movement(
                movement_type="warehouse_transfer_out",
                barcode=item["barcode"],
                product_name=item["product_name"],
                quantity_delta=-item["requested_qty"],
                location_type="warehouse",
                location_code=order["from_warehouse_code"],
                reference_type="transfer_order",
                reference_no=order["transfer_no"],
                actor=actor,
                note=f"Transfer to {order['to_store_code']}",
                details={"to_store_code": order["to_store_code"], "lot_allocations": allocations},
            )

    def _record_inventory_movement(
        self,
        movement_type: str,
        barcode: str,
        product_name: str,
        quantity_delta: int,
        location_type: str,
        location_code: str,
        reference_type: str,
        reference_no: str,
        actor: str,
        note: str = "",
        details: Optional[dict[str, Any]] = None,
    ) -> None:
        self.inventory_movements.append(
            {
                "id": next(self._movement_ids),
                "movement_type": movement_type,
                "barcode": barcode,
                "product_name": product_name,
                "quantity_delta": quantity_delta,
                "location_type": location_type,
                "location_code": location_code,
                "reference_type": reference_type,
                "reference_no": reference_no,
                "actor": actor,
                "note": note,
                "created_at": now_iso(),
                "details": details or {},
            }
        )


state = InMemoryState()
