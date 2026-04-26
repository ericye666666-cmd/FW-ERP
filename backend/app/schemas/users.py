from typing import Optional

from pydantic import BaseModel, Field


class RoleResponse(BaseModel):
    code: str
    name: str
    scope: str


class UserCreate(BaseModel):
    username: str = Field(min_length=3)
    full_name: str = Field(min_length=1)
    role_code: str = Field(min_length=1)
    store_code: Optional[str] = None
    is_active: bool = True
    password: str = Field(min_length=6, default="demo1234")
    created_by: str = Field(min_length=1, default="admin_1")


class UserResponse(BaseModel):
    id: int
    username: str
    full_name: str
    role_code: str
    store_code: Optional[str] = None
    is_active: bool
    created_at: str
