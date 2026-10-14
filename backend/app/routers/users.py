from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import require_admin, require_user
from ..db import get_db

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[schemas.UserRead])
def list_users(db: Session = Depends(get_db)):
    return db.query(models.User).order_by(models.User.id).all()


@router.post("", response_model=schemas.UserRead)
def create_user(payload: schemas.UserCreate, db: Session = Depends(get_db), admin=Depends(require_admin)):
    exists = db.query(models.User).filter(models.User.name == payload.name).first()
    if exists:
        raise HTTPException(status_code=400, detail="User name already exists")
    user = models.User(**payload.model_dump())
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/{user_id}", response_model=schemas.UserRead)
def update_user(user_id: int, payload: schemas.UserCreate, db: Session = Depends(get_db), current=Depends(require_user)):
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if current.id != user_id and not getattr(current, "is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    for key, value in payload.model_dump().items():
        setattr(user, key, value)
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), admin=Depends(require_admin)):
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()
    return {"status": "deleted"}
