from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..db import get_db

router = APIRouter(prefix="/movements", tags=["movements"])


def get_or_create_stock(db: Session, product_id: int) -> models.Stock:
    stock = db.query(models.Stock).filter(models.Stock.product_id == product_id).first()
    if not stock:
        stock = models.Stock(product_id=product_id, on_hand=0, reserved=0)
        db.add(stock)
        db.flush()
    return stock


@router.get("", response_model=list[schemas.MovementRead])
def list_movements(product_id: Optional[int] = None, db: Session = Depends(get_db)):
    query = db.query(models.Movement)
    if product_id is not None:
        query = query.filter(models.Movement.product_id == product_id)
    return query.order_by(models.Movement.id.desc()).all()


@router.post("", response_model=schemas.MovementRead)
def create_movement(payload: schemas.MovementCreate, db: Session = Depends(get_db)):
    product = db.get(models.Product, payload.product_id)
    if not product:
        # allow sku? payload product_id from frontend. keep.
        raise HTTPException(status_code=404, detail="Product not found")

    quantity = payload.quantity
    if quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than zero")

    movement_type = payload.movement_type.lower()

    if movement_type == "receipt":
        stock = get_or_create_stock(db, product.id)
        stock.on_hand += quantity

    elif movement_type == "issue":
        stock = get_or_create_stock(db, product.id)
        if stock.on_hand - quantity < 0:
            raise HTTPException(status_code=400, detail="Insufficient stock")
        stock.on_hand -= quantity

    elif movement_type == "adjustment":
        stock = get_or_create_stock(db, product.id)
        if stock.on_hand + quantity < 0:
            raise HTTPException(status_code=400, detail="Adjustment would make stock negative")
        stock.on_hand += quantity

    else:
        raise HTTPException(status_code=400, detail="Unsupported movement type")

    movement = models.Movement(
        movement_type=movement_type,
        product_id=product.id,
        quantity=quantity,
        reference=payload.reference,
    )
    db.add(movement)
    db.commit()
    db.refresh(movement)
    return movement
