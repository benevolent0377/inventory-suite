import os

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

DB_PATH = os.getenv(
    "INVENTORY_DB_PATH",
    os.path.join(os.path.dirname(__file__), "..", "data", "inventory.db"),
)
os.makedirs(os.path.dirname(os.path.abspath(DB_PATH)), exist_ok=True)

DB_URI = os.path.abspath(DB_PATH).replace("?", "%3f").replace("#", "%23")

engine = create_engine(
    f"sqlite:///file:{DB_URI}?mode=rwc&uri=true",
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
