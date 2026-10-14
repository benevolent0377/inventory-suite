import os

from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import NullPool

DB_PATH = os.getenv(
    "INVENTORY_DB_PATH",
    os.path.join(os.path.dirname(__file__), "..", "data", "inventory.db"),
)
os.makedirs(os.path.dirname(os.path.abspath(DB_PATH)), exist_ok=True)

DB_URI = os.path.abspath(DB_PATH).replace("?", "%3f").replace("#", "%23")

engine = create_engine(
    f"sqlite:///file:{DB_URI}?mode=rwc&uri=true",
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

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def ensure_schema():
    from sqlalchemy import inspect, text

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
