import base64
import random
import io
import math
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import models, schemas
from ..db import get_db

router = APIRouter(prefix="/products", tags=["products"])


VENDOR_ITEM_ID_PATTERNS = {
    1: ("FSH", "digits", 4),
    2: ("HM", "digits", 6),
    3: ("ASC", "hex", 4),
    4: ("BLT", "digits", 3),
    5: ("CP", "digits", 8),
    6: ("VE", "alnum", 4),
    7: ("BM", "digits", 6),
    8: ("SWA", "digits", 3),
    9: ("GLF", "digits", 8),
    10: ("HT", "digits", 4),
    11: ("SBS", "digits", 6),
    12: ("FC", "mixed", 7),
}


def _random_vendor_item_id(vendor_id, db):
    vendor = db.get(models.Vendor, vendor_id) if vendor_id else None
    prefix, kind, length = VENDOR_ITEM_ID_PATTERNS.get(vendor_id if vendor_id in VENDOR_ITEM_ID_PATTERNS else None, ("VND", "alnum", 6))
    if vendor is not None and vendor_id not in VENDOR_ITEM_ID_PATTERNS:
        prefix = "".join(part[:1].upper() for part in vendor.name.split()[:3]) or "VND"
    for _ in range(25):
        if kind == "digits":
            suffix = "".join(random.choice("0123456789") for _ in range(length))
        elif kind == "hex":
            suffix = "".join(random.choice("0123456789ABCDEF") for _ in range(length))
        elif kind == "mixed":
            suffix = "".join(random.choice("0123456789-") for _ in range(length))
        else:
            suffix = "".join(random.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(length))
        if "mixed" in kind:
            candidate = f"{prefix}-{suffix}"
        else:
            candidate = f"{prefix}-{suffix}"
        existing = db.query(models.Product).filter(models.Product.vendor_item_id == candidate).first()
        if not existing:
            return candidate
    return f"{prefix}-{random.randint(100000, 999999)}"




@router.get("", response_model=list[schemas.ProductRead])
def list_products(db: Session = Depends(get_db)):
    return db.query(models.Product).order_by(models.Product.id).all()


@router.get("/{product_id}", response_model=schemas.ProductRead)
def get_product(product_id: int, db: Session = Depends(get_db)):
    product = db.get(models.Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@router.post("", response_model=schemas.ProductRead)
def create_product(payload: schemas.ProductCreate, db: Session = Depends(get_db)):
    exists = db.query(models.Product).filter(models.Product.sku == payload.sku).first()
    if exists:
        raise HTTPException(status_code=400, detail="SKU already exists")
    data = payload.model_dump()
    if not (data.get("vendor_item_id") or "").strip():
        data["vendor_item_id"] = _random_vendor_item_id(data.get("vendor_id"), db)
    product = models.Product(**data)
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


@router.put("/{product_id}", response_model=schemas.ProductRead)
def update_product(product_id: int, payload: schemas.ProductCreate, db: Session = Depends(get_db)):
    product = db.get(models.Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    if payload.price != product.price:
        product.last_price = product.price
    data = payload.model_dump()
    if not (data.get("vendor_item_id") or "").strip():
        data["vendor_item_id"] = _random_vendor_item_id(data.get("vendor_id") or product.vendor_id, db)
    for key, value in data.items():
        setattr(product, key, value)
    db.commit()
    db.refresh(product)
    return product


@router.delete("/{product_id}")
def delete_product(product_id: int, db: Session = Depends(get_db)):
    product = db.get(models.Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    db.delete(product)
    db.commit()
    return {"status": "deleted"}

@router.get("/{product_id}/stats")
def product_stats(product_id: int, date_range: str = Query(default="30"), db: Session = Depends(get_db)):
    product = db.get(models.Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    def to_date_key(value):
        if not value:
            return None
        if hasattr(value, "strftime"):
            return value.date().isoformat()
        try:
            return datetime.fromisoformat(str(value).replace("Z", "+00:00")).date().isoformat()
        except ValueError:
            return None

    today = datetime.utcnow()
    today_key = today.date().isoformat()
    if date_range == "all":
        date_keys_source = []
        for order in db.query(models.Order).all():
            key = to_date_key(order.order_date or order.created_at)
            if key:
                date_keys_source.append(key)
        for movement in db.query(models.Movement).filter(models.Movement.product_id == product.id).all():
            key = to_date_key(movement.created_at)
            if key:
                date_keys_source.append(key)
        start_date = min(date_keys_source) if date_keys_source else today_key
    else:
        days = int(date_range)
        start = today - timedelta(days=days - 1)
        start_date = start.date().isoformat()

    day_keys = []
    cursor = datetime.fromisoformat(start_date).date()
    end_date = today.date()
    while cursor <= end_date:
        day_keys.append(cursor.isoformat())
        cursor += timedelta(days=1)

    ordered_by_day = {}
    sales_by_day = {}
    for order in db.query(models.Order).all():
        order_date = to_date_key(order.order_date or order.created_at)
        if not order_date or order_date < start_date or order_date > today_key:
            continue
        for item in db.query(models.OrderItem).filter(models.OrderItem.order_id == order.id).all():
            product_row = db.get(models.Product, item.product_id)
            if not product_row or product_row.sku != product.sku:
                continue
            ordered_by_day[order_date] = ordered_by_day.get(order_date, 0) + float(item.quantity or 0)

    for movement in db.query(models.Movement).filter(models.Movement.product_id == product.id).all():
        move_date = to_date_key(movement.created_at)
        if not move_date or move_date < start_date or move_date > today_key:
            continue
        if str(movement.movement_type).lower() not in {"sale", "liquidation"}:
            continue
        qty = abs(float(movement.quantity or 0))
        sales_by_day[move_date] = sales_by_day.get(move_date, 0) + qty

    bucket_size = 1
    if date_range == "30":
        bucket_size = 3
    elif date_range == "90":
        bucket_size = 10
    elif date_range == "all":
        bucket_size = max(1, math.ceil(len(day_keys) / 120))

    points = []
    for i in range(0, len(day_keys), bucket_size):
        chunk = day_keys[i:i + bucket_size]
        points.append({
            "key": chunk[0],
            "endKey": chunk[-1],
            "ordered": sum(ordered_by_day.get(key, 0) for key in chunk),
            "sales": sum(sales_by_day.get(key, 0) for key in chunk),
        })

    return {
        "product_sku": product.sku,
        "date_range": date_range,
        "points": points,
        "max_units": max([max(p["ordered"], p["sales"]) for p in points], default=1),
    }
