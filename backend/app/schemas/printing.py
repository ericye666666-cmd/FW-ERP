from typing import Any, Dict, Optional

from pydantic import BaseModel, Field

from .sorting import StoreDispatchBaleResponse


class LabelPrintJobCreate(BaseModel):
    barcode: str = Field(min_length=1)
    copies: int = Field(default=1, ge=1, le=100)
    printer_name: str = "Deli DL-720C"
    requested_by: str = Field(min_length=1, default="warehouse_clerk_1")


class ItemBarcodeTokenPrintJobCreate(BaseModel):
    token_nos: list[str] = Field(min_length=1)
    copies: int = Field(default=1, ge=1, le=20)
    printer_name: str = "Deli DL-720C"
    template_code: str = "apparel_40x30"
    requested_by: str = Field(min_length=1, default="store_manager_1")


class BaleBarcodePrintItem(BaseModel):
    bale_barcode: str = Field(min_length=1)
    copies: int = Field(default=1, ge=1, le=20)


class BaleBarcodePrintRequest(BaseModel):
    shipment_no: str = Field(min_length=1)
    printer_name: str = "Deli DL-720C"
    template_code: str = "warehouse_in"
    requested_by: str = Field(min_length=1, default="warehouse_clerk_1")
    items: list[BaleBarcodePrintItem] = Field(default_factory=list, min_length=1)


class StorePrepBalePrintJobCreate(BaseModel):
    copies: int = Field(default=1, ge=1, le=20)
    printer_name: str = "Deli DL-720C"
    template_code: str = ""
    requested_by: str = Field(min_length=1, default="warehouse_clerk_1")


class DocumentPrintJobCreate(BaseModel):
    copies: int = Field(default=1, ge=1, le=100)
    printer_name: str = "Deli DL-720C"
    requested_by: str = Field(min_length=1, default="warehouse_clerk_1")


class TransferDispatchBundleRequest(BaseModel):
    copies: int = Field(default=1, ge=1, le=100)
    printer_name: str = "Deli DL-720C"
    requested_by: str = Field(min_length=1, default="warehouse_clerk_1")
    label_copies_mode: str = Field(default="approved_qty")
    grouping_mode: str = Field(default="by_category")
    max_items_per_bale: int = Field(default=30, ge=1, le=200)


class PrintJobFailureRequest(BaseModel):
    note: str = ""


class BaleLabelPrintJobCreate(BaseModel):
    code: str = Field(min_length=1)
    supplier: str = ""
    category: str = ""
    subcategory: str = ""
    batch: str = ""
    ship_reference: str = ""
    total_number: int = Field(default=0, ge=0)
    sequence_number: int = Field(default=0, ge=0)


class PrintStationClaimRequest(BaseModel):
    station_id: str = Field(min_length=1)


class PrintStationCompleteRequest(BaseModel):
    station_id: str = Field(min_length=1)


class PrintStationFailRequest(BaseModel):
    station_id: str = Field(min_length=1)
    error_message: str = Field(min_length=1)


class BaleLabelPrintJobResponse(BaseModel):
    id: int
    label_type: str = "BALE_LABEL"
    code: str
    supplier: str = ""
    category: str = ""
    subcategory: str = ""
    batch: str = ""
    ship_reference: str = ""
    total_number: int = 0
    sequence_number: int = 0
    requested_by: str
    requested_at: str
    status: str
    station_id: str = ""
    claimed_at: Optional[str] = None
    printed_at: Optional[str] = None
    error_message: str = ""


class PrintJobResponse(BaseModel):
    id: int
    job_type: str
    status: str
    created_at: str
    product_id: Optional[int] = None
    document_no: str = ""
    barcode: str = ""
    product_name: str = ""
    template_code: str = ""
    label_size: str = ""
    copies: int
    printer_name: str
    requested_by: str
    printed_at: Optional[str] = None
    printed_by: str = ""
    error_message: str = ""
    print_payload: Dict[str, Any] = Field(default_factory=dict)


class SystemPrinterResponse(BaseModel):
    name: str
    device_uri: str = ""
    is_default: bool = False
    status_text: str = ""
    is_ready: bool = False
    supported_page_sizes: list[str] = Field(default_factory=list)


