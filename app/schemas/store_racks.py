from typing import List

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


class StoreRackInitializationResponse(BaseModel):
    store_code: str
    total_racks: int
    racks: List[StoreRackLocationResponse]
