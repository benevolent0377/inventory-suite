from typing import Optional

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas
from ..db import get_db
from ..utils import compute_urgency

router = APIRouter(prefix="/logistics", tags=["logistics"])


@router.get("", response_model=schemas.LogisticsRead)
def logistics(db: Session = Depends(get_db)):
    products = db.query(models.Product).order_by(models.Product.id).all()
    stock_rows = db.query(models.Stock).all()
    on_hand_by_product: dict[int, float] = {}
    for row in stock_rows:
        on_hand_by_product[row.product_id] = on_hand_by_product.get(row.product_id, 0) + row.on_hand

    vendor_by_id = {v.id: v for v in db.query(models.Vendor).all()}

    items = []
    total_on_hand = 0.0
    total_inventory_cost = 0.0

    for product in products:
        on_hand = on_hand_by_product.get(product.id, 0.0)
        total_on_hand += on_hand
        total_inventory_cost += on_hand * (product.cost or 0)

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

        order_quantity = shortage

        slow_order = (product.cost or 0) >= 100
        urgency = compute_urgency(status, shortage, required, order_overhead_days)
        urgency_weight = {"out_of_stock": 4, "critical": 3, "low": 2, "not_tracked": 1, "healthy": 0}.get(status, 0)
        priority_score = urgency_weight * 100 + shortage + order_overhead_days + ((product.cost or 0) * (0.01 if slow_order else 0.05))

        vendor = vendor_by_id.get(product.vendor_id)
        items.append(
            schemas.LogisticsItem(
                product_id=product.id,
                sku=product.sku,
                name=product.name,
                vendor_name=vendor.name if vendor else None,
                on_hand=on_hand,
                required_backstock=required,
                shortage=shortage,
                order_overhead_days=product.order_overhead_days or 0,
                order_overhead_months=product.order_overhead_months or 0,
                cost=product.cost or 0,
                price=product.price or 0,
                status=status,
                urgency=urgency,
                order_quantity=order_quantity,
                slow_order=slow_order,
                priority_score=priority_score,
            )
        )

    items.sort(key=lambda item: (item.priority_score, -item.cost), reverse=True)

    return schemas.LogisticsRead(
        total_items=len(products),
        total_on_hand=total_on_hand,
        total_inventory_cost=total_inventory_cost,
        items=items,
    )
