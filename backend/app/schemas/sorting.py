from typing import Optional

from pydantic import BaseModel, Field


class InboundShipmentDocument(BaseModel):
    filename: str = Field(min_length=1)
    content_type: str = ""
    data_url: str = Field(min_length=1)


class ChinaSourceImportRow(BaseModel):
    row_no: int
    supplier_name: str = ""
    package_code: str = ""
    category_main: str = ""
    category_main_zh: str = ""
    category_sub_zh: str = ""
    category_sub: str = ""
    package_count: int = 0
    unit_weight_kg: float = 0
    unit_cost_amount: float = 0
    unit_cost_currency: str = "CNY"
    valid: bool = False
    issues: list[str] = Field(default_factory=list)


class ChinaSourceImportPreviewResponse(BaseModel):
    file_name: str = ""
    total_rows: int = 0
    valid_rows: int = 0
    invalid_rows: int = 0
    rows: list[ChinaSourceImportRow] = Field(default_factory=list)


class ChinaSourceLine(BaseModel):
    source_bale_token: str = ""
    supplier_name: str = Field(min_length=1)
    package_code: str = Field(min_length=1)
    supplier_name_zh: str = ""
    category_main: str = Field(min_length=1)
    category_sub: str = Field(min_length=1)
    category_main_zh: str = ""
    category_sub_zh: str = ""
    package_count: int = Field(ge=1)
    unit_weight_kg: float = Field(gt=0)
    unit_cost_amount: float = Field(default=0, ge=0)
    unit_cost_currency: str = "CNY"
    total_weight_kg: Optional[float] = Field(default=None, ge=0)


class ChinaSourceCostEntry(BaseModel):
    currency: str = ""
    amount: float = Field(default=0, ge=0)
    payment_method: str = ""
    payer: str = ""
    payment_reference: str = ""
    documents: list[InboundShipmentDocument] = Field(default_factory=list)


class ChinaSourceCostEntries(BaseModel):
    head_transport: ChinaSourceCostEntry = Field(default_factory=ChinaSourceCostEntry)
    customs_clearance: ChinaSourceCostEntry = Field(default_factory=ChinaSourceCostEntry)
    tail_transport: ChinaSourceCostEntry = Field(default_factory=ChinaSourceCostEntry)


class ChinaSourceRecordCreate(BaseModel):
    source_pool_token: str = Field(min_length=1)
    container_type: str = Field(min_length=1)
    customs_notice_no: str = Field(min_length=1)
    lines: list[ChinaSourceLine] = Field(min_length=1)


class ChinaSourceCostUpdateRequest(BaseModel):
    cost_entries: ChinaSourceCostEntries


class ChinaSourceRecordResponse(BaseModel):
    source_pool_token: str
    container_type: str
    customs_notice_no: str
    total_bale_count: int = 0
    domestic_total_weight_kg: float = 0
    supplier_count: int = 0
    category_count: int = 0
    lines: list[ChinaSourceLine] = Field(default_factory=list)
    cost_entries: ChinaSourceCostEntries = Field(default_factory=ChinaSourceCostEntries)
    created_at: str
    updated_at: str
    cost_updated_at: Optional[str] = None


class WarehouseMainflowDemoCategoryResponse(BaseModel):
    source_category_main: str
    source_category_sub: str
    package_count: int
    sorted_bales: int = 0
    remaining_raw_bales: int = 0
    sorting_category_name: str = ""


class WarehouseMainflowDemoResponse(BaseModel):
    message: str
    demo_name: str
    customs_notice_no: str
    shipment_no: str
    source_pool_token: str
    unload_date: str
    per_bale_weight_kg: float
    total_bales: int
    sorted_bales: int
    remaining_raw_bales: int
    printed_bales: int = 0
    route_cost_currency: str = "KES"
    route_cost_kes: float = 0
    head_transport_cny: float = 0
    customs_clearance_kes: float = 0
    tail_transport_kes: float = 0
    sorting_task_nos: list[str] = Field(default_factory=list)
    categories: list[WarehouseMainflowDemoCategoryResponse] = Field(default_factory=list)


