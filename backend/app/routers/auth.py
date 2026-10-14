from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy.orm import Session

from .. import models
from ..audit import log_activity
from ..auth import hash_passkey, issue_session, verify_passkey, require_user, require_admin, get_current_user
from ..db import get_db
from ..schemas import UserCreate

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    passkey: str


class RegisterRequest(BaseModel):
    name: str
    username: str
    email: str = ""
    passkey: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserReadAuth"


class PasskeyChangeRequest(BaseModel):
    current_passkey: str
    new_passkey: str


class PasskeyResetRequest(BaseModel):
    new_passkey: str


class PasskeyVerifyRequest(BaseModel):
    passkey: str


class UserReadAuth(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    username: str
    email: str = ""
    theme: str = "light"
    is_admin: bool = False


TokenResponse.model_rebuild()


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    if len(payload.passkey) < 8:
        raise HTTPException(status_code=400, detail="Passkey must be at least 8 characters")
    if db.query(models.User).filter(models.User.username == payload.username).first():
        raise HTTPException(status_code=400, detail="Username already exists")
    if db.query(models.User).filter(models.User.name == payload.name).first():
        raise HTTPException(status_code=400, detail="User name already exists")
    user = models.User(
        name=payload.name,
        username=payload.username,
        email=payload.email,
        theme="light",
        passkey_hash=hash_passkey(payload.passkey),
        is_admin=False,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    log_activity(db, "auth.register", user=user, entity_type="user", entity_id=user.id, status="success")
    db.commit()
    token = issue_session(db, user)
    return TokenResponse(access_token=token, user=UserReadAuth.model_validate(user))


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == payload.username).first()
    if not user or not verify_passkey(payload.passkey, user.passkey_hash):
        if user:
            log_activity(db, "auth.login", user=user, status="failure", error="invalid passkey")
            db.commit()
        raise HTTPException(status_code=401, detail="Invalid username or passkey")
    token = issue_session(db, user)
    log_activity(db, "auth.login", user=user, status="success")
    db.commit()
    return TokenResponse(access_token=token, user=UserReadAuth.model_validate(user))


@router.get("/me", response_model=UserReadAuth)
def me(user=Depends(get_current_user)):
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    return UserReadAuth.model_validate(user)


@router.post("/change-passkey")
def change_passkey(payload: PasskeyChangeRequest, db: Session = Depends(get_db), user=Depends(require_user)):
    if not verify_passkey(payload.current_passkey, user.passkey_hash):
        raise HTTPException(status_code=400, detail="Current passkey is incorrect")
    if len(payload.new_passkey) < 8:
        raise HTTPException(status_code=400, detail="Passkey must be at least 8 characters")
    user.passkey_hash = hash_passkey(payload.new_passkey)
    from datetime import datetime, timezone
    user.passkey_updated_at = datetime.now(timezone.utc)
    db.add(user)
    log_activity(db, "auth.change_passkey", user=user, entity_type="user", entity_id=user.id, status="success")
    db.commit()
    return {"status": "changed"}


@router.post("/users/{user_id}/passkey")
def reset_passkey(user_id: int, payload: PasskeyResetRequest, db: Session = Depends(get_db), admin=Depends(require_admin)):
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if len(payload.new_passkey) < 8:
        raise HTTPException(status_code=400, detail="Passkey must be at least 8 characters")
    user.passkey_hash = hash_passkey(payload.new_passkey)
    from datetime import datetime, timezone
    user.passkey_updated_at = datetime.now(timezone.utc)
    db.add(user)
    log_activity(db, "auth.admin_reset_passkey", user=admin, entity_type="user", entity_id=user.id, detail=f"reset passkey for {user.username}", status="success")
    db.commit()
    return {"status": "reset"}


@router.post("/logout")
def logout(request: "Request", db: Session = Depends(get_db)):
    from fastapi import Request as _Request  # noqa: F401
    from ..auth import revoke_session

    auth = request.headers.get("Authorization", "")
    token = auth.split(" ", 1)[1].strip() if auth.lower().startswith("bearer ") else None
    revoke_session(db, token)
    return {"status": "logged_out"}


class AdminFlagRequest(BaseModel):
    is_admin: bool


@router.patch("/users/{user_id}/admin")
def set_admin(user_id: int, payload: AdminFlagRequest, db: Session = Depends(get_db), admin=Depends(require_admin)):
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_admin = payload.is_admin
    db.add(user)
    log_activity(db, "auth.set_admin", user=admin, entity_type="user", entity_id=user.id, detail=f"{user.username} admin={payload.is_admin}", status="success")
    db.commit()
    return {"status": "updated", "is_admin": user.is_admin}


@router.post("/verify-passkey")
def verify_admin_passkey(payload: PasskeyVerifyRequest, db: Session = Depends(get_db), admin=Depends(require_admin)):
    if not verify_passkey(payload.passkey, admin.passkey_hash):
        raise HTTPException(status_code=401, detail="Invalid passkey")
    return {"status": "verified"}
