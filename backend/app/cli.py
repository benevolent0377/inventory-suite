import argparse
import json
from datetime import datetime

from . import models
from .db import Base, SessionLocal, engine, ensure_schema

Base.metadata.create_all(bind=engine)
ensure_schema()


def session():
    return SessionLocal()


def print_json(value):
    print(json.dumps(value, indent=2, default=str))


def resolve_vendor(db, value):
    if value is None:
        return None
    if str(value).isdigit():
        vendor = db.get(models.Vendor, int(value))
    else:
        vendor = db.query(models.Vendor).filter(models.Vendor.name == value).first()
    if not vendor:
        raise SystemExit(f"Vendor not found: {value}")
    return vendor.id


def resolve_product(db, value):
    if str(value).isdigit():
        product = db.get(models.Product, int(value))
    else:
        product = db.query(models.Product).filter(models.Product.sku == value).first()
    if not product:
        raise SystemExit(f"Product not found: {value}")
    return product


def parse_list(value):
    return [part.strip() for part in value.split(",") if part.strip()] if value else []


def cmd_items_list(args):
    db = session()
    products = db.query(models.Product).order_by(models.Product.id).all()
    if args.json:
        print_json([{
            "id": p.id,
            "sku": p.sku,
            "name": p.name,
            "category": p.category,
            "vendor_id": p.vendor_id,
            "price": p.price,
            "last_price": p.last_price,
            "cost": p.cost,
            "required_backstock": p.required_backstock,
            "order_overhead_days": p.order_overhead_days,
            "order_overhead_months": p.order_overhead_months,
            "duplicate_item_numbers": p.duplicate_item_numbers or [],
        } for p in products])
        db.close()
        return
    for p in products:
        on_hand = sum(s.on_hand for s in db.query(models.Stock).filter(models.Stock.product_id == p.id).all())
        print(f"{p.id:>3} {p.sku:<16} {p.name:<24} on_hand={on_hand:g} required={p.required_backstock:g} overhead_days={p.order_overhead_days:g} overhead_months={p.order_overhead_months:g} cost={p.cost:g} price={p.price:g}")
    db.close()


def cmd_items_get(args):
    db = session()
    product = resolve_product(db, args.item)
    on_hand = sum(s.on_hand for s in db.query(models.Stock).filter(models.Stock.product_id == product.id).all())
    print_json({
        "id": product.id,
        "sku": product.sku,
        "name": product.name,
        "category": product.category,
        "unit": product.unit,
        "vendor_id": product.vendor_id,
        "price": product.price,
        "last_price": product.last_price,
        "cost": product.cost,
        "required_backstock": product.required_backstock,
        "order_overhead_days": product.order_overhead_days,
        "order_overhead_months": product.order_overhead_months,
        "on_hand": on_hand,
        "duplicate_item_numbers": product.duplicate_item_numbers or [],
    })
    db.close()


def cmd_items_create(args):
    db = session()
    if db.query(models.Product).filter(models.Product.sku == args.sku).first():
        raise SystemExit(f"SKU already exists: {args.sku}")
    product = models.Product(
        sku=args.sku,
        name=args.name,
        description=getattr(args, "description", "") or "",
        category=args.category or "",
        unit=args.unit or "each",
        price=args.price or 0,
        cost=args.cost or 0,
        required_backstock=args.required_backstock or 0,
        order_overhead_days=args.order_overhead_days or 0,
        order_overhead_months=args.order_overhead_months or 0,
        duplicate_item_numbers=parse_list(args.duplicate_item_numbers),
        vendor_id=resolve_vendor(db, args.vendor) if args.vendor else None,
    )
    db.add(product)
    db.commit()
    print(f"Created item {product.sku} (id={product.id})")
    db.close()


def cmd_items_update(args):
    db = session()
    product = resolve_product(db, args.item)
    if args.price is not None and args.price != product.price:
        product.last_price = product.price
    if args.name is not None:
        product.name = args.name
    if args.category is not None:
        product.category = args.category
    if getattr(args, "description", None) is not None:
        product.description = args.description
    if args.unit is not None:
        product.unit = args.unit
    if args.price is not None:
        product.price = args.price
    if args.cost is not None:
        product.cost = args.cost
    if args.required_backstock is not None:
        product.required_backstock = args.required_backstock
    if args.order_overhead_days is not None:
        product.order_overhead_days = args.order_overhead_days
    if args.order_overhead_months is not None:
        product.order_overhead_months = args.order_overhead_months
    if args.vendor is not None:
        product.vendor_id = resolve_vendor(db, args.vendor)
    if args.duplicate_item_numbers is not None:
        product.duplicate_item_numbers = parse_list(args.duplicate_item_numbers)
    db.commit()
    print(f"Updated item {product.sku}")
    db.close()


