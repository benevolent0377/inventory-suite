from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..db import get_db

router = APIRouter(prefix="/orders", tags=["orders"])


def build_order_read(order: models.Order, db: Session) -> schemas.OrderRead:
    items = []
    for item in db.query(models.OrderItem).filter(models.OrderItem.order_id == order.id).all():
        product = db.get(models.Product, item.product_id)
        items.append(
            schemas.OrderItemRead(
                id=item.id,
                product_id=item.product_id,
                product_sku=product.sku if product else "",
                product_name=product.name if product else "",
                quantity=item.quantity,
                expected_arrival_date=item.expected_arrival_date,
                checked_in=item.checked_in,
                unit_cost=item.unit_cost,
            )
        )
    vendor = db.get(models.Vendor, order.vendor_id) if order.vendor_id else None
    return schemas.OrderRead(
        id=order.id,
        placed_by=order.placed_by,
        order_date=order.order_date,
        vendor_id=order.vendor_id,
        vendor_name=vendor.name if vendor else None,
        tracking_number=order.tracking_number,
        total_cost=order.total_cost,
        status=order.status,
        fulfilled=order.fulfilled,
        created_at=order.created_at,
        items=items,
    )


@router.get("", response_model=list[schemas.OrderRead])
def list_orders(db: Session = Depends(get_db)):
    orders = db.query(models.Order).all()
    orders.sort(key=lambda order: (order.fulfilled, order.order_date or order.created_at), reverse=False)
    # ensure unfulfilled first and newest first among same state
    unfulfilled = [o for o in orders if not o.fulfilled]
    fulfilled = [o for o in orders if o.fulfilled]
    unfulfilled.sort(key=lambda o: o.order_date or o.created_at, reverse=True)
    fulfilled.sort(key=lambda o: o.order_date or o.created_at, reverse=True)
    return [build_order_read(order, db) for order in unfulfilled + fulfilled]


@router.get("/{order_id}", response_model=schemas.OrderRead)
def get_order(order_id: int, db: Session = Depends(get_db)):
    order = db.get(models.Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return build_order_read(order, db)


@router.post("", response_model=schemas.OrderRead)
def create_order(payload: schemas.OrderCreate, db: Session = Depends(get_db)):
    if not payload.items:
        raise HTTPException(status_code=400, detail="At least one item is required")

    vendor = None
    if payload.vendor_id is not None:
        vendor = db.get(models.Vendor, payload.vendor_id)
        if not vendor:
            raise HTTPException(status_code=404, detail="Vendor not found")

    items: list[models.OrderItem] = []
    total_cost = 0.0
    for item in payload.items:
        product = db.query(models.Product).filter(models.Product.sku == item.item_number).first()
        if not product:
            raise HTTPException(status_code=404, detail=f"Item {item.item_number} not found")
        unit_cost = item.unit_cost if item.unit_cost is not None else product.cost
        quantity = item.quantity
        total_cost += quantity * unit_cost
        order_item = models.OrderItem(
            product_id=product.id,
            quantity=quantity,
            expected_arrival_date=item.expected_arrival_date,
            checked_in=False,
            unit_cost=unit_cost,
        )
        items.append(order_item)

    order = models.Order(
        placed_by=payload.placed_by,
        vendor_id=payload.vendor_id,
        tracking_number=payload.tracking_number,
        total_cost=total_cost,
        status="open",
    )
    if payload.order_date is not None:
        order.order_date = payload.order_date

    db.add(order)
    db.flush()
    for item in items:
        item.order_id = order.id
        db.add(item)

    db.commit()
    db.refresh(order)
    return build_order_read(order, db)


@router.patch("/{order_id}/items/{item_id}/checkin", response_model=schemas.OrderRead)
def checkin_item(
    order_id: int,
    item_id: int,
    checked_in: bool = Body(..., embed=True),
    db: Session = Depends(get_db),
):
    order = db.get(models.Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    item = db.get(models.OrderItem, item_id)
    if not item or item.order_id != order.id:
        raise HTTPException(status_code=404, detail="Order item not found")

    previous = item.checked_in
    item.checked_in = checked_in

    delta = 0.0
    if checked_in and not previous:
        delta = item.quantity
    elif previous and not checked_in:
        delta = -item.quantity

    if delta:
        stock = db.query(models.Stock).filter(models.Stock.product_id == item.product_id).first()
        if not stock:
            stock = models.Stock(product_id=item.product_id, on_hand=max(delta, 0), reserved=0)
            db.add(stock)
        else:
            stock.on_hand += delta
            if stock.on_hand < 0:
                stock.on_hand = 0

    all_items = db.query(models.OrderItem).filter(models.OrderItem.order_id == order.id).all()
    order.fulfilled = bool(all_items) and all(i.checked_in for i in all_items)
    order.status = "fulfilled" if order.fulfilled else "open"

    db.commit()
    return build_order_read(order, db)


@router.patch("/{order_id}/fulfill", response_model=schemas.OrderRead)
def fulfill_order(
    order_id: int,
    fulfilled: bool = Body(..., embed=True),
    db: Session = Depends(get_db),
):
    order = db.get(models.Order, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    order.fulfilled = fulfilled
    order.status = "fulfilled" if fulfilled else "open"
    db.commit()
    return build_order_read(order, db)
