from pydantic import BaseModel


class BarcodeResolveResponse(BaseModel):
    barcode_type: str = "UNKNOWN"
    object_type: str = "unknown"
    object_id: str = ""
    identity_id: str = ""
    template_scope: str = ""
    allowed_contexts: list[str] = []
    reject_reason: str = ""

