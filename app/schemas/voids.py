from typing import Optional

from pydantic import BaseModel, Field


class SaleVoidRequestCreate(BaseModel):
    reason: str = Field(min_length=1)
    note: str = ""


class SaleVoidReviewRequest(BaseModel):
    approved: bool = True
    note: str = ""


class SaleVoidRequestResponse(BaseModel):
    void_no: str
    order_no: str
    sale_id: int
    store_code: str
    shift_no: str = ""
    cashier_name: str
    sale_status: str = "completed"
    payment_status: str = "paid"
    total_amount: float
    total_profit: float = 0
    status: str
    reason: str
    note: str = ""
    requested_at: str
    requested_by: str
    reviewed_at: Optional[str] = None
    reviewed_by: Optional[str] = None
    review_note: str = ""