class StoreReplenishmentDemoCategoryResponse(BaseModel):
    category_main: str
    category_sub: str
    sorting_category_name: str = ""
    total_generated_qty: int = 0
    store_seed_qty: int = 0
    recent_14d_sales_qty: int = 0
    warehouse_loose_qty: int = 0
    waiting_store_dispatch_qty: int = 0
    waiting_store_dispatch_bale_count: int = 0


class StoreReplenishmentDemoResponse(BaseModel):
    message: str
    demo_name: str
    customs_notice_no: str
    shipment_no: str
    source_pool_token: str
    unload_date: str
    warehouse_code: str
    store_code: str
    category_count: int = 0
    per_bale_weight_kg: float = 0
    total_bales: int = 0
    sorted_bales: int = 0
    warehouse_total_qty: int = 0
    warehouse_loose_qty: int = 0
    warehouse_waiting_store_dispatch_qty: int = 0
    waiting_store_dispatch_bale_count: int = 0
    waiting_store_dispatch_bale_size: int = 0
    store_seed_qty: int = 0
    store_remaining_qty: int = 0
    recent_14d_sales_qty: int = 0
    recent_14d_sales_amount: float = 0
    recommendation_no: str = ""
    recommendation_item_count: int = 0
    recommendation_total_requested_qty: int = 0
    sorting_task_nos: list[str] = Field(default_factory=list)
    waiting_store_dispatch_bale_nos: list[str] = Field(default_factory=list)
    categories: list[StoreReplenishmentDemoCategoryResponse] = Field(default_factory=list)


class ApparelPieceWeightCreate(BaseModel):
    category_main: str = Field(min_length=1)
    category_sub: str = Field(min_length=1)
    standard_weight_kg: float = Field(gt=0)
    note: str = ""


class ApparelPieceWeightResponse(BaseModel):
    category_main: str
    category_sub: str
    standard_weight_kg: float
    note: str = ""
    updated_at: str
    updated_by: str = ""


class ApparelDefaultCostCreate(BaseModel):
    category_main: str = Field(min_length=1)
    category_sub: str = Field(min_length=1)
    grade: str = Field(min_length=1)
    default_cost_kes: float = Field(gt=0)
    note: str = ""


class ApparelDefaultCostResponse(BaseModel):
    category_main: str
    category_sub: str
    grade: str
    default_cost_kes: float
    note: str = ""
    updated_at: str
    updated_by: str = ""


class ApparelSortingRackCreate(BaseModel):
    category_main: str = Field(min_length=1)
    category_sub: str = Field(min_length=1)
    grade: str = Field(min_length=1)
    default_cost_kes: float = Field(gt=0)
    rack_code: str = Field(min_length=1)
    note: str = ""


class ApparelSortingRackResponse(BaseModel):
    category_main: str
    category_sub: str
    grade: str
    default_cost_kes: float
    rack_code: str
    note: str = ""
    updated_at: str
    updated_by: str = ""


class InboundShipmentCreate(BaseModel):
    shipment_type: str = Field(min_length=1)
    customs_notice_no: str = Field(min_length=1)
    unload_date: str = Field(min_length=1)
    coc_goods_manifest: str = Field(min_length=1)
    note: str = ""
    coc_documents: list[InboundShipmentDocument] = Field(default_factory=list)


class InboundShipmentResponse(BaseModel):
    id: int
    shipment_no: str
    shipment_type: str
    customs_notice_no: str
    unload_date: str
    coc_goods_manifest: str
    note: str = ""
    coc_documents: list[InboundShipmentDocument] = Field(default_factory=list)
    intake_status: str = "open"
    intake_confirmed_at: Optional[str] = None
    intake_confirmed_by: str = ""
    intake_confirmed_total_packages: int = 0
    bales_generated_at: Optional[str] = None
    bales_generated_by: str = ""
    total_parcel_batches: int = 0
    total_packages: int = 0
    created_at: str
    updated_at: str


