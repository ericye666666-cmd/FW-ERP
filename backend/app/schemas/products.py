from typing import Optional

from pydantic import BaseModel, Field


class ProductCreate(BaseModel):
    product_name: str = ""
    category_main: str = Field(min_length=1)
    category_sub: str = ""
    supplier_code: str = ""
    supplier_name: str = Field(min_length=1)
    cost_price: float = Field(default=0, ge=0)
    launch_price: float = Field(default=0, ge=0)
    rack_code: str = ""
    label_template_code: str = "apparel_60x40"
    created_by: str = Field(min_length=1, default="warehouse_clerk_1")


class ProductBarcodeAssignRequest(BaseModel):
    barcode: str = ""
    assigned_by: str = Field(min_length=1, default="warehouse_clerk_1")


class ProductResponse(ProductCreate):
    id: int
    product_code: str
    barcode: str = ""
    barcode_assigned_at: Optional[str] = None
    barcode_assigned_by: str = ""
    status: str = "active"


class ProductImportRow(BaseModel):
    row_no: int
    supplier_name: str = ""
    category_main: str = ""
    category_sub: str = ""
    product_name: str = ""
    valid: bool = False
    issues: list[str] = Field(default_factory=list)


class ProductImportPreviewResponse(BaseModel):
    file_name: str = ""
    total_rows: int = 0
    valid_rows: int = 0
    invalid_rows: int = 0
    rows: list[ProductImportRow] = Field(default_factory=list)


class ProductBulkCreateRequest(BaseModel):
    items: list[ProductCreate] = Field(default_factory=list)
