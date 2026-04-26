from typing import Optional

from pydantic import BaseModel, Field


class SupplierCreate(BaseModel):
    name: str = Field(min_length=1)
    name_zh: str = ""
    code: str = ""
    contact_person: str = ""
    phone: str = ""
    note: str = ""
    status: str = "active"


class SupplierResponse(BaseModel):
    id: int
    code: str
    name: str
    name_zh: str = ""
    contact_person: str = ""
    phone: str = ""
    note: str = ""
    status: str = "active"
    created_at: str
    created_by: Optional[str] = None
