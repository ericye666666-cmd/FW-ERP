from typing import Any, Dict

from pydantic import BaseModel, Field


class AuditEventResponse(BaseModel):
    id: int
    event_type: str
    entity_type: str
    entity_id: str
    actor: str = ""
    summary: str
    created_at: str
    details: Dict[str, Any] = Field(default_factory=dict)
