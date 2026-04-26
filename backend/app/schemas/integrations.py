from typing import List, Optional

from pydantic import BaseModel, Field

from app.schemas.sales import SaleItem, SalePayment


class MpesaCollectionImportItem(BaseModel):
    receipt_no: str = Field(min_length=1)
    store_code: str = Field(min_length=1)
    amount: float = Field(ge=0)
    collected_at: str = Field(min_length=1)
    customer_id: str = ""
    phone_number: str = ""
    payer_name: str = ""
    reference: str = ""
    note: str = ""


class MpesaCollectionImportRequest(BaseModel):
    source_batch_no: str = ""
    items: List[MpesaCollectionImportItem]


class MpesaCollectionResponse(BaseModel):
    id: int
    receipt_no: str
    store_code: str
    amount: float
    collected_at: str
    imported_at: str
    imported_by: str
    customer_id: str = ""
    phone_number: str = ""
    payer_name: str = ""
    reference: str = ""
    note: str = ""
    match_status: str
    matched_order_no: str = ""
    matched_shift_no: str = ""
    matched_at: Optional[str] = None
    source_batch_no: str = ""


class MpesaCustomerInsightResponse(BaseModel):
    customer_id: str
    transaction_count: int
    total_spent: float
    last_seen_at: str = ""
    stores: List[str] = Field(default_factory=list)
    order_nos: List[str] = Field(default_factory=list)
    average_ticket: float = 0


class MpesaCallbackResponse(BaseModel):
    status: str
    message: str
    result_code: int = 0
    result_desc: str = ""
    source_batch_no: str = ""
    receipt_no: str = ""
    store_code: str = ""
    amount: float = 0
    customer_id: str = ""
    match_status: str = ""
    matched_order_no: str = ""
    matched_shift_no: str = ""


class OfflineSaleSyncEntry(BaseModel):
    client_sale_id: str = Field(min_length=1)
    order_no: str = Field(min_length=1)
    store_code: str = Field(min_length=1)
    cashier_name: str = ""
    shift_no: str = ""
    sold_at: Optional[str] = None
    power_mode: str = "offline"
    note: str = ""
    items: List[SaleItem]
    payments: List[SalePayment]


class OfflineSaleSyncBatchRequest(BaseModel):
    device_id: str = Field(min_length=1)
    note: str = ""
    sales: List[OfflineSaleSyncEntry]


class OfflineSaleSyncResult(BaseModel):
    client_sale_id: str
    order_no: str
    status: str
    message: str = ""
    sale_id: Optional[int] = None


class OfflineSaleSyncBatchResponse(BaseModel):
    sync_batch_no: str
    store_codes: List[str] = Field(default_factory=list)
    device_id: str
    uploaded_at: str
    uploaded_by: str
    note: str = ""
    accepted_count: int
    duplicate_count: int
    failed_count: int
    results: List[OfflineSaleSyncResult] = Field(default_factory=list)
