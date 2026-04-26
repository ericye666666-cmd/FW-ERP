from typing import Union

from pydantic import BaseModel, Field


class MessageResponse(BaseModel):
    message: str


class SummaryCard(BaseModel):
    label: str
    value: Union[str, int, float]


class Pagination(BaseModel):
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=200)
