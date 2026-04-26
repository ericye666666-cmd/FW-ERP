from pydantic import BaseModel, Field

from app.schemas.users import UserResponse


class LoginRequest(BaseModel):
    username: str = Field(min_length=3)
    password: str = Field(min_length=6)


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    session_created_at: str
    user: UserResponse


class SessionUserResponse(UserResponse):
    session_created_at: str
