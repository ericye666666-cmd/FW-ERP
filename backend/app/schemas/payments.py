from typing import Optional

from pydantic import BaseModel, Field


class PaymentAnomalyResponse(BaseModel):
    anomaly_no: str
    anomaly_type: str
    status: str
    store_code: str
    order_no: str = ""
    shift_no: str = ""
    payment_method: str = ""
    amount_expected: float = 0
    amount_received: float = 0
    amount_difference: float = 0
    reference: str = ""
    customer_id: str = ""
    source_type: str = ""
    note: str = ""
    created_at: str
    created_by: str
    resolved_at: Optional[str] = None
    resolved_by: str = ""
    resolution_note: str = ""
    resolution_action: str = ""
    resolution_amount: float = 0
    resolution_reference: str = ""
    corrected_order_no: str = ""
    corrected_store_code: str = ""
    follow_up_status: str = ""
    linked_receipt_no: str = ""


class PaymentAnomalyResolveRequest(BaseModel):
    action: str = Field(min_length=1)
    note: str = Field(min_length=1)
    amount: float = 0
    order_no: str = ""
    store_code: str = ""
    payment_method: str = ""
    reference: str = ""
    customer_id: str = ""
