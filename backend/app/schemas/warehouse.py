from typing import Optional

from pydantic import BaseModel, Field


class GoodsReceiptItemCreate(BaseModel):
    barcode: str = Field(min_length=1)
    received_qty: int = Field(ge=1)
    cost_price: Optional[float] = Field(default=None, ge=0)


class GoodsReceiptCreate(BaseModel):
    receipt_no: str = Field(min_length=1)
    warehouse_code: str = Field(min_length=1)
    supplier_code: str = ""
    supplier_name: str = Field(min_length=1)
    receipt_date: str = Field(min_length=1)
    created_by: str = Field(min_length=1, default="warehouse_clerk_1")
    items: list[GoodsReceiptItemCreate]


class GoodsReceiptItemResponse(BaseModel):
    barcode: str
    product_name: str
    received_qty: int
    cost_price: float
    rack_code: str
    lot_no: str = ""


class GoodsReceiptResponse(BaseModel):
    id: int
    receipt_no: str
    warehouse_code: str
    supplier_code: str = ""
    supplier_name: str
    receipt_date: str
    created_by: str
    status: str
    created_at: str
    items: list[GoodsReceiptItemResponse]


class WarehouseStockResponse(BaseModel):
    warehouse_code: str
    barcode: str
    product_name: str
    rack_code: str
    qty_on_hand: int
    cost_price: float
    lot_count: int = 0
    updated_at: str


class StoreStockResponse(BaseModel):
    store_code: str
    barcode: str
    product_name: str
    qty_on_hand: int
    cost_price: float = 0
    lot_count: int = 0
    store_rack_code: str = ""
    updated_at: str


class StoreStockLookupResponse(BaseModel):
    store_code: str
    barcode: str
    product_name: str
    category_main: str
    category_sub: str
    qty_on_hand: int
    launch_price: float
    expected_price: float
    price_cap: Optional[float] = None
    price_rule_no: str = ""
    cost_price: float = 0
    lot_count: int = 0
    store_rack_code: str = ""
