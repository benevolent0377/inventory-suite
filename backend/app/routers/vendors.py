from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..db import get_db

router = APIRouter(prefix="/vendors", tags=["vendors"])


@router.get("", response_model=list[schemas.VendorRead])
def list_vendors(db: Session = Depends(get_db)):
    return db.query(models.Vendor).order_by(models.Vendor.id).all()


@router.post("", response_model=schemas.VendorRead)
def create_vendor(payload: schemas.VendorCreate, db: Session = Depends(get_db)):
    exists = db.query(models.Vendor).filter(models.Vendor.name == payload.name).first()
    if exists:
        raise HTTPException(status_code=400, detail="Vendor name already exists")
    vendor = models.Vendor(**payload.model_dump())
    db.add(vendor)
    db.commit()
    db.refresh(vendor)
    return vendor


@router.put("/{vendor_id}", response_model=schemas.VendorRead)
def update_vendor(vendor_id: int, payload: schemas.VendorCreate, db: Session = Depends(get_db)):
    vendor = db.get(models.Vendor, vendor_id)
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    for key, value in payload.model_dump().items():
        setattr(vendor, key, value)
    db.commit()
    db.refresh(vendor)
    return vendor


@router.delete("/{vendor_id}")
def delete_vendor(vendor_id: int, db: Session = Depends(get_db)):
    vendor = db.get(models.Vendor, vendor_id)
    if not vendor:
        raise HTTPException(status_code=404, detail="Vendor not found")
    db.delete(vendor)
    db.commit()
    return {"status": "deleted"}
