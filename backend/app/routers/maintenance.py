import datetime
import shutil
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text

from ..auth import require_admin
from ..db import DB_PATH, engine

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
