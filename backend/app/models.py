from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.types import JSON
from .db import Base


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    sku = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    description = Column(String, default="")
    category = Column(String, default="")
    unit = Column(String, default="each")
    price = Column(Float, default=0)
    last_price = Column(Float, nullable=True)
    cost = Column(Float, default=0)
    required_backstock = Column(Float, default=0)
    order_overhead_days = Column(Float, default=0)
    order_overhead_months = Column(Float, default=0)
    duplicate_item_numbers = Column(JSON, default=list)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=True)
    vendor_item_id = Column(String, default="")
    created_at = Column(DateTime, server_default=func.now())


class Stock(Base):
    __tablename__ = "stock"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False, unique=True, index=True)
    on_hand = Column(Float, default=0)
    reserved = Column(Float, default=0)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())



class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, default="")
    theme = Column(String, default="dark")
    passkey_hash = Column(String, nullable=True)
    passkey_updated_at = Column(DateTime, nullable=True)
    is_admin = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, server_default=func.now())


class Vendor(Base):
    __tablename__ = "vendors"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    contact_name = Column(String, default="")
    email = Column(String, default="")
    phone = Column(String, default="")
    address = Column(String, default="")
    notes = Column(String, default="")
    created_at = Column(DateTime, server_default=func.now())


class Movement(Base):
    __tablename__ = "movements"

    id = Column(Integer, primary_key=True, index=True)
    movement_type = Column(String, nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    quantity = Column(Float, nullable=False)
    reference = Column(String, default="")
    created_at = Column(DateTime, server_default=func.now())


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    placed_by = Column(String, nullable=False)
    order_date = Column(DateTime, server_default=func.now())
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=True)
    tracking_number = Column(String, default="")
    total_cost = Column(Float, default=0)
    status = Column(String, default="open")
    fulfilled = Column(Boolean, default=False)
    created_at = Column(DateTime, server_default=func.now())


class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    quantity = Column(Float, default=1)
    expected_arrival_date = Column(DateTime, nullable=True)
    checked_in = Column(Boolean, default=False)
    unit_cost = Column(Float, default=0)


class UserSession(Base):
    __tablename__ = "user_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token_hash = Column(String, nullable=False, unique=True, index=True)
    created_at = Column(DateTime, server_default=func.now())
    expires_at = Column(DateTime, nullable=False, index=True)
    client_host = Column(String, default="")


class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    username = Column(String, default="anonymous", index=True)
    action = Column(String, nullable=False, index=True)
    entity_type = Column(String, default="", index=True)
    entity_id = Column(Integer, nullable=True, index=True)
    detail = Column(String, default="")
    status = Column(String, default="success", index=True)
    error = Column(String, default="")
    client_host = Column(String, default="")
    created_at = Column(DateTime, server_default=func.now(), index=True)


class Request(Base):
    __tablename__ = "requests"

    id = Column(Integer, primary_key=True, index=True)
    opened_by = Column(String, nullable=False, index=True)
    status = Column(String, default="open", index=True)
    status_updated_by = Column(String, default="")
    date_placed = Column(DateTime, server_default=func.now())
    date_filled = Column(DateTime, nullable=True)
    linked_order_id = Column(Integer, ForeignKey("orders.id"), nullable=True)
    total_requested_quantity = Column(Float, default=0)
    priority_score = Column(Float, default=0)
    items = Column(JSON, default=list)
    notes = Column(String, default="")
    created_at = Column(DateTime, server_default=func.now())
