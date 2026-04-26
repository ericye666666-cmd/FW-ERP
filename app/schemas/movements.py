from typing import Any, Optional

from pydantic import BaseModel


class InventoryMovementResponse(BaseModel):
    id: int
    movement_type: str
    barcode: str
    product_name: str
    quantity_delta: int
    location_type: str
    location_code: str
    reference_type: str
    reference_no: str
    actor: str
    note: str = ""
    created_at: str
    details: dict[str, Any] = {}


class InventoryMovementFilterResponse(BaseModel):
    total: int
    movements: list[InventoryMovementResponse]
