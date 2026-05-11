from typing import List, Optional

from pydantic import BaseModel, Field


class StoreRackTemplateResponse(BaseModel):
    rack_code: str
    category_hint: str


class StoreRackLocationResponse(BaseModel):
    store_code: str
    rack_code: str
    category_hint: str
    status: str
    created_at: str
    updated_at: str
    id: Optional[str] = ""
    location_code: Optional[str] = ""
    location_name: Optional[str] = ""
    location_type: Optional[str] = "SHELF"
    category_code: Optional[str] = ""
    category_name: Optional[str] = ""
    active: Optional[bool] = True
    sort_order: Optional[int] = 0
    item_count: Optional[int] = 0


class StoreRackLocationUpsertRequest(BaseModel):
    location_code: str = Field(min_length=1)
    location_name: str = Field(min_length=1)
    location_type: str = Field(default="SHELF")
    category_code: str = ""
    category_name: str = ""
    active: bool = True
    sort_order: int = 0
    updated_by: str = Field(min_length=1, default="store_manager_1")


class StoreRackAssignmentRequest(BaseModel):
    barcode: str = Field(min_length=1)
    rack_code: str = Field(min_length=1)
    updated_by: str = Field(min_length=1, default="store_manager_1")


class StoreRackAssignmentResponse(BaseModel):
    store_code: str
    barcode: str
    rack_code: str
    updated_by: str
    updated_at: str


class StoreItemStockInConfirmRequest(BaseModel):
    location_code: str = Field(min_length=1)
    confirmed_by: str = ""


class StoreItemStockInConfirmResponse(BaseModel):
    store_code: str
    machine_code: str
    current_location_code: str
    location_type: str
    stock_in_confirmed: bool
    stock_in_confirmed_at: str
    stock_in_confirmed_by: str
    status: str


class StoreRackInitializationResponse(BaseModel):
    store_code: str
    total_racks: int
    racks: List[StoreRackLocationResponse]
