from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict


class ProductCreate(BaseModel):
    sku: str
    name: str
    category: str = ""
    description: str = ""
    unit: str = "each"
    price: float = 0
    cost: float = 0
    required_backstock: float = 0
    order_overhead_days: float = 0
    order_overhead_months: float = 0
    duplicate_item_numbers: List[str] = []
    vendor_id: int


class ProductRead(ProductCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    vendor_id: Optional[int] = None
    last_price: Optional[float] = None
    created_at: Optional[datetime] = None


class VendorCreate(BaseModel):
    name: str
    contact_name: str = ""
    email: str = ""
    phone: str = ""
    address: str = ""
    notes: str = ""


class VendorRead(VendorCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: Optional[datetime] = None


class UserCreate(BaseModel):
    name: str
    username: str
    email: str = ""
    theme: str = "dark"


class UserRead(UserCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    is_admin: bool = False
    created_at: Optional[datetime] = None


class MovementCreate(BaseModel):
    movement_type: str
    product_id: int
    quantity: float
    reference: str = ""


class MovementRead(MovementCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: Optional[datetime] = None


class StockRead(BaseModel):
    product_id: int
    on_hand: float
    reserved: float
    product_sku: str
    product_name: str


class StockAdjustment(BaseModel):
    product_sku: str
    quantity: float
    reason: str = "sale"
    liquidated: bool = False


class OrderItemCreate(BaseModel):
    item_number: str
    quantity: float = 1
    expected_arrival_date: Optional[datetime] = None
    unit_cost: Optional[float] = None


class OrderItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    product_id: int
    product_sku: str
    product_name: str
    quantity: float
    expected_arrival_date: Optional[datetime] = None
    checked_in: bool = False
    unit_cost: float = 0


class OrderCreate(BaseModel):
    placed_by: str
    vendor_id: Optional[int] = None
    tracking_number: str = ""
    items: List[OrderItemCreate]
    order_date: Optional[datetime] = None


class OrderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    placed_by: str
    order_date: Optional[datetime] = None
    vendor_id: Optional[int] = None
    vendor_name: Optional[str] = None
    tracking_number: str = ""
    total_cost: float = 0
    status: str = "open"
    fulfilled: bool = False
    created_at: Optional[datetime] = None
    items: List[OrderItemRead] = []


class LogisticsItem(BaseModel):
    product_id: int
    sku: str
    name: str
    vendor_name: Optional[str] = None
    on_hand: float = 0
    required_backstock: float = 0
    shortage: float = 0
    order_overhead_days: float = 0
    order_overhead_months: float = 0
    cost: float = 0
    price: float = 0
    status: str
    urgency: float = 1
    order_quantity: float = 0
    slow_order: bool = False
    priority_score: float = 0

class LogisticsRead(BaseModel):
    total_items: int
    total_on_hand: float
    total_inventory_cost: float
    items: List[LogisticsItem]
