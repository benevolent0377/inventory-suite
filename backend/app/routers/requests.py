from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..db import get_db
from ..utils import compute_urgency


router = APIRouter(prefix="/requests", tags=["requests"])


def _product_logistics(product: models.Product, db: Session) -> dict:
    stock_rows = db.query(models.Stock).filter(models.Stock.product_id == product.id).all()
    on_hand = sum(row.on_hand for row in stock_rows)
    required = product.required_backstock or 0
    shortage = max(required - on_hand, 0)
    order_overhead_days = (product.order_overhead_days or 0) + (product.order_overhead_months or 0) * 30
    urgency_shortage = shortage + order_overhead_days

    if required <= 0:
        status = "not_tracked"
    elif on_hand <= 0:
        status = "out_of_stock"
    elif urgency_shortage >= max(1, required * 0.5):
        status = "critical"
    elif urgency_shortage > 0:
        status = "low"
    else:
        status = "healthy"

    urgency = compute_urgency(status, shortage, required, order_overhead_days)
    urgency_weight = {"out_of_stock": 4, "critical": 3, "low": 2, "not_tracked": 1, "healthy": 0}.get(status, 0)
    priority_score = urgency_weight * 100 + shortage + order_overhead_days
    vendor = db.get(models.Vendor, product.vendor_id) if product.vendor_id else None
    return {
        "sku": product.sku,
        "name": product.name,
        "vendor_name": vendor.name if vendor else None,
        "vendor_item_id": product.vendor_item_id or "",
        "status": status,
        "urgency": urgency,
        "priority_score": priority_score,
    }


def _build_item(item_in: schemas.RequestItemCreate, db: Session) -> dict:
    product = db.get(models.Product, item_in.product_id)
    if not product:
        raise HTTPException(status_code=404, detail=f"Product {item_in.product_id} not found")
    details = _product_logistics(product, db)
    quantity = float(item_in.quantity or 1)
    return {
        "product_id": product.id,
        "vendor_id": product.vendor_id,
        "quantity": quantity,
        "sku": details["sku"],
        "name": details["name"],
        "vendor_name": details["vendor_name"],
        "vendor_item_id": details["vendor_item_id"],
        "item_status": details["status"],
        "urgency": details["urgency"],
        "priority_score": details["priority_score"],
    }


def _build_request_read(request: models.Request, db: Session) -> schemas.RequestRead:
    items = []
    for item in request.items or []:
        items.append(schemas.RequestItemRead(
            product_id=item.get("product_id"),
            quantity=item.get("quantity", 1),
            vendor_id=item.get("vendor_id"),
            sku=item.get("sku", ""),
            name=item.get("name", ""),
            vendor_name=item.get("vendor_name"),
            vendor_item_id=item.get("vendor_item_id", ""),
            item_status=item.get("item_status", item.get("status", "")),
            urgency=item.get("urgency", 0),
            priority_score=item.get("priority_score", 0),
        ))
    return schemas.RequestRead(
        id=request.id,
        opened_by=request.opened_by,
        status=request.status,
        status_updated_by=request.status_updated_by or "",
        date_placed=request.date_placed,
        date_filled=request.date_filled,
        linked_order_id=request.linked_order_id,
        total_requested_quantity=request.total_requested_quantity or 0,
        priority_score=request.priority_score or 0,
        items=items,
        notes=request.notes or "",
        created_at=request.created_at,
    )


@router.get("", response_model=list[schemas.RequestRead])
def list_requests(db: Session = Depends(get_db)):
    requests = db.query(models.Request).all()
    requests.sort(key=lambda r: (r.date_placed or r.created_at or datetime.min), reverse=True)
    return [_build_request_read(r, db) for r in requests]


@router.post("", response_model=list[schemas.RequestRead])
def create_requests(payload: schemas.RequestCreate, db: Session = Depends(get_db)):
    if not payload.items:
        raise HTTPException(status_code=400, detail="At least one item is required")
    if not payload.opened_by:
        raise HTTPException(status_code=400, detail="opened_by is required")

    built_items = [_build_item(item, db) for item in payload.items]

    created = []
    if payload.separate_per_item:
        groups = [[item] for item in built_items]
    else:
        grouped: dict[int, list[dict]] = {}
        for item in built_items:
            grouped.setdefault(item["vendor_id"], []).append(item)
        groups = list(grouped.values())

    for group_items in groups:
        request = models.Request(
            opened_by=payload.opened_by,
            status="open",
            status_updated_by="",
            date_placed=datetime.now(timezone.utc).replace(tzinfo=None),
            items=group_items,
            total_requested_quantity=sum(item["quantity"] for item in group_items),
            priority_score=max((item["priority_score"] for item in group_items), default=0),
            notes=payload.notes,
        )
        db.add(request)
        db.flush()
        created.append(request)

    db.commit()
    for request in created:
        db.refresh(request)
    return [_build_request_read(r, db) for r in created]


@router.patch("/{request_id}", response_model=schemas.RequestRead)
def update_request(request_id: int, payload: schemas.RequestUpdate, db: Session = Depends(get_db)):
    request = db.get(models.Request, request_id)
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")

    if payload.status is not None:
        if payload.status not in {"open", "filled", "rejected"}:
            raise HTTPException(status_code=400, detail="Invalid status")
        request.status = payload.status
        if payload.status in {"filled", "rejected"}:
            request.date_filled = datetime.now(timezone.utc).replace(tzinfo=None)
        else:
            request.date_filled = None
    if payload.status_updated_by is not None:
        request.status_updated_by = payload.status_updated_by
    if payload.linked_order_id is not None:
        request.linked_order_id = payload.linked_order_id

    db.commit()
    db.refresh(request)
    return _build_request_read(request, db)