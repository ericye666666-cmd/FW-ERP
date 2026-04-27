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
