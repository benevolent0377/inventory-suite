import datetime
import os
import shutil
import signal
import threading
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text

from ..auth import require_admin, require_user, verify_passkey
from ..db import DB_PATH, engine, SessionLocal
from .. import models

router = APIRouter(prefix="/maintenance", tags=["maintenance"])

TABLE_ALIASES = {
    "items": "products",
    "item": "products",
    "products": "products",
    "product": "products",
    "vendors": "vendors",
    "vendor": "vendors",
    "stock": "stock",
    "movements": "movements",
    "movement": "movements",
    "orders": "orders",
    "order": "orders",
    "order-items": "order_items",
    "order_items": "order_items",
    "orderitems": "order_items",
    "users": "users",
    "user": "users",
}


class ClearTablesRequest(BaseModel):
    tables: List[str]


class ShutdownRequest(BaseModel):
    admin_passkey: str


@router.post("/tables/clear")
def clear_tables(payload: ClearTablesRequest, admin=Depends(require_admin)):
    if not payload.tables:
        raise HTTPException(status_code=400, detail="No tables selected")

    if any(item.lower() == "all" for item in payload.tables):
        tables = ["users", "movements", "order_items", "orders", "stock", "products", "vendors"]
    else:
        tables = []
        for item in payload.tables:
            table = TABLE_ALIASES.get(item.lower())
            if table is None:
                raise HTTPException(status_code=400, detail="Unknown table: " + item)
            if table not in tables:
                tables.append(table)

    db_path = Path(DB_PATH)
    backup_dir = db_path.parent / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = backup_dir / f"inventory-backup-{timestamp}.db"
    shutil.copy2(db_path, backup_path)

    with engine.begin() as connection:
        connection.execute(text("PRAGMA foreign_keys=OFF"))
        for table in tables:
            connection.execute(text(f"DELETE FROM {table}"))
        connection.execute(text("PRAGMA foreign_keys=ON"))
        try:
            connection.execute(
                text("DELETE FROM sqlite_sequence WHERE name IN (" + ", ".join("'" + table + "'" for table in tables) + ")")
            )
        except Exception:
            pass

    return {"status": "cleared", "tables": tables, "backup": backup_path.name}


@router.post("/shutdown")
def shutdown(payload: ShutdownRequest, user=Depends(require_user)):
    """Suspend all user sessions and shut down the web application."""
    db = SessionLocal()
    try:
        admins = db.query(models.User).filter(models.User.is_admin.is_(True)).all()
        if not any(verify_passkey(payload.admin_passkey, admin.passkey_hash) for admin in admins):
            raise HTTPException(status_code=401, detail="Invalid administrator passkey")
        db.query(models.UserSession).delete()
        db.commit()
    finally:
        db.close()

    def _shutdown():
        os.kill(os.getpid(), signal.SIGTERM)

    threading.Timer(0.5, _shutdown).start()
    return {"status": "shutting_down"}