class ParcelBatchCreate(BaseModel):
    intake_type: str = Field(min_length=1, default="sea_freight")
    inbound_shipment_no: str = Field(min_length=1)
    source_bale_token: str = ""
    supplier_code: str = ""
    supplier_name: str = Field(min_length=1)
    cargo_type_code: str = ""
    cargo_type: str = Field(min_length=1)
    category_main: str = Field(min_length=1)
    category_sub: str = Field(min_length=1)
    received_by: str = Field(min_length=1, default="warehouse_clerk_1")
    package_count: int = Field(ge=1)
    total_weight: Optional[float] = Field(default=None, ge=0)
    note: str = ""


class ParcelBatchResponse(BaseModel):
    id: int
    batch_no: str
    barcode: str
    intake_type: str
    inbound_shipment_no: str
    source_bale_token: str = ""
    customs_notice_no: str
    unload_date: str
    supplier_code: str = ""
    supplier_name: str
    cargo_type_code: str = ""
    cargo_type: str
    category_main: str
    category_sub: str
    received_by: str
    package_count: int
    total_weight: Optional[float] = None
    note: str = ""
    status: str
    received_at: str
    updated_at: str


class InboundShipmentIntakeConfirmRequest(BaseModel):
    declared_total_packages: int = Field(ge=1)
    note: str = ""


class BaleBarcodeResponse(BaseModel):
    id: int
    bale_barcode: str
    legacy_bale_barcode: str = ""
    scan_token: str = ""
    shipment_no: str
    parcel_batch_no: str
    source_bale_token: str = ""
    customs_notice_no: str
    unload_date: str
    supplier_name: str
    cargo_type: str
    category_main: str
    category_sub: str
    serial_no: int
    weight_kg: Optional[float] = None
    status: str
    destination_judgement: str = "pending"
    current_location: str = ""
    occupied_by_task_no: str = ""
    entered_bale_sales_pool_at: Optional[str] = None
    entered_bale_sales_pool_by: str = ""
    printed_at: Optional[str] = None
    printed_by: str = ""
    source_cost_completed: Optional[bool] = None
    source_cost_kes: Optional[float] = None
    source_cost_amount: Optional[float] = None
    source_total_cost_kes: Optional[float] = None
    source_allocated_cost_kes: Optional[float] = None
    source_cost_gate_status: str = ""
    source_cost_allows_sorting: bool = False
    source_cost_gate_message: str = ""
    source_cost_per_kg_kes: Optional[float] = None
    source_cost_recorded: bool = False
    source_cost_allocated: bool = False
    created_at: str
    updated_at: str


class RawBaleRouteRequest(BaseModel):
    note: str = ""


class RawBaleStockResponse(BaleBarcodeResponse):
    machine_code: str = ""
    barcode_value: str = ""
    human_readable: str = ""
    is_occupied: bool = False
    is_in_bale_sales_pool: bool = False
    can_route_to_sorting: bool = False
    can_route_to_bale_sales_pool: bool = False


class BaleBatchLabelConfirmationResponse(BaseModel):
    parcel_batch_no: str
    confirmed_count: int
    already_confirmed_count: int
    affected_bale_barcodes: list[str]
    status_summary: dict[str, int]


class FinalItemBarcodeResponse(BaseModel):
    barcode_value: str = ""
    identity_id: str = ""
    printed_at: Optional[str] = None
    printed_by: str = ""
    status: str = ""


class ClerkAssignmentResponse(BaseModel):
    entity_type: str = "clerk_assignment"
    bale_no: str
    store_code: str = ""
    assigned_employee: str = ""
    flow_type: str = "sorting"
    item_count: int = 0
    assigned_at: Optional[str] = None
    note: str = ""
    status: str = ""


