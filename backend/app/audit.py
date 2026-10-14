from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from . import models


def log_activity(
    db: Session,
    action: str,
    *,
    user=None,
    entity_type: Optional[str] = None,
    entity_id=None,
    detail: str = "",
    status: str = "success",
    error: str = "",
    client_host: str = "",
):
    row = models.ActivityLog(
        user_id=getattr(user, "id", None),
        username=getattr(user, "username", None) or (getattr(user, "name", None) if user else "anonymous") or "anonymous",
        action=action,
        entity_type=entity_type or "",
        entity_id=entity_id,
        detail=detail or "",
        status=status,
        error=error or "",
        client_host=client_host or "",
    )
    db.add(row)
    return row
