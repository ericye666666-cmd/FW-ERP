from typing import List, Optional

from pydantic import BaseModel, Field


class SaleLotAllocationResponse(BaseModel):
    lot_no: str
    qty: int
    unit_cost: float
    line_cost: float
    source_type: str = ""
    source_no: str = ""


class SaleItem(BaseModel):
    barcode: str = ""
    source_type: str = "STORE_ITEM"
    category: str = ""
    subcategory: str = ""
    legacy_category: str = ""
    legacy_subcategory: str = ""
    legacy_item_label: str = ""
    store_item_display_code: str = ""
    store_item_machine_code: str = ""
    source_sdo: str = ""
    source_package: str = ""
    assigned_employee: str = ""
    store_rack_code: str = ""
    category_summary: str = ""
    selected_price: Optional[float] = None
    qty: int = Field(ge=1)
    selling_price: float = Field(ge=0)
    override_reason: str = ""
    customer_id: str = ""


class SalePayment(BaseModel):
    method: str = Field(min_length=1)
    amount: float = Field(ge=0)
    reference: str = ""
    customer_id: str = ""
    customer_phone: str = ""
    payment_status: str = ""
    manual_confirmed: bool = False
    mpesa_manual_confirmed: bool = False
    confirmed_by: str = ""
    confirmed_at_local: Optional[str] = None
    confirmation_note: str = ""


class SaleCreate(BaseModel):
    order_no: str = Field(min_length=1)
    store_code: str = Field(min_length=1)
    cashier_name: str = Field(min_length=1, default="cashier_1")
    client_sale_id: str = ""
    sync_batch_no: str = ""
    shift_no: str = ""
    sold_at: Optional[str] = None
    power_mode: str = "online"
    note: str = ""
    items: List[SaleItem]
    payments: List[SalePayment]


class SaleItemResponse(BaseModel):
    identity_id: str = ""
    barcode: str = ""
    product_name: str = ""
    source_type: str = "STORE_ITEM"
    legacy_category: str = ""
    legacy_subcategory: str = ""
    legacy_item_label: str = ""
    store_item_display_code: str = ""
    store_item_machine_code: str = ""
    source_sdo: str = ""
    source_package: str = ""
    assigned_employee: str = ""
    store_rack_code: str = ""
    category_summary: str = ""
    selected_price: Optional[float] = None
    unit_price: Optional[float] = None
    qty: int
    launch_price: float
    expected_price: float
    price_cap: Optional[float] = None
    price_rule_no: str = ""
    cost_price: float
    average_cost_price: float
    selling_price: float
    line_total: float
    line_profit: float
    price_override: bool
    override_reason: str = ""
    customer_id: str = ""
    price_policy_breach: bool = False
    returned_qty: int = 0
    returned_amount_total: float = 0
    lot_allocations: List[SaleLotAllocationResponse] = []
    returned_lot_allocations: List[SaleLotAllocationResponse] = []


class SalePaymentResponse(BaseModel):
    method: str
    amount: float
    reference: str = ""
    customer_id: str = ""
    customer_phone: str = ""
    payment_status: str = ""
    manual_confirmed: bool = False
    mpesa_manual_confirmed: bool = False
    confirmed_by: str = ""
    confirmed_at_local: Optional[str] = None
    confirmation_note: str = ""


class SaleResponse(BaseModel):
    id: int
    sale_no: str = ""
    client_sale_id: str = ""
    sync_batch_no: str = ""
    order_no: str
    store_code: str
    cashier_name: str
    shift_no: str = ""
    sold_at: str
    total_qty: int
    total_amount: float
    payment_total: float
    sale_status: str = "completed"
    void_no: str = ""
    void_request_count: int = 0
    refund_no: str = ""
    refund_request_count: int = 0
    refund_amount_total: float = 0
    refund_qty_total: int = 0
    payment_status: str = "paid"
    amount_due: float = 0
    amount_overpaid: float = 0
    local_persisted: bool = False
    db_sync_status: str = "not_configured"
    db_sync_error: str = ""
    db_sync_pending: bool = False
    db_sync_failed_at: Optional[str] = None
    payment_anomaly_count: int = 0
    payment_anomaly_nos: List[str] = []
    change_due: float
    total_cost: float
    total_profit: float
    power_mode: str
    note: str = ""
    override_alert_count: int
    policy_breach_count: int = 0
    voided_at: Optional[str] = None
    voided_by: str = ""
    void_reason: str = ""
    refunded_at: Optional[str] = None
    refunded_by: str = ""
    refund_reason: str = ""
    identity_ids: List[str] = []
    items: List[SaleItemResponse]
    payments: List[SalePaymentResponse]


class SimulatedSaleRowResponse(BaseModel):
    identity_id: str
    barcode: str
    order_no: str
    store_code: str
    shift_no: str = ""
    cashier_name: str = ""
    days_ago: int = 0
    sold_at: str
    selling_price: float


class RecentStoreSalesSimulationRequest(BaseModel):
    days: int = Field(default=14, ge=1, le=14)
    max_items: int = Field(default=14, ge=1, le=500)
    cashier_name: str = ""
    identity_ids: List[str] = Field(default_factory=list)
    note: str = ""


class RecentStoreSalesSimulationResponse(BaseModel):
    store_code: str
    days: int = 14
    max_items: int = 14
    generated_by: str = ""
    sales_actor: str = ""
    shift_no: str = ""
    generated_count: int = 0
    total_qty: int = 0
    total_amount: float = 0
    initial_qty_on_hand: int = 0
    remaining_qty_on_hand: int = 0
    consumed_qty: int = 0
    sales: List[SimulatedSaleRowResponse] = []


class StoreRetailSeedRequest(BaseModel):
    max_items: int = Field(default=24, ge=1, le=500)
    note: str = ""


class StoreRetailSeedRowResponse(BaseModel):
    identity_id: str
    barcode: str
    product_name: str
    category_main: str = ""
    category_sub: str = ""
    store_code: str
    store_rack_code: str = ""
    selling_price: float = 0
    unit_cost: float = 0
    seeded_at: str


class StoreRetailSeedResponse(BaseModel):
    store_code: str
    seeded_by: str = ""
    generated_count: int = 0
    initial_qty_on_hand: int = 0
    current_qty_on_hand: int = 0
    remaining_available_token_count: int = 0
    source_statuses: List[str] = Field(default_factory=list)
    items: List[StoreRetailSeedRowResponse] = Field(default_factory=list)
