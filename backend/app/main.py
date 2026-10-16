import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.staticfiles import StaticFiles
from starlette.responses import FileResponse

from . import models  # noqa: F401
from .db import Base, engine, ensure_schema, SessionLocal, set_demo_db, reset_demo_db, get_engine, DEMO_DB_PATH
from .routers import register_routers
from . import models
from .auth import generate_passkey, get_user_by_token, hash_passkey
from datetime import datetime, timezone

Base.metadata.create_all(bind=engine)
ensure_schema(engine)
if os.path.exists(DEMO_DB_PATH):
    token = set_demo_db(True)
    try:
        demo_engine = get_engine()
        Base.metadata.create_all(bind=demo_engine)
        ensure_schema(demo_engine)
    finally:
        reset_demo_db(token)


def _bootstrap_admin(demo=False, passkey=None):
    token = set_demo_db(demo)
    try:
        db = SessionLocal()
        try:
            admin = db.query(models.User).filter(models.User.username == "admin").first()
            if not admin:
                admin = models.User(name="Administrator", username="admin", email="", is_admin=True)
                db.add(admin)
                db.commit()
                db.refresh(admin)
            key = passkey or generate_passkey(14)
            admin.passkey_hash = hash_passkey(key)
            admin.passkey_updated_at = datetime.now(timezone.utc)
            db.commit()
            if not demo:
                print(f"[Inventory Suite] admin passkey: {key}  (username: admin)", flush=True)
            return key
        finally:
            db.close()
    finally:
        reset_demo_db(token)


admin_key = _bootstrap_admin(False)
import os
if os.path.exists(DEMO_DB_PATH):
    _bootstrap_admin(True, passkey=admin_key)

app = FastAPI(title="Inventory Suite API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_routers(app)


@app.middleware("http")
async def require_auth_and_audit(request, call_next):
    _demo_context_token = set_demo_db(request.headers.get("X-Demo-DB", "").lower() == "true")
    import re
    from .audit import log_activity

    path = request.url.path
    method = request.method.upper()
    public_auth = {"/api/auth/register", "/api/auth/login"}
    if method in {"POST", "PUT", "PATCH", "DELETE"} and path.startswith("/api/") and path not in public_auth:
        token = None
        auth_header = request.headers.get("Authorization", "")
        if auth_header.lower().startswith("bearer "):
            token = auth_header.split(" ", 1)[1].strip()
        auth_db = SessionLocal()
        try:
            if get_user_by_token(auth_db, token) is None:
                auth_db.close()
                from fastapi.responses import JSONResponse
                reset_demo_db(_demo_context_token)
                return JSONResponse(status_code=401, content={"detail": "Authentication required"})
        finally:
            auth_db.close()
    response = await call_next(request)
    path = request.url.path
    method = request.method.upper()
    write_methods = {"POST", "PUT", "PATCH", "DELETE"}
    public_auth = {"/api/auth/register", "/api/auth/login"}
    if (method in write_methods and path.startswith("/api/")
            and path not in public_auth):
        db = SessionLocal()
        try:
            token = None
            auth_header = request.headers.get("Authorization", "")
            if auth_header.lower().startswith("bearer "):
                token = auth_header.split(" ", 1)[1].strip()
            user = get_user_by_token(db, token)
            if user is None:
                # Authentication should have been rejected by endpoint; do not audit anonymous failed writes.
                pass
            else:
                status = "success" if response.status_code < 400 else "failure"
                parts = [part for part in path.split("/") if part]
                entity = parts[2] if len(parts) > 2 else (parts[1] if len(parts) > 1 else "app")
                log_activity(
                    db,
                    f"{method} {path}",
                    user=user,
                    entity_type=entity,
                    detail="",
                    status=status,
                    client_host=request.client.host if request.client else "",
                )
                db.commit()
        except Exception:
            db.rollback()
        finally:
            db.close()
    reset_demo_db(_demo_context_token)
    return response

frontend_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"


class SPAStaticFiles(StaticFiles):
    async def get_response(self, path, scope):
        response = await super().get_response(path, scope)
        if response.status_code == 404 and frontend_dist.exists():
            return FileResponse(frontend_dist / "index.html")
        return response


if frontend_dist.exists():
    @app.get("/{full_path:path}")
    async def spa_fallback(full_path: str):
        requested = frontend_dist / full_path
        if requested.is_file():
            return FileResponse(requested)
        return FileResponse(frontend_dist / "index.html")

if __name__ == "__main__":
    import uvicorn

    from .certs import ensure_certificate

    certfile, keyfile = ensure_certificate()
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        ssl_certfile=certfile,
        ssl_keyfile=keyfile,
    )