def cmd_vendors_list(args):
    db = session()
    for v in db.query(models.Vendor).order_by(models.Vendor.id).all():
        print(f"{v.id:>3} {v.name:<24} {v.contact_name or ''} {v.email or ''} {v.phone or ''}")
    db.close()


def cmd_vendors_create(args):
    db = session()
    vendor = models.Vendor(
        name=args.name,
        contact_name=args.contact_name or "",
        email=args.email or "",
        phone=args.phone or "",
        address=args.address or "",
        notes=args.notes or "",
    )
    db.add(vendor)
    db.commit()
    print(f"Created vendor {vendor.name} (id={vendor.id})")
    db.close()


def cmd_stock_adjust(args):
    db = session()
    product = resolve_product(db, args.item)
    stock = db.query(models.Stock).filter(models.Stock.product_id == product.id).first()
    if not stock:
        stock = models.Stock(product_id=product.id, on_hand=0, reserved=0)
        db.add(stock)
        db.flush()
    qty = args.quantity
    if stock.on_hand + qty < 0:
        raise SystemExit("Adjustment would make stock negative")
    stock.on_hand += qty
    movement = models.Movement(
        movement_type="adjustment",
        product_id=product.id,
        quantity=abs(qty),
        reference=args.reference or "",
    )
    db.add(movement)
    db.commit()
    print(f"Adjusted {product.sku}: on_hand now {stock.on_hand:g}")
    db.close()


def cmd_orders_list(args):
    db = session()
    for order in db.query(models.Order).order_by(models.Order.id.desc()).all():
        vendor = db.get(models.Vendor, order.vendor_id) if order.vendor_id else None
        print(f"Order {order.id}: {order.placed_by} | {order.order_date} | vendor={vendor.name if vendor else '-'} | tracking={order.tracking_number} | total={order.total_cost:g} | status={order.status} | fulfilled={order.fulfilled}")
        for item in db.query(models.OrderItem).filter(models.OrderItem.order_id == order.id).all():
            product = db.get(models.Product, item.product_id)
            print(f"   item {item.id}: {product.sku if product else item.product_id} qty={item.quantity:g} expected={item.expected_arrival_date} checked_in={item.checked_in}")
    db.close()


def cmd_orders_create(args):
    db = session()
    items = []
    for spec in args.items.split(","):
        spec = spec.strip()
        if not spec:
            continue
        parts = spec.split(":")
        sku = parts[0].strip()
        quantity = float(parts[1]) if len(parts) > 1 and parts[1] else 1
        expected = None
        if len(parts) > 2 and parts[2]:
            expected = datetime.fromisoformat(parts[2])
        items.append((sku, quantity, expected))
    vendor_id = resolve_vendor(db, args.vendor) if args.vendor else None

    total = 0.0
    db_items = []
    for sku, quantity, expected in items:
        product = resolve_product(db, sku)
        if db is None:
            continue
        unit_cost = product.cost
        total += quantity * unit_cost
        db_items.append(models.OrderItem(product_id=product.id, quantity=quantity, expected_arrival_date=expected, unit_cost=unit_cost, checked_in=False))

    order = models.Order(placed_by=args.placed_by, vendor_id=vendor_id, tracking_number=args.tracking or "", total_cost=total, status="open")
    if args.date:
        placed_at = datetime.fromisoformat(args.date)
        if placed_at > datetime.utcnow():
            raise ValueError("Order date cannot be in the future")
        order.order_date = placed_at
    db.add(order)
    db.flush()
    for item in db_items:
        item.order_id = order.id
        db.add(item)
    db.commit()
    print(f"Created order {order.id} total={total:g}")
    db.close()


# simple placeholder conversion helper
def schemasplaceholder(sku, quantity, expected):
    return sku, quantity, expected


def cmd_orders_checkin(args):
    db = session()
    item = db.get(models.OrderItem, args.item_id)
    if not item or item.order_id != args.order_id:
        raise SystemExit("Order item not found")
    item.checked_in = args.value
    db.commit()
    print(f"Order item {item.id} checked_in={item.checked_in}")
    db.close()