class ItemBarcodeTokenResponse(BaseModel):
    token_no: str
    identity_no: str = ""
    barcode_value: str = ""
    task_no: str
    shipment_no: str
    customs_notice_no: str = ""
    source_bale_barcodes: list[str] = Field(default_factory=list)
    source_legacy_bale_barcodes: list[str] = Field(default_factory=list)
    category_name: str
    grade: str
    sku_code: str
    rack_code: str
    qty_index: int
    qty_total: int
    token_group_no: int
    status: str
    cost_status: str = ""
    unit_cost_kes: Optional[float] = None
    cost_model_code: str = ""
    cost_locked_at: Optional[str] = None
    source_pool_tokens: list[str] = Field(default_factory=list)
    suggested_price_kes: Optional[float] = None
    selling_price_kes: Optional[float] = None
    suggested_rack_code: str = ""
    store_rack_code: str = ""
    store_prep_bale_no: str = ""
    store_prep_task_no: str = ""
    store_dispatch_bale_no: str = ""
    store_code: str = ""
    assigned_employee: str = ""
    assigned_at: Optional[str] = None
    assignment_note: str = ""
    printed_at: Optional[str] = None
    printed_by: str = ""
    edited_at: Optional[str] = None
    edited_by: str = ""
    final_item_barcode: Optional[FinalItemBarcodeResponse] = None
    created_at: str
    updated_at: str


class StoreDispatchBaleResponse(BaseModel):
    bale_no: str
    task_no: str
    shipment_no: str
    token_group_no: int
    category_name: str
    grade: str
    item_count: int
    token_nos: list[str] = Field(default_factory=list)
    status: str
    flow_type: str = "sorting"
    transfer_no: str = ""
    store_code: str = ""
    accepted_at: Optional[str] = None
    accepted_by: str = ""
    accepted_note: str = ""
    assigned_employee: str = ""
    assigned_at: Optional[str] = None
    assignment_note: str = ""
    packed_at: Optional[str] = None
    packed_by: str = ""
    labelled_at: Optional[str] = None
    dispatched_at: Optional[str] = None
    dispatched_by: str = ""
    category_count: int = 0
    category_summary: str = ""
    edited_count: int = 0
    printed_count: int = 0
    shelved_count: int = 0
    clerk_assignment: Optional[ClerkAssignmentResponse] = None
    created_at: str
    updated_at: str


class StoreDispatchBaleAcceptRequest(BaseModel):
    store_code: str = Field(min_length=1)
    transfer_no: str = ""
    note: str = ""


class StoreDispatchBaleAssignRequest(BaseModel):
    employee_name: str = Field(min_length=1)
    note: str = ""


class ItemBarcodeTokenStoreEditRequest(BaseModel):
    store_code: str = Field(min_length=1)
    selling_price_kes: float = Field(ge=0)
    store_rack_code: str = Field(min_length=1)
    note: str = ""


class SortingTaskResultItemCreate(BaseModel):
    category_name: str = Field(min_length=1)
    grade: str = Field(min_length=1)
    actual_weight_kg: Optional[float] = Field(default=None, gt=0)
    qty: int = Field(ge=1)
    rack_code: str = ""
    confirm_to_inventory: bool = True
    default_cost_kes: Optional[float] = Field(default=None, gt=0)
    estimated_unit_cost_kes: Optional[float] = Field(default=None, ge=0)


class SortingTaskLossPhoto(BaseModel):
    filename: str = Field(min_length=1)
    content_type: str = ""
    data_url: str = Field(min_length=1)


class SortingTaskLossRecord(BaseModel):
    has_loss: bool = False
    loss_qty: int = Field(default=0, ge=0)
    loss_weight_kg: float = Field(default=0, ge=0)
    note: str = ""
    photos: list[SortingTaskLossPhoto] = Field(default_factory=list)


class SortingTaskCreate(BaseModel):
    shipment_no: str = ""
    category_filters: list[str] = Field(default_factory=list)
    bale_barcodes: list[str] = Field(min_length=1)
    handler_names: list[str] = Field(min_length=1)
    note: str = ""


