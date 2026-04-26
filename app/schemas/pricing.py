from typing import Optional

from pydantic import BaseModel, Field


class PriceRuleCreate(BaseModel):
    target_type: str = Field(pattern="^(category_main|category_sub|barcode)$")
    target_value: str = Field(min_length=1)
    max_price: float = Field(ge=0)
    store_code: Optional[str] = None
    note: str = ""


class PriceRuleResponse(BaseModel):
    id: int
    rule_no: str
    target_type: str
    target_value: str
    max_price: float
    store_code: Optional[str] = None
    status: str
    created_at: str
    created_by: str
    note: str = ""


class EffectivePriceRuleResponse(BaseModel):
    expected_price: float
    price_cap: Optional[float] = None
    rule_no: Optional[str] = None
    target_type: Optional[str] = None
    target_value: Optional[str] = None