def cmd_orders_fulfill(args):
    db = session()
    order = db.get(models.Order, args.order_id)
    if not order:
        raise SystemExit("Order not found")
    order.fulfilled = args.value
    order.status = "fulfilled" if args.value else "open"
    db.commit()
    print(f"Order {order.id} fulfilled={order.fulfilled}")
    db.close()


def cmd_logistics(args):
    db = session()
    products = db.query(models.Product).order_by(models.Product.id).all()
    stock_qty = {}
    for row in db.query(models.Stock).all():
        stock_qty[row.product_id] = stock_qty.get(row.product_id, 0) + row.on_hand
    print("ID  SKU             NAME                 ON_HAND  REQUIRED  SHORTAGE  STATUS    URGENCY COST")
    for p in products:
        on_hand = stock_qty.get(p.id, 0.0)
        required = p.required_backstock or 0
        shortage = max(required - on_hand, 0)
        urgency_shortage = shortage + (p.order_overhead_days or 0) + (p.order_overhead_months or 0) * 30
        if required <= 0:
            status = "not_tracked"
        elif on_hand <= 0:
            status = "out"
        elif urgency_shortage >= max(1, required * 0.5):
            status = "critical"
        elif urgency_shortage > 0:
            status = "low"
        else:
            status = "ok"
        urgency_weight = {"out": 4, "critical": 3, "low": 2, "not_tracked": 1, "ok": 0}.get(status, 0)
        urgency = max(1, urgency_weight * 5)
        print(f"{p.id:>3} {p.sku:<16} {p.name:<20} {on_hand:>7g} {required:>8g} {shortage:>8g} {status:<8} {urgency:>5.1f} {p.cost:>6g}")
    db.close()


def cmd_help(args):
    parser = build_parser()
    topic = getattr(args, "topic", None)
    if topic:
        print(f"Use: inventory-cli {topic} --help")
    else:
        parser.print_help()


def build_parser():
    parser = argparse.ArgumentParser(prog="inventory-cli", description="Terminal interface for Inventory Suite database")
    sub = parser.add_subparsers(dest="command", required=True)

    items = sub.add_parser("items")
    items_sub = items.add_subparsers(dest="action", required=True)
    il = items_sub.add_parser("list")
    il.add_argument("--json", action="store_true")
    il.set_defaults(func=cmd_items_list)
    ig = items_sub.add_parser("get")
    ig.add_argument("item")
    ig.set_defaults(func=cmd_items_get)
    ic = items_sub.add_parser("create")
    ic.add_argument("--sku", required=True)
    ic.add_argument("--name", required=True)
    ic.add_argument("--category", default="")
    ic.add_argument("--description", default="")
    ic.add_argument("--unit", default="each")
    ic.add_argument("--vendor")
    ic.add_argument("--price", type=float)
    ic.add_argument("--cost", type=float)
    ic.add_argument("--required-backstock", type=float, dest="required_backstock")
    ic.add_argument("--order-overhead-days", type=float, dest="order_overhead_days")
    ic.add_argument("--order-overhead-months", type=float, dest="order_overhead_months")
    ic.add_argument("--duplicate-item-numbers", dest="duplicate_item_numbers")
    ic.set_defaults(func=cmd_items_create)
    iu = items_sub.add_parser("update")
    iu.add_argument("item")
    iu.add_argument("--name")
    iu.add_argument("--category")
    iu.add_argument("--description")
    iu.add_argument("--unit")
    iu.add_argument("--vendor")
    iu.add_argument("--price", type=float)
    iu.add_argument("--cost", type=float)
    iu.add_argument("--required-backstock", type=float, dest="required_backstock")
    iu.add_argument("--order-overhead-days", type=float, dest="order_overhead_days")
    iu.add_argument("--order-overhead-months", type=float, dest="order_overhead_months")
    iu.add_argument("--duplicate-item-numbers", dest="duplicate_item_numbers")
    iu.set_defaults(func=cmd_items_update)

    vendors = sub.add_parser("vendors")
    vendors_sub = vendors.add_subparsers(dest="action", required=True)
    vl = vendors_sub.add_parser("list")
    vl.set_defaults(func=cmd_vendors_list)
    vc = vendors_sub.add_parser("create")
    vc.add_argument("--name", required=True)
    vc.add_argument("--contact-name", dest="contact_name")
    vc.add_argument("--email")
    vc.add_argument("--phone")
    vc.add_argument("--address")
    vc.add_argument("--notes")
    vc.set_defaults(func=cmd_vendors_create)

    stock = sub.add_parser("stock")
    stock_sub = stock.add_subparsers(dest="action", required=True)
    sa = stock_sub.add_parser("adjust")
    sa.add_argument("--item", required=True)
    sa.add_argument("--quantity", type=float, required=True)
    sa.add_argument("--reference", default="")
    sa.set_defaults(func=cmd_stock_adjust)

    movements = sub.add_parser("movements")
    movements_sub = movements.add_subparsers(dest="action", required=True)
    # list
    ml = movements_sub.add_parser("list")
    ml.set_defaults(func=lambda args: print("Use orders/items APIs; movements listing not implemented in CLI"))
    # create
    mc = movements_sub.add_parser("create")
    mc.add_argument("--type", required=True, dest="movement_type")
    mc.add_argument("--item", required=True)
    mc.add_argument("--quantity", type=float, required=True)
    mc.add_argument("--reference", default="")
    mc.set_defaults(func=lambda args: cmd_movement_create(args))

    orders = sub.add_parser("orders")
    orders_sub = orders.add_subparsers(dest="action", required=True)
    ol = orders_sub.add_parser("list")
    ol.set_defaults(func=cmd_orders_list)
    oc = orders_sub.add_parser("create")
    oc.add_argument("--placed-by", required=True, dest="placed_by")
    oc.add_argument("--vendor")
    oc.add_argument("--tracking", default="")
    oc.add_argument("--date")
    oc.add_argument("--items", required=True, help="Comma specs: SKU:qty:YYYY-MM-DD")
    oc.set_defaults(func=cmd_orders_create)
    ocheck = orders_sub.add_parser("checkin")
    ocheck.add_argument("order_id", type=int)
    ocheck.add_argument("item_id", type=int)
    ocheck.add_argument("--checked", dest="value", action="store_true", default=True)
    ocheck.set_defaults(func=cmd_orders_checkin)
    ofulfill = orders_sub.add_parser("fulfill")
    ofulfill.add_argument("order_id", type=int)
    ofulfill.add_argument("--value", dest="value", action="store_true", default=True)
    ofulfill.add_argument("--unfulfill", dest="value", action="store_false")
    ofulfill.set_defaults(func=cmd_orders_fulfill)

    logs = sub.add_parser("logistics")
    logs.set_defaults(func=cmd_logistics)

    clear = sub.add_parser("clear", help="Clear rows from specified tables")
    clear.add_argument("tables", nargs="+", help="Table names or 'all'")
    clear.add_argument("--yes", action="store_true", help="Confirm destructive clear")
    clear.set_defaults(func=cmd_clear)

    help_parser = sub.add_parser("help", help="Show command help")
    help_parser.add_argument("topic", nargs="?")
    help_parser.set_defaults(func=cmd_help)

    return parser