class SortingTaskResultSubmit(BaseModel):
    result_items: list[SortingTaskResultItemCreate] = Field(min_length=1)
    loss_record: Optional[SortingTaskLossRecord] = None
    note: str = ""
    mark_task_completed: bool = True
    cost_status_override: str = ""
    estimated_unit_cost_kes: Optional[float] = None
    cost_model_code: str = ""
    source_bale_tokens: list[str] = Field(default_factory=list)
    source_pool_tokens: list[str] = Field(default_factory=list)


class SortingTaskResultItemResponse(BaseModel):
    category_name: str
    grade: str
    sku_code: str
    actual_weight_kg: Optional[float] = None
    qty: int
    rack_code: str
    confirm_to_inventory: bool
    default_cost_kes: Optional[float] = None
    generated_token_count: int = 0
    generated_token_preview: list[str] = Field(default_factory=list)
    cost_status: str = ""
    unit_cost_kes: Optional[float] = None
    total_cost_kes: Optional[float] = None


class SortingTaskResponse(BaseModel):
    id: int
    task_no: str
    shipment_no: str
    customs_notice_no: str
    shipment_nos: list[str] = Field(default_factory=list)
    customs_notice_nos: list[str] = Field(default_factory=list)
    parcel_batch_nos: list[str]
    bale_barcodes: list[str]
    legacy_bale_barcodes: list[str] = Field(default_factory=list)
    category_filters: list[str] = Field(default_factory=list)
    handler_names: list[str]
    started_at: str
    completed_at: Optional[str] = None
    note: str = ""
    status: str
    cost_status: str = ""
    unit_cost_kes: Optional[float] = None
    cost_model_code: str = ""
    source_bale_token_count: int = 0
    source_pool_token_count: int = 0
    cost_locked_at: Optional[str] = None
    loss_record: SortingTaskLossRecord = Field(default_factory=SortingTaskLossRecord)
    result_items: list[SortingTaskResultItemResponse]
    generated_token_count: int = 0
    generated_token_preview: list[str] = Field(default_factory=list)
    updated_at: str


class SortingStockResponse(BaseModel):
    rack_code: str
    category_name: str
    grade: str
    sku_code: str
    default_cost_kes: Optional[float] = None
    unit_cost_kes: Optional[float] = None
    total_cost_kes: Optional[float] = None
    qty_on_hand: int
    cost_layers: list[dict] = Field(default_factory=list)
    updated_at: str


class WarehouseInventorySummaryBucket(BaseModel):
    bale_count: int = 0
    qty: int = 0


class WarehouseInventorySummaryResponse(BaseModel):
    raw_bale_status_counts: dict[str, int] = Field(default_factory=dict)
    sorting_task_status_counts: dict[str, int] = Field(default_factory=dict)
    sorted_stock: WarehouseInventorySummaryBucket = Field(default_factory=WarehouseInventorySummaryBucket)
    waiting_store: WarehouseInventorySummaryBucket = Field(default_factory=WarehouseInventorySummaryBucket)
    waiting_sale: WarehouseInventorySummaryBucket = Field(default_factory=WarehouseInventorySummaryBucket)
    b2b_bale_sales_candidates: dict[str, int] = Field(default_factory=dict)
    store_pos_inventory: WarehouseInventorySummaryBucket = Field(default_factory=WarehouseInventorySummaryBucket)


class SortingStockRackUpdateRequest(BaseModel):
    sku_code: str = Field(min_length=1)
    current_rack_code: str = Field(min_length=1)
    new_rack_code: str = Field(min_length=1)
    note: str = ""


class SortingStockRackUpdateResponse(BaseModel):
    sku_code: str
    category_name: str
    grade: str
    default_cost_kes: Optional[float] = None
    unit_cost_kes: Optional[float] = None
    total_cost_kes: Optional[float] = None
    previous_rack_code: str
    new_rack_code: str
    qty_on_hand: int
    updated_at: str


