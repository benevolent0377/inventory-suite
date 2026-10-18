import base64
import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from . import models

SCRYPT_N = 16384
SCRYPT_R = 8
SCRYPT_P = 1
SCRYPT_DKLEN = 32
SALT_BYTES = 16
TOKEN_BYTES = 32
SESSION_HOURS = 12


def generate_passkey(length: int = 14) -> str:
    if length < 10 or length > 15:
        raise ValueError("passkey length must be between 10 and 15")
    alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    while True:
        key = "".join(secrets.choice(alphabet) for _ in range(length))
        if (any(c.islower() for c in key)
                and any(c.isupper() for c in key)
                and any(c.isdigit() for c in key)):
            return key


def hash_passkey(passkey: str) -> str:
    # Persist only the salted derived key and its parameters, never the passkey.
    salt = os.urandom(SALT_BYTES)
    derived = hashlib.scrypt(
        passkey.encode("utf-8"),
        salt=salt,
        n=SCRYPT_N,
        r=SCRYPT_R,
        p=SCRYPT_P,
        dklen=SCRYPT_DKLEN,
    )
    return "$scrypt${}${}${}${}${}".format(
        SCRYPT_N,
        SCRYPT_R,
        SCRYPT_P,
        base64.urlsafe_b64encode(salt).rstrip(b"=").decode("ascii"),
        base64.urlsafe_b64encode(derived).rstrip(b"=").decode("ascii"),
    )


def verify_passkey(passkey: str, passkey_hash: str | None) -> bool:
    if not passkey_hash or not passkey:
        return False
    try:
        _algo, _scrypt, n, r, p, salt_b64, hash_b64 = passkey_hash.split("$", 6)
    except ValueError:
        return False
    if _algo != "" or _scrypt != "scrypt":
        return False
    try:
        n, r, p = int(n), int(r), int(p)
        salt = _b64_decode(salt_b64)
        expected = _b64_decode(hash_b64)
    except (ValueError, TypeError):
        return False
    derived = hashlib.scrypt(passkey.encode("utf-8"), salt=salt, n=n, r=r, p=p, dklen=len(expected))
    return secrets.compare_digest(derived, expected)


def _b64_decode(value: str) -> bytes:
    padding = "=" * ((4 - len(value) % 4) % 4)
    return base64.urlsafe_b64decode(value + padding)


def get_user_by_token(db: Session, raw_token: str | None):
    if not raw_token:
        return None
    # The browser keeps the opaque token; only its digest is stored server-side.
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    session = db.query(models.UserSession).filter(models.UserSession.token_hash == token_hash).first()
    if not session:
        return None
    expires_at = session.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at <= datetime.now(timezone.utc):
        db.delete(session)
        db.commit()
        return None
    return db.get(models.User, session.user_id)


def issue_session(db: Session, user: models.User, client_host: str = "") -> str:
    raw_token = secrets.token_urlsafe(TOKEN_BYTES)
    session = models.UserSession(
        user_id=user.id,
        token_hash=hashlib.sha256(raw_token.encode("utf-8")).hexdigest(),
        expires_at=datetime.now(timezone.utc) + timedelta(hours=SESSION_HOURS),
        client_host=client_host or "",
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return raw_token


def revoke_session(db: Session, raw_token: str | None):
    if not raw_token:
        return
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    db.query(models.UserSession).filter(models.UserSession.token_hash == token_hash).delete()
    db.commit()


from fastapi import Depends, HTTPException, Request

from .db import get_db


def _bearer_token(request: Request) -> str | None:
    header = request.headers.get("Authorization", "")
    if header.lower().startswith("bearer "):
        return header.split(" ", 1)[1].strip()
    return None


def get_current_user(request: Request, db: Session = Depends(get_db)):  # type: ignore[name-defined]
    return get_user_by_token(db, _bearer_token(request))


def require_user(user=Depends(get_current_user)):
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user


def require_admin(user=Depends(require_user)):
    if not getattr(user, "is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
