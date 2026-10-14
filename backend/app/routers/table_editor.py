from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from .. import models
from ..auth import require_admin
from ..db import engine, get_db

router = APIRouter(prefix="/tables", tags=["tables"])

ALLOWED_TABLES = sorted(models.Base.metadata.tables.keys())


def _validate_table(table_name: str):
    if table_name not in ALLOWED_TABLES:
        raise HTTPException(status_code=404, detail="Unknown table")
    return models.Base.metadata.tables[table_name]


def _json_value(value: Any):
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return value


def _columns(table):
    return [
        {
            "name": column.name,
            "type": str(column.type),
            "primary_key": column.primary_key,
            "nullable": column.nullable,
        }
        for column in table.columns
    ]


def _primary_key(table):
    pk = table.primary_key.columns
    if len(pk) != 1:
        raise HTTPException(status_code=400, detail="Composite primary keys are not supported")
    return list(pk)[0]


def _cast_pk(table, row_id: str):
    pk_column = _primary_key(table)
    python_type = pk_column.type.python_type if hasattr(pk_column.type, "python_type") else str
    try:
        if python_type is int:
            return int(row_id)
        if python_type is float:
            return float(row_id)
        return row_id
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid row id")


@router.get("")
def list_tables(admin=Depends(require_admin)):
    return [{"name": table_name, "columns": _columns(models.Base.metadata.tables[table_name])} for table_name in ALLOWED_TABLES]


@router.get("/{table_name}")
def read_table(
    table_name: str,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    table = _validate_table(table_name)
    pk = _primary_key(table)
    total = db.execute(text(f'SELECT COUNT(*) FROM "{table_name}"')).scalar_one()
    rows = db.execute(
        text(f'SELECT * FROM "{table_name}" ORDER BY "{pk.name}" LIMIT :limit OFFSET :offset'),
        {"limit": limit, "offset": offset},
    ).mappings().all()
    return {
        "table": table_name,
        "primary_key": pk.name,
        "columns": _columns(table),
        "total": total,
        "limit": limit,
        "offset": offset,
        "rows": [{key: _json_value(value) for key, value in row.items()} for row in rows],
    }


@router.patch("/{table_name}/{row_id}")
def update_row(
    table_name: str,
    row_id: str,
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    table = _validate_table(table_name)
    pk = _primary_key(table)
    pk_value = _cast_pk(table, row_id)
    column_names = {column.name for column in table.columns}
    editable = {
        key: value for key, value in payload.items()
        if key in column_names and key != pk.name
    }
    if not editable:
        raise HTTPException(status_code=400, detail="No editable columns provided")
    unknown = sorted(set(payload) - column_names)
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown columns: {', '.join(unknown)}")
    if pk.name in payload:
        raise HTTPException(status_code=400, detail="Primary key cannot be changed")

    assignments = ", ".join(f'"{key}" = :{key}' for key in editable)
    parameters = dict(editable)
    parameters["_pk"] = pk_value
    result = db.execute(
        text(f'UPDATE "{table_name}" SET {assignments} WHERE "{pk.name}" = :_pk'),
        parameters,
    )
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Row not found")
    return {"status": "updated", "table": table_name, "row_id": pk_value}


@router.delete("/{table_name}/{row_id}")
def delete_row(
    table_name: str,
    row_id: str,
    db: Session = Depends(get_db),
    admin=Depends(require_admin),
):
    table = _validate_table(table_name)
    pk = _primary_key(table)
    pk_value = _cast_pk(table, row_id)
    result = db.execute(
        text(f'DELETE FROM "{table_name}" WHERE "{pk.name}" = :_pk'),
        {"_pk": pk_value},
    )
    db.commit()
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Row not found")
    return {"status": "deleted", "table": table_name, "row_id": pk_value}
