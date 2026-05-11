from typing import List, Optional

from pydantic import BaseModel, Field


class StoreManagerDailyTasks(BaseModel):
    pending_sdo: int = 0
    pending_assignment_packages: int = 0
    pending_putaway_items: int = 0
    unconfirmed_stock_in_items: int = 0
    active_holds: int = 0
    open_shifts: int = 0
    cash_variance_amount: float = 0


class StoreManagerDailyFlow(BaseModel):
    received_items: int = 0
    assigned_items: int = 0
    putaway_items: int = 0
    sold_items: int = 0
    unprocessed_items: int = 0
    current_sellable_inventory: int = 0


class StoreManagerCategorySignal(BaseModel):
    category: str
    sold_qty: int = 0
    current_stock: int = 0
    signal: str
    suggested_action: str


class StoreManagerCashierRisk(BaseModel):
    today_sales: float = 0
    orders: int = 0
    cash_amount: float = 0
    mpesa_amount: float = 0
    mixed_amount: float = 0
    open_shift_count: int = 0
    cash_variance_shift_count: int = 0
    active_hold_count: int = 0


class ManagerMarketFeedbackCreate(BaseModel):
    category: str = Field(min_length=1)
    feedback_type: str = "other"
    suggested_action: str = "keep_observing"
    note: str = ""


class ManagerMarketFeedbackResponse(BaseModel):
    feedback_id: str
    store_code: str
    category: str
    feedback_type: str
    suggested_action: str
    note: str = ""
    created_by: str = ""
    created_at: str


class ManagerMarketFeedbackListResponse(BaseModel):
    store_code: str
    date: str
    feedback: List[ManagerMarketFeedbackResponse] = Field(default_factory=list)


class StoreManagerDailyControlResponse(BaseModel):
    store_code: str
    date: str
    tasks: StoreManagerDailyTasks
    flow: StoreManagerDailyFlow
    hot_categories: List[StoreManagerCategorySignal] = Field(default_factory=list)
    slow_categories: List[StoreManagerCategorySignal] = Field(default_factory=list)
    cashier_risk: StoreManagerCashierRisk
    market_feedback: List[ManagerMarketFeedbackResponse] = Field(default_factory=list)
    placeholder_fields: Optional[List[str]] = None
