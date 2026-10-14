from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..db import get_db

router = APIRouter(prefix="/stock", tags=["stock"])


@router.get("", response_model=list[schemas.StockRead])
def list_stock(product_id: Optional[int] = None, db: Session = Depends(get_db)):
    query = (
        db.query(models.Stock, models.Product)
        .join(models.Product, models.Stock.product_id == models.Product.id)
    )
    if product_id is not None:
        query = query.filter(models.Stock.product_id == product_id)

    result = []
    for stock, product in query.order_by(models.Product.name).all():
        result.append(
            schemas.StockRead(
                product_id=product.id,
                on_hand=stock.on_hand,
                reserved=stock.reserved,
                product_sku=product.sku,
                product_name=product.name,
            )
        )
    return result



@router.get("/sales/month")
def monthly_sales(db: Session = Depends(get_db)):
    now = datetime.utcnow()
    start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    gross_sales = 0.0
    cost_of_goods_sold = 0.0
    for movement in db.query(models.Movement).filter(models.Movement.movement_type == "sale").all():
        if movement.created_at and movement.created_at >= start:
            product = db.get(models.Product, movement.product_id)
            quantity = abs(movement.quantity)
            gross_sales += quantity * (product.price or 0)
            cost_of_goods_sold += quantity * (product.cost or 0)
    return {
        "month": start.strftime("%Y-%m"),
        "gross_sales": gross_sales,
        "net_sales": gross_sales - cost_of_goods_sold,
        "cost_of_goods_sold": cost_of_goods_sold,
    }


@router.post("/remove")
def remove_stock(payload: schemas.StockAdjustment, db: Session = Depends(get_db)):
    if payload.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than zero")

    product = db.query(models.Product).filter(models.Product.sku == payload.product_sku).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    stock = db.query(models.Stock).filter(models.Stock.product_id == product.id).first()
    if not stock:
        stock = models.Stock(product_id=product.id, on_hand=0, reserved=0)
        db.add(stock)
        db.flush()

    if stock.on_hand < payload.quantity:
        raise HTTPException(status_code=400, detail="Insufficient stock")

    movement_type = "liquidation" if payload.liquidated else "sale"
    stock.on_hand -= payload.quantity
    db.add(models.Movement(product_id=product.id, movement_type=movement_type, quantity=-payload.quantity, reference=payload.reason or movement_type))
    db.commit()
    db.refresh(stock)

    return schemas.StockRead(
        product_id=product.id,
        on_hand=stock.on_hand,
        reserved=stock.reserved,
        product_sku=product.sku,
        product_name=product.name,
    )
