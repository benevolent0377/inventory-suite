import os
from contextvars import ContextVar

from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import NullPool

DB_PATH = os.getenv(
    "INVENTORY_DB_PATH",
    os.path.join(os.path.dirname(__file__), "..", "data", "inventory.db"),
)
os.makedirs(os.path.dirname(os.path.abspath(DB_PATH)), exist_ok=True)

DB_URI = os.path.abspath(DB_PATH).replace("?", "%3f").replace("#", "%23")

NORMAL_DB_PATH = DB_PATH
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DEMO_DB_PATH = os.path.join(REPO_ROOT, "demo", "inventory.db")

# A ContextVar keeps demo-vs-normal routing isolated between concurrent requests.
_demo_db_var = ContextVar("inventory_demo_db", default=False)
_engines = {}


def _create_engine(path):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    abs_path = os.path.abspath(path)
    uri = abs_path.replace("?", "%3f").replace("#", "%23")
    engine = create_engine(
        f"sqlite:///file:{uri}?mode=rwc&uri=true",
        connect_args={"check_same_thread": False, "timeout": 30},
        poolclass=NullPool,
    )

    @event.listens_for(engine, "connect")
    def _enable_sqlite_concurrency(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=30000")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()

    return engine


def get_engine():
    # Cache engines by path, while resolving the path from this request's context.
    if _demo_db_var.get() and os.path.exists(DEMO_DB_PATH):
        path = DEMO_DB_PATH
    else:
        path = NORMAL_DB_PATH
    if path not in _engines:
        _engines[path] = _create_engine(path)
    return _engines[path]


def SessionLocal():
    from sqlalchemy.orm import sessionmaker

    return sessionmaker(autocommit=False, autoflush=False, bind=get_engine())()


def set_demo_db(enabled: bool):
    return _demo_db_var.set(bool(enabled))


def reset_demo_db(token) -> None:
    _demo_db_var.reset(token)


def demo_db_enabled() -> bool:
    return _demo_db_var.get()


Base = declarative_base()
engine = get_engine()  # default (normal) engine for startup/schema compatibility


def ensure_schema(engine=None):
    # This compatibility pass is intentionally additive; complex data migrations
    # should be handled explicitly rather than silently rewritten at startup.
    from sqlalchemy import inspect, text

    if engine is None:
        engine = globals()["engine"]
    inspector = inspect(engine)
    with engine.begin() as connection:
        for table in Base.metadata.sorted_tables:
            if not inspector.has_table(table.name):
                continue
            existing = {column["name"] for column in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name in existing:
                    continue
                raw_type = column.type.compile(dialect=engine.dialect)
                connection.execute(
                    text(f'ALTER TABLE "{table.name}" ADD COLUMN "{column.name}" {raw_type}')
                )
    # Backfill values required by application code for older databases.
    if inspector.has_table("products"):
        with engine.begin() as connection:
            columns = {column["name"] for column in inspector.get_columns("products")}
            if "description" in columns:
                connection.execute(text("UPDATE products SET description = '' WHERE description IS NULL"))
            if "vendor_item_id" in columns:
                connection.execute(text("UPDATE products SET vendor_item_id = '' WHERE vendor_item_id IS NULL"))
    if inspector.has_table("users"):
        with engine.begin() as connection:
            columns = {column["name"] for column in inspector.get_columns("users")}
            if "username" in columns:
                connection.execute(text("UPDATE users SET username = name WHERE username IS NULL OR username = ''"))
            if "theme" in columns:
                connection.execute(text("UPDATE users SET theme = 'dark' WHERE theme IS NULL OR theme = ''"))
            if "email" in columns:
                connection.execute(text("UPDATE users SET email = '' WHERE email IS NULL"))
            if "is_admin" in columns:
                connection.execute(text("UPDATE users SET is_admin = 0 WHERE is_admin IS NULL"))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
