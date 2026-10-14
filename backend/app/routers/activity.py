from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from ..audit import log_activity
from ..auth import require_admin
from ..db import get_db
from .. import models

router = APIRouter(prefix="/activity", tags=["activity"])


def _parse_dt(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


@router.get("")
def list_activity(
    username: Optional[str] = None,
    action: Optional[str] = None,
    entity_type: Optional[str] = None,
    status: Optional[str] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    query = db.query(models.ActivityLog)
    if username:
        query = query.filter(models.ActivityLog.username == username)
    if action:
        query = query.filter(models.ActivityLog.action.contains(action))
    if entity_type:
        query = query.filter(models.ActivityLog.entity_type == entity_type)
    if status:
        query = query.filter(models.ActivityLog.status == status)
    start_dt = _parse_dt(start)
    end_dt = _parse_dt(end)
    if start_dt:
        query = query.filter(models.ActivityLog.created_at >= start_dt)
    if end_dt:
        query = query.filter(models.ActivityLog.created_at <= end_dt)
    total = query.count()
    rows = query.order_by(models.ActivityLog.created_at.desc()).offset(offset).limit(limit).all()
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": [
            {
                "id": row.id,
                "user_id": row.user_id,
                "username": row.username,
                "action": row.action,
                "entity_type": row.entity_type,
                "entity_id": row.entity_id,
                "detail": row.detail,
                "status": row.status,
                "error": row.error,
                "client_host": row.client_host,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
            for row in rows
        ],
    }


@router.get("/export", response_class=PlainTextResponse)
def export_activity(
    username: Optional[str] = None,
    action: Optional[str] = None,
    entity_type: Optional[str] = None,
    status: Optional[str] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    query = db.query(models.ActivityLog)
    if username:
        query = query.filter(models.ActivityLog.username == username)
    if action:
        query = query.filter(models.ActivityLog.action.contains(action))
    if entity_type:
        query = query.filter(models.ActivityLog.entity_type == entity_type)
    if status:
        query = query.filter(models.ActivityLog.status == status)
    start_dt = _parse_dt(start)
    end_dt = _parse_dt(end)
    if start_dt:
        query = query.filter(models.ActivityLog.created_at >= start_dt)
    if end_dt:
        query = query.filter(models.ActivityLog.created_at <= end_dt)
    rows = query.order_by(models.ActivityLog.created_at.desc()).all()
    lines = ["id,username,action,entity_type,entity_id,status,client_host,created_at,detail"]
    for row in rows:
        detail = (row.detail or "").replace('"', '""')
        lines.append(
            f'{row.id},"{row.username}","{row.action}","{row.entity_type}",{row.entity_id or ""},"{row.status}","{row.client_host}","{row.created_at.isoformat() if row.created_at else ""}","{detail}"'
        )
    return "\n".join(lines)
