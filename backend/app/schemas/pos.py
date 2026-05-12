from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class CashierShiftOpenRequest(BaseModel):
    store_code: str = Field(min_length=1)
    opening_float_cash: float = Field(ge=0)
    note: str = ""


class CashierShiftCloseRequest(BaseModel):
    closing_cash_counted: float = Field(ge=0)
    note: str = ""


class CashierHandoverRequest(BaseModel):
    closing_cash_counted: float = Field(ge=0)
    note: str = ""


class CashierHandoverReviewRequest(BaseModel):
    approved: bool = True
    note: str = ""


class CashierShiftSummary(BaseModel):
    shift_no: str
    store_code: str
    cashier_name: str
    status: str
    opened_at: str
    opened_by: str
    opening_float_cash: float
    closed_at: Optional[str] = None
    closed_by: Optional[str] = None
    closing_cash_counted: Optional[float] = None
    cash_variance: Optional[float] = None
    handover_status: str = "not_requested"
    handover_requested_at: Optional[str] = None
    handover_requested_by: Optional[str] = None
    handover_reviewed_at: Optional[str] = None
    handover_reviewed_by: Optional[str] = None
    note: str = ""


class PosShiftOpenRequest(BaseModel):
    cashier_id: str = Field(min_length=1)
    terminal_id: str = ""
    opening_float: float = Field(ge=0)
    note: str = ""


class PosShiftCloseRequest(BaseModel):
    counted_cash: float = Field(ge=0)
    note: str = ""
    manager_confirmed_by: str = ""


class PosShiftResponse(BaseModel):
    shift_id: str
    store_code: str
    cashier_id: str
    terminal_id: str = ""
    opening_float: float
    opened_at: str
    opened_by: str
    status: str
    closed_at: Optional[str] = None
    closed_by: Optional[str] = None
    manager_confirmed_by: str = ""
    counted_cash: Optional[float] = None
    expected_cash: Optional[float] = None
    cash_variance: Optional[float] = None
    note: str = ""


class PosShiftSummaryResponse(BaseModel):
    shift_id: str
    store_code: str
    cashier_id: str
    terminal_id: str = ""
    status: str
    opening_float: float
    opened_at: str
    total_sales: float
    order_count: int
    cash_sales: float
    mpesa_sales: float
    mixed_cash: float
    mixed_mpesa: float
    expected_cash: float
    hold_count: int = 0
    cancelled_order_count: int = 0
    counted_cash: Optional[float] = None
    cash_variance: Optional[float] = None
    closed_at: Optional[str] = None
    closed_by: Optional[str] = None
    manager_confirmed_by: str = ""
    note: str = ""


class PosShiftReportPaymentBreakdown(BaseModel):
    method: str
    amount: float
    orders: int


class PosShiftReportCategoryBreakdown(BaseModel):
    category: str
    qty: int
    amount: float
    store_item_qty: int = 0
    manual_qty: int = 0


class PosShiftReportResponse(BaseModel):
    report_type: str
    store_code: str
    shift_id: str
    cashier_id: str
    terminal_id: str = ""
    status: str
    opened_at: str
    closed_at: Optional[str] = None
    closed_by: Optional[str] = None
    manager_confirmed_by: str = ""
    generated_at: str
    opening_float: float
    total_sales: float
    order_count: int
    item_count: int
    manual_item_count: int = 0
    manual_sales_amount: float = 0
    cash_sales: float
    mpesa_sales: float
    mixed_cash: float
    mixed_mpesa: float
    expected_cash: float
    counted_cash: Optional[float] = None
    cash_variance: Optional[float] = None
    hold_count: int = 0
    active_hold_count: int = 0
    completed_hold_count: int = 0
    cancelled_hold_count: int = 0
    cancelled_order_count: int = 0
    payment_breakdown: List[PosShiftReportPaymentBreakdown] = Field(default_factory=list)
    category_breakdown: List[PosShiftReportCategoryBreakdown] = Field(default_factory=list)


class PosHoldItemCreate(BaseModel):
    machine_code: str = Field(min_length=1)
    display_code: str = ""
    final_price: float = Field(ge=0)
    discount_amount: float = Field(default=0, ge=0)


