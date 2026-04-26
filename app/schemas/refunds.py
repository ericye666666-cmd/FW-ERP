from typing import List, Optional

from pydantic import BaseModel, Field


class SaleRefundItemCreate(BaseModel):
    barcode: str = Field(min_length=1)
    qty: int = Field(ge=1)
    note: str = ""


class SaleRefundRequestCreate(BaseModel):
    reason: str = Field(min_length=1)
    note: str = ""
    shift_no: str = ""
    refund_method: str = "cash"
    items: List[SaleRefundItemCreate]


class SaleRefundReviewRequest(BaseModel):
    approved: bool = True
    note: str = ""


class SaleRefundItemResponse(BaseModel):
    identity_id: str = ""
    barcode: str
    product_name: str
    requested_qty: int
    refundable_qty: int
    refund_amount: float
    refund_cost: float
    refund_profit_reversal: float
    note: str = ""


class SaleRefundRequestResponse(BaseModel):
    refund_no: str
    order_no: str
    sale_id: int
    store_code: str
    original_shift_no: str = ""
    refund_shift_no: str = ""
    cashier_name: str
    sale_status: str = "completed"
    payment_status: str = "paid"
    refund_method: str = "cash"
    total_amount: float
    total_profit: float = 0
    refund_amount_total: float = 0
    refund_cost_total: float = 0
    refund_profit_reversal_total: float = 0
    status: str
    reason: str
    note: str = ""
    requested_at: str
    requested_by: str
    reviewed_at: Optional[str] = None
    reviewed_by: str = ""
    review_note: str = ""
    items: List[SaleRefundItemResponse] = []