class TransferDispatchBundleResponse(BaseModel):
    transfer_no: str
    status: str = ""
    delivery_batch_no: str = ""
    shipment_session_no: str = ""
    transfer_print_job: PrintJobResponse
    label_print_jobs: list[PrintJobResponse]
    total_label_copies: int
    generated_bale_count: int = 0
    store_dispatch_bales: list[StoreDispatchBaleResponse] = Field(default_factory=list)


class BaleBarcodePrintResponse(BaseModel):
    shipment_no: str
    print_jobs: list[PrintJobResponse]
    total_selected_bales: int
    total_print_copies: int


class BaleDirectPrintRequest(BaseModel):
    printer_name: str = "Deli DL-720C"
    template_code: str = "warehouse_in"
    template_scope: str = ""
    copies: int = Field(default=1, ge=1, le=20)
    barcode_value: str = Field(min_length=1)
    scan_token: str = ""
    bale_barcode: str = ""
    legacy_bale_barcode: str = ""
    supplier_name: str = ""
    category_main: str = ""
    category_sub: str = ""
    category_display: str = ""
    package_position_label: str = ""
    serial_no: int = 0
    total_packages: int = 0
    shipment_no: str = ""
    parcel_batch_no: str = ""
    unload_date: str = ""
    store_name: str = ""
    transfer_order_no: str = ""
    bale_piece_summary: str = ""
    total_quantity: str = ""
    packing_list: str = ""
    dispatch_bale_no: str = ""
    outbound_time: str = ""
    status: str = ""
    cat: str = ""
    sub: str = ""
    grade: str = ""
    qty: str = ""
    weight: str = ""
    code: str = ""


class BaleDirectPrintBatchItem(BaseModel):
    barcode_value: str = Field(min_length=1)
    scan_token: str = ""
    bale_barcode: str = ""
    legacy_bale_barcode: str = ""
    template_scope: str = ""
    copies: int = Field(default=1, ge=1, le=20)
    supplier_name: str = ""
    category_main: str = ""
    category_sub: str = ""
    category_display: str = ""
    package_position_label: str = ""
    serial_no: int = 0
    total_packages: int = 0
    shipment_no: str = ""
    parcel_batch_no: str = ""
    unload_date: str = ""
    store_name: str = ""
    transfer_order_no: str = ""
    bale_piece_summary: str = ""
    total_quantity: str = ""
    packing_list: str = ""
    dispatch_bale_no: str = ""
    outbound_time: str = ""
    status: str = ""
    cat: str = ""
    sub: str = ""
    grade: str = ""
    qty: str = ""
    weight: str = ""
    code: str = ""


class BaleDirectPrintBatchRequest(BaseModel):
    printer_name: str = "Deli DL-720C"
    template_code: str = "warehouse_in"
    items: list[BaleDirectPrintBatchItem] = Field(default_factory=list, min_length=1)


class LabelCandidatePrintBlock(BaseModel):
    type: str = Field(min_length=1)
    value: str = ""
    values: list[str] = Field(default_factory=list)
    x_mm: float = Field(default=0, ge=0, le=120)
    y_mm: float = Field(default=0, ge=0, le=120)
    w_mm: float = Field(default=10, ge=0.1, le=120)
    h_mm: float = Field(default=4, ge=0.1, le=120)
    align: str = "left"
    font_size: float = Field(default=8, ge=4, le=80)
    font_weight: str = "700"


class LabelCandidatePrintRequest(BaseModel):
    candidate_id: str = Field(min_length=1)
    printer_name: str = "Deli DL-720C"
    width_mm: float = Field(default=60, ge=20, le=120)
    height_mm: float = Field(default=40, ge=20, le=120)
    label_size: str = "60x40"
    blocks: list[LabelCandidatePrintBlock] = Field(default_factory=list, min_length=1)


class LabelCandidateBatchItem(BaseModel):
    candidate_id: str = Field(min_length=1)
    blocks: list[LabelCandidatePrintBlock] = Field(default_factory=list, min_length=1)


class LabelCandidateBatchPrintRequest(BaseModel):
    printer_name: str = "Deli DL-720C"
    width_mm: float = Field(default=60, ge=20, le=120)
    height_mm: float = Field(default=40, ge=20, le=120)
    label_size: str = "60x40"
    candidates: list[LabelCandidateBatchItem] = Field(default_factory=list, min_length=1)
