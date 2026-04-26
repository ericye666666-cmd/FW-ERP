from pydantic import BaseModel, Field


class CargoTypeCreate(BaseModel):
    name: str = Field(min_length=1)
    code: str = ""
    note: str = ""
    status: str = "active"


class CargoTypeResponse(BaseModel):
    id: int
    code: str
    name: str
    note: str = ""
    status: str
    created_at: str
    created_by: str