def cmd_movement_create(args):
    db = session()
    product = resolve_product(db, args.item)
    movement_type = args.movement_type.lower()
    quantity = args.quantity
    stock = db.query(models.Stock).filter(models.Stock.product_id == product.id).first()
    if not stock:
        stock = models.Stock(product_id=product.id, on_hand=0, reserved=0)
        db.add(stock)
        db.flush()

    if movement_type == "receipt":
        stock.on_hand += quantity
    elif movement_type == "issue":
        if stock.on_hand - quantity < 0:
            raise SystemExit("insufficient stock")
        stock.on_hand -= quantity
    elif movement_type == "adjustment":
        if stock.on_hand + quantity < 0:
            raise SystemExit("negative result")
        stock.on_hand += quantity
    else:
        raise SystemExit(f"unsupported type {movement_type}")

    movement = models.Movement(
        movement_type=movement_type,
        product_id=product.id,
        quantity=quantity,
        reference=args.reference or "",
    )
    db.add(movement)
    db.commit()
    print(f"Recorded {movement_type} for {product.sku}")
    db.close()


def main():
    parser = build_parser()
    args = parser.parse_args()
    if args.command == "orders" and args.action == "checkin":
        args.value = args.value  # store_true, default False means checkbox off? ensure toggle
    args.func(args)




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


def cmd_clear(args):
    if not args.yes:
        raise SystemExit("Pass --yes to confirm clearing table data")
    if any(item.lower() == "all" for item in args.tables):
        tables = ["users", "movements", "order_items", "orders", "stock", "products", "vendors"]
    else:
        tables = []
        for item in args.tables:
            table = TABLE_ALIASES.get(item.lower())
            if table is None:
                raise SystemExit("Unknown table: " + item)
            if table not in tables:
                tables.append(table)

    from sqlalchemy import text

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
    print("Cleared: " + ", ".join(tables))


if __name__ == "__main__":
    main()
