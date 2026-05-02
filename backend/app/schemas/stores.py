from typing import Any, Optional

from pydantic import BaseModel, Field


class StoreResponse(BaseModel):
    code: str
    name: str
    status: str
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    google_maps_url: Optional[str] = None
    catchment_area: Optional[str] = None
    manager_note: Optional[str] = None
    created_at: Optional[str] = None


class StoreCreate(BaseModel):
    code: str = Field(min_length=2)
    name: str = Field(min_length=1)
    status: str = "active"
    address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    google_maps_url: Optional[str] = None
    catchment_area: Optional[str] = None
    manager_note: Optional[str] = None
    created_by: str = Field(min_length=1, default="admin_1")


class StoreSiteRecommendationRequest(BaseModel):
    store_name: str = Field(min_length=2)
    address: str = Field(min_length=3)
    google_maps_url: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    catchment_area: Optional[str] = None
    area_type: str = Field(default="mixed")
    estimated_hourly_footfall: int = Field(default=0, ge=0)
    competitor_count: int = Field(default=0, ge=0)
    frontage_score: int = Field(default=5, ge=1, le=10)
    visibility_score: int = Field(default=5, ge=1, le=10)
    access_score: int = Field(default=5, ge=1, le=10)
    rent_pressure_score: int = Field(default=5, ge=1, le=10)
    street_view_observation: Optional[str] = None


class StoreSiteRecommendationResponse(BaseModel):
    recommendation_no: str
    store_name: str
    fit_score: int
    decision: str
    summary: str
    reasons: list[str]
    next_actions: list[str]
    google_maps_url: Optional[str] = None
    address: str


class BarcodeSettingsResponse(BaseModel):
    type: str
    printer_model: str
    approval_role_for_transfer: str
    pos_mode: str


class LabelTemplateResponse(BaseModel):
    template_code: str
    name: str
    template_scope: str = "product"
    description: Optional[str] = None
    paper_preset: str = ""
    width_mm: int
    height_mm: int
    barcode_type: str
    fields: list[str]
    layout: dict[str, Any] = Field(default_factory=dict)
    is_active: bool = True
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class LabelTemplateSaveRequest(BaseModel):
    template_code: str = Field(min_length=2)
    name: str = Field(min_length=1)
    template_scope: str = Field(default="bale", min_length=1)
    description: Optional[str] = None
    paper_preset: str = ""
    width_mm: int = Field(default=60, ge=20, le=120)
    height_mm: int = Field(default=40, ge=20, le=120)
    barcode_type: str = Field(default="Code128", min_length=1)
    fields: list[str] = Field(default_factory=list, min_length=1)
    layout: dict[str, Any] = Field(default_factory=dict)
    is_active: bool = True


class StoreOperatingSummaryResponse(BaseModel):
    store_code: str
    store_name: str
    status: str
    today_sales_amount: float
    today_qty: int
    today_profit: float
    today_transaction_count: int
    today_average_ticket: float
    qty_on_hand: int
    sku_count: int
    pending_inbound_transfers: int
    pending_discrepancies: int
    pending_returns: int
    pending_void_requests: int
    pending_refund_requests: int
    open_payment_anomalies: int
    open_shift_count: int
    handover_pending_count: int
    today_price_alerts: int
    today_cash_amount: float
    today_mpesa_amount: float
    today_legacy_stock_sales_amount: float
    today_store_item_sales_amount: float
    today_refund_amount: float
    unmatched_mpesa_count: int
    offline_failed_rows: int
    last_sale_at: Optional[str] = None
