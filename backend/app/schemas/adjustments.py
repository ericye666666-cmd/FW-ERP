from pydantic import BaseModel


class InventoryAdjustmentResponse(BaseModel):
    id: int
    transfer_no: str
    store_code: str
    warehouse_code: str
    barcode: str
    issue_type: str
    expected_qty: int
    actual_qty: int
    variance_qty: int
    action: str
    status: str
    approved_by: str
    created_at: str
    note: str = ""
