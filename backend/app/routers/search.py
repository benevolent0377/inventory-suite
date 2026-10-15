from urllib.parse import unquote

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .. import models
from ..db import get_db

router = APIRouter(prefix="/search", tags=["search"])


def product_to_dict(product: models.Product, db: Session):
    vendor = db.get(models.Vendor, product.vendor_id) if product.vendor_id else None
    return {
        "id": product.id,
        "sku": product.sku,
        "name": product.name,
        "category": product.category,
        "unit": product.unit,
        "vendor": vendor.name if vendor else None,
        "price": product.price,
        "cost": product.cost,
        "required_backstock": product.required_backstock,
        "duplicate_items": product.duplicate_item_numbers or [],
    }


@router.get("")
def search(q: str = Query(default=""), db: Session = Depends(get_db)):
    query = unquote(q).strip()
    if not query:
        return {"query": query, "products": [], "vendors": [], "orders": [], "movements": [], "logistics": []}

    like = f"%{query}%"

    products = db.query(models.Product).filter(
        or_(
            models.Product.sku.ilike(like),
            models.Product.name.ilike(like),
            models.Product.category.ilike(like),
        )
    ).all()

    vendors = db.query(models.Vendor).filter(
        or_(
            models.Vendor.name.ilike(like),
            models.Vendor.contact_name.ilike(like),
            models.Vendor.email.ilike(like),
            models.Vendor.phone.ilike(like),
            models.Vendor.address.ilike(like),
            models.Vendor.notes.ilike(like),
        )
    ).all()

    orders = db.query(models.Order).filter(
        or_(
            models.Order.placed_by.ilike(like),
            models.Order.tracking_number.ilike(like),
            models.Order.status.ilike(like),
        )
    ).all()

    order_results = []
    for order in orders:
        vendor = db.get(models.Vendor, order.vendor_id) if order.vendor_id else None
        order_results.append({
            "id": order.id,
            "placed_by": order.placed_by,
            "vendor": vendor.name if vendor else None,
            "tracking_number": order.tracking_number,
            "total_cost": order.total_cost,
            "status": order.status,
            "fulfilled": order.fulfilled,
            "created_at": order.order_date or order.created_at,
            "item_count": db.query(models.OrderItem).filter(models.OrderItem.order_id == order.id).count(),
        })

    product_ids = {product.id for product in products}
    movements = []
    movement_rows = db.query(models.Movement).filter(models.Movement.reference.ilike(like)).all()
    if not movement_rows and product_ids:
        movement_rows = db.query(models.Movement).filter(models.Movement.product_id.in_(product_ids)).all()
    for movement in movement_rows:
        product = db.get(models.Product, movement.product_id)
        movements.append({
            "id": movement.id,
            "type": movement.movement_type,
            "product_sku": product.sku if product else None,
            "product_name": product.name if product else None,
            "quantity": movement.quantity,
            "reference": movement.reference,
            "created_at": movement.created_at,
        })

    on_hand_by_product = {}
    for row in db.query(models.Stock).all():
        on_hand_by_product[row.product_id] = on_hand_by_product.get(row.product_id, 0) + row.on_hand

    logistics_results = []
    for product in db.query(models.Product).all():
        on_hand = on_hand_by_product.get(product.id, 0.0)
        required = product.required_backstock or 0
        shortage = max(required - on_hand, 0)
        urgency_shortage = shortage + (product.order_overhead_days or 0) + (product.order_overhead_months or 0) * 30
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
        urgency_weight = {"out_of_stock": 4, "critical": 3, "low": 2, "not_tracked": 1, "healthy": 0}.get(status, 0)
        urgency = float(max(1, urgency_weight * 5))
        vendor = db.get(models.Vendor, product.vendor_id) if product.vendor_id else None
        logistics_item = {
            "product_id": product.id,
            "sku": product.sku,
            "name": product.name,
            "vendor": vendor.name if vendor else None,
            "on_hand": on_hand,
            "required_backstock": required,
            "shortage": shortage,
            "status": status,
            "urgency": urgency,
            "order_quantity": shortage,
        }
        values = " ".join(str(v) for v in logistics_item.values() if v is not None).lower()
        if query.lower() in values:
            logistics_results.append(logistics_item)

    return {
        "query": query,
        "products": [product_to_dict(product, db) for product in products],
        "vendors": [
            {
                "id": vendor.id,
                "name": vendor.name,
                "contact_name": vendor.contact_name,
                "email": vendor.email,
                "phone": vendor.phone,
                "address": vendor.address,
                "notes": vendor.notes,
            }
            for vendor in vendors
        ],
        "orders": order_results,
        "movements": movements,
        "logistics": logistics_results,
    }
