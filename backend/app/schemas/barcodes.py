from typing import Any, Optional

from pydantic import BaseModel, Field


class BarcodeBusinessObject(BaseModel):
    kind: str = "UNKNOWN"
    id: str = ""


class BarcodeResolveResponse(BaseModel):
    barcode_value: str = ""
    barcode_type: str = "UNKNOWN"
    business_object: BarcodeBusinessObject = Field(default_factory=BarcodeBusinessObject)
    pos_allowed: bool = False
    rejected_contexts: list[str] = Field(default_factory=list)
    rejection_message: str = ""
    operational_next_step: str = ""
    object_type: str = "unknown"
    object_id: str = ""
    identity_id: str = ""
    template_scope: str = ""
    allowed_contexts: list[str] = Field(default_factory=list)
    reject_reason: str = ""
    parent_entity_type: str = ""
    parent_sdo_machine_code: str = ""
    parent_sdo_display_code: str = ""
    package_no: int = 0
    package_total: int = 0
    store_code: str = ""
    source_type: str = ""
    source_code: str = ""
    item_count: Optional[int] = None
    status: str = ""
    received_status: str = ""
    received_at: Optional[str] = None
    received_by: str = ""
    exception_status: str = ""
    exception_reason: str = ""
    assigned_clerk: str = ""
    assigned_employee: str = ""
    assigned_at: Optional[str] = None
    assigned_by: str = ""
    assignment_status: str = ""
    updated_at: str = ""
    sdo_package_display_code: str = ""
    sdo_package_machine_code: str = ""
    source_machine_code: str = ""
    source_token_refs: list[str] = Field(default_factory=list)
    cost_source_refs: list[str] = Field(default_factory=list)
    source_bale_token: str = ""
    raw_bale_barcode: str = ""
    raw_bale_machine_code: str = ""
    source_batch_no: str = ""
    source_supplier: str = ""
    category_main: str = ""
    category_sub: str = ""
    grade: str = ""
    selected_price: Optional[float] = None
    selling_price_kes: Optional[float] = None
    unit_cost_kes: Optional[float] = None
    cost_price: Optional[float] = None
    cost_status: str = ""
    lineage_status: str = ""
    print_status: str = ""
    sale_status: str = ""
    source_cost_layer: Optional[dict[str, Any]] = None
