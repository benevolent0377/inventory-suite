import base64
import io
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
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



@router.get("/sales/months")
def sales_months(db: Session = Depends(get_db)):
    months = set()
    for movement in db.query(models.Movement).filter(models.Movement.movement_type == "sale").all():
        if movement.created_at:
            months.add(movement.created_at.strftime("%Y-%m"))
    now = datetime.utcnow()
    months.add(now.strftime("%Y-%m"))
    return sorted(months, reverse=True)


@router.get("/sales/daily")
def daily_sales(month: Optional[str] = None, db: Session = Depends(get_db)):
    if month:
        try:
            selected = datetime.strptime(month, "%Y-%m")
        except ValueError:
            selected = datetime.utcnow().replace(day=1)
    else:
        selected = datetime.utcnow()
    start = selected.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if start.month == 12:
        end = start.replace(year=start.year + 1, month=1)
    else:
        end = start.replace(month=start.month + 1)

    sales_by_date = {}
    cost_by_date = {}
    day = start
    while day < end:
        key = day.strftime("%Y-%m-%d")
        sales_by_date[key] = 0.0
        cost_by_date[key] = 0.0
        day += timedelta(days=1)

    for movement in db.query(models.Movement).filter(models.Movement.movement_type == "sale").all():
        if not movement.created_at or not (start <= movement.created_at < end):
            continue
        product = db.get(models.Product, movement.product_id)
        if not product:
            continue
        quantity = abs(movement.quantity)
        key = movement.created_at.strftime("%Y-%m-%d")
        if key in sales_by_date:
            sales_by_date[key] += quantity * (product.price or 0)

    for order in db.query(models.Order).all():
        order_date = order.order_date or order.created_at
        if not order_date or not (start <= order_date < end):
            continue
        key = order_date.strftime("%Y-%m-%d")
        if key in cost_by_date:
            cost_by_date[key] += order.total_cost or 0

    days = []
    day = start
    while day < end:
        key = day.strftime("%Y-%m-%d")
        days.append({
            "date": key,
            "sales": sales_by_date[key],
            "order_cost": cost_by_date[key],
        })
        day += timedelta(days=1)

    return {
        "month": start.strftime("%Y-%m"),
        "days": days,
    }


@router.get("/sales/daily/chart")
def daily_sales_chart(month: Optional[str] = None, db: Session = Depends(get_db)):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    data = daily_sales(month, db)
    days = data["days"]
    if not days:
        raise HTTPException(status_code=404, detail="No sales data")

    fig, ax = plt.subplots(figsize=(9, 4))
    x = list(range(len(days)))
    ax.plot(x, [float(d["sales"]) for d in days], color="#3b82f6", linewidth=2.5, label="Sales")
    ax.plot(x, [float(d["order_cost"]) for d in days], color="#dc2626", linewidth=2.5, label="Order cost")
    ax.set_xticks(x[::max(1, len(x) // 8)])
    ax.set_xticklabels([days[i]["date"].split("-")[-1] for i in x[::max(1, len(x) // 8)]], fontsize=8)
    ax.set_ylabel("Amount")
    ax.set_title(f"Sales vs order cost: {data['month']}")
    ax.legend()
    fig.tight_layout()

    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=120)
    plt.close(fig)
    buf.seek(0)
    encoded = base64.b64encode(buf.read()).decode("ascii")
    return {"image": f"data:image/png;base64,{encoded}"}
@router.get("/sales/month")
def monthly_sales(month: Optional[str] = None, db: Session = Depends(get_db)):
    if month:
        try:
            selected = datetime.strptime(month, "%Y-%m")
        except ValueError:
            selected = datetime.utcnow().replace(day=1)
    else:
        selected = datetime.utcnow()
    start = selected.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if start.month == 12:
        end = start.replace(year=start.year + 1, month=1)
    else:
        end = start.replace(month=start.month + 1)
    gross_sales = 0.0
    cost_of_goods_sold = 0.0
    for movement in db.query(models.Movement).filter(models.Movement.movement_type == "sale").all():
        if movement.created_at and start <= movement.created_at < end:
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
    db.add(models.Movement(product_id=product.id, movement_type=movement_type, quantity=-payload.quantity, reference=payload.reason or movement_type, created_at=datetime.utcnow()))
    db.commit()
    db.refresh(stock)

    return schemas.StockRead(
        product_id=product.id,
        on_hand=stock.on_hand,
        reserved=stock.reserved,
        product_sku=product.sku,
        product_name=product.name,
    )