class PosHoldCreateRequest(BaseModel):
    cashier_id: str = Field(min_length=1)
    shift_id: str = Field(min_length=1)
    terminal_id: str = ""
    reason: str = ""
    customer_name: str = ""
    customer_phone: str = ""
    note: str = ""
    items: List[PosHoldItemCreate]


class PosHoldCancelRequest(BaseModel):
    cancel_reason: str = ""


class PosHoldItemResponse(BaseModel):
    hold_id: str
    hold_no: str = ""
    line_no: int
    store_item_id: str
    display_code: str
    machine_code: str
    category: str = ""
    shelf_location: str = ""
    original_price: float
    final_price: float
    discount_amount: float = 0
    previous_status: str = ""
    previous_sale_status: str = ""
    previous_store_item_status: str = ""
    hold_status: str = "held"
    store_code: str


class PosHoldResponse(BaseModel):
    hold_id: str
    hold_no: str
    store_code: str
    cashier_id: str
    shift_id: str
    terminal_id: str = ""
    reason: str = ""
    customer_name: str = ""
    customer_phone: str = ""
    note: str = ""
    status: str = "held"
    created_at: str
    created_by: str = ""
    resumed_at: Optional[str] = None
    resumed_by: str = ""
    completed_sale_id: str = ""
    completed_at: Optional[str] = None
    completed_by: str = ""
    cancelled_at: Optional[str] = None
    cancelled_by: str = ""
    cancel_reason: str = ""
    item_count: int = 0
    total_amount: float = 0
    items: List[PosHoldItemResponse] = Field(default_factory=list)


class PosHoldListResponse(BaseModel):
    store_code: str
    holds: List[PosHoldResponse]


class CashierHandoverLogResponse(BaseModel):
    handover_no: str
    shift_no: str
    store_code: str
    cashier_name: str
    requested_at: str
    requested_by: str
    closing_cash_counted: float
    expected_cash: float
    cash_variance: float
    status: str
    note: str = ""
    reviewed_at: Optional[str] = None
    reviewed_by: Optional[str] = None
    review_note: str = ""


class PosReportResponse(BaseModel):
    report_type: str
    shift_no: str
    store_code: str
    cashier_name: str
    status: str
    opened_at: str
    closed_at: Optional[str] = None
    opening_float_cash: float
    closing_cash_counted: Optional[float] = None
    cash_variance: Optional[float] = None
    total_sales: float
    refund_total: float = 0
    total_qty: int
    total_profit: float
    refund_profit_reversal: float = 0
    transaction_count: int
    refund_count: int = 0
    override_alert_count: int
    payment_breakdown: Dict[str, float] = Field(default_factory=dict)
    offline_transaction_count: int = 0
    mpesa_customer_ids: List[str] = Field(default_factory=list)
    mpesa_imported_total: float = 0
    mpesa_imported_count: int = 0
    mpesa_unmatched_count: int = 0


class StoreClosingChecklistShift(BaseModel):
    shift_no: str
    cashier_name: str
    status: str
    opened_at: str
    handover_status: str = "not_requested"
    total_sales: float
    total_profit: float
    transaction_count: int
    cash_variance: Optional[float] = None


class StoreClosingChecklistHandover(BaseModel):
    handover_no: str
    shift_no: str
    cashier_name: str
    requested_at: str
    status: str
    cash_variance: float


class StoreClosingChecklistResponse(BaseModel):
    store_code: str
    store_name: str
    status: str
    today_sales_amount: float
    today_profit: float
    today_qty: int
    qty_on_hand: int
    pending_inbound_transfers: int
    pending_discrepancies: int
    pending_returns: int
    pending_void_requests: int
    pending_refund_requests: int
    open_payment_anomalies: int
    today_price_alerts: int
    today_refund_amount: float
    unmatched_mpesa_count: int
    offline_failed_rows: int
    open_shifts: List[StoreClosingChecklistShift] = Field(default_factory=list)
    pending_handovers: List[StoreClosingChecklistHandover] = Field(default_factory=list)
    recommended_next_step: str
    z_report_shift_no: Optional[str] = None
