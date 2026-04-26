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