class StorePrepGradeRequirement(BaseModel):
    grade: str = Field(min_length=1)
    qty: int = Field(ge=1)


class StorePrepGradeRatio(BaseModel):
    grade: str = Field(min_length=1)
    ratio_pct: float = Field(gt=0)


class StorePrepBaleTaskCreate(BaseModel):
    category_sub: str = Field(min_length=1)
    task_type: str = "store_dispatch"
    target_qty: Optional[int] = Field(default=None, ge=1)
    pieces_per_bale: Optional[int] = Field(default=None, ge=100, le=200)
    bale_count: int = Field(default=1, ge=1, le=5)
    target_weight_kg: Optional[float] = Field(default=None, gt=0)
    ratio_label: str = ""
    grade_requirements: list[StorePrepGradeRequirement] = Field(default_factory=list)
    grade_ratios: list[StorePrepGradeRatio] = Field(default_factory=list)
    assigned_employee: str = Field(min_length=1)
    note: str = ""


class StorePrepBaleTaskCompleteRequest(BaseModel):
    actual_qty: Optional[int] = Field(default=None, ge=1)
    actual_weight_kg: Optional[float] = Field(default=None, gt=0)
    note: str = ""


class StorePrepBaleTaskResponse(BaseModel):
    id: int
    task_no: str
    task_type: str = "store_dispatch"
    category_main: str = ""
    category_sub: str
    target_qty: int
    pieces_per_bale: int = 0
    bale_count: int = 1
    target_weight_kg: Optional[float] = None
    actual_weight_kg: Optional[float] = None
    estimated_piece_weight_kg: Optional[float] = None
    ratio_label: str = ""
    ratio_summary: str = ""
    grade_requirements: list[StorePrepGradeRequirement] = Field(default_factory=list)
    grade_ratios: list[StorePrepGradeRatio] = Field(default_factory=list)
    grade_summary: str = ""
    assigned_employee: str = ""
    available_qty: int = 0
    suspended_qty: int = 0
    packed_qty: int = 0
    prepared_bale_no: str = ""
    prepared_bale_barcode: str = ""
    prepared_bale_nos: list[str] = Field(default_factory=list)
    prepared_bale_barcodes: list[str] = Field(default_factory=list)
    status: str
    unit_cost_kes: Optional[float] = None
    total_cost_kes: Optional[float] = None
    label_summary: str = ""
    created_at: str
    accepted_at: Optional[str] = None
    completed_at: Optional[str] = None
    label_attached_at: Optional[str] = None
    updated_at: str
    created_by: str = ""
    accepted_by: str = ""
    completed_by: str = ""
    label_attached_by: str = ""
    note: str = ""


class StorePrepBaleResponse(BaseModel):
    id: int = 0
    bale_no: str
    bale_barcode: str = ""
    scan_token: str = ""
    machine_code: str = ""
    barcode_value: str = ""
    human_readable: str = ""
    task_no: str
    task_type: str = "store_dispatch"
    category_main: str = ""
    category_sub: str
    qty: int
    target_weight_kg: Optional[float] = None
    actual_weight_kg: Optional[float] = None
    estimated_piece_weight_kg: Optional[float] = None
    ratio_label: str = ""
    ratio_summary: str = ""
    grade_requirements: list[StorePrepGradeRequirement] = Field(default_factory=list)
    grade_summary: str = ""
    assigned_employee: str = ""
    token_nos: list[str] = Field(default_factory=list)
    status: str
    unit_cost_kes: Optional[float] = None
    total_cost_kes: Optional[float] = None
    label_summary: str = ""
    staging_area: str = ""
    label_print_job_id: Optional[int] = None
    label_print_queued_at: Optional[str] = None
    label_attached_at: Optional[str] = None
    label_attached_by: str = ""
    printed_at: Optional[str] = None
    printed_by: str = ""
    inventory_converted_at: Optional[str] = None
    inventory_converted_by: str = ""
    created_at: str
    updated_at: str
