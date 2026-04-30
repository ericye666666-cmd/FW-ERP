from typing import Any, Optional

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import sessionmaker

from app.core.config import settings


def normalize_database_url(database_url: Optional[str]) -> Optional[str]:
    raw_url = str(database_url or "").strip()
    if not raw_url:
        return None
    if raw_url.startswith("postgresql://"):
        return raw_url.replace("postgresql://", "postgresql+psycopg://", 1)
    return raw_url


def create_database_engine(database_url: Optional[str] = None) -> Optional[Engine]:
    normalized_url = normalize_database_url(database_url or settings.database_url)
    if not normalized_url:
        return None
    return create_engine(normalized_url, pool_pre_ping=True, future=True)


def create_session_factory(database_url: Optional[str] = None) -> Optional[sessionmaker]:
    engine = create_database_engine(database_url=database_url)
    if engine is None:
        return None
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def check_database_connection(database_url: Optional[str] = None) -> dict[str, Any]:
    normalized_url = normalize_database_url(database_url or settings.database_url)
    if not normalized_url:
        return {
            "enabled": False,
            "ok": False,
            "status": "not_configured",
            "message": "DATABASE_URL is not configured; runtime_json mode can continue without database.",
        }
    try:
        engine = create_database_engine(normalized_url)
        if engine is None:
            raise RuntimeError("database engine was not created")
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return {
            "enabled": True,
            "ok": True,
            "status": "connected",
            "message": "Database connection check succeeded.",
        }
    except (RuntimeError, SQLAlchemyError) as exc:
        return {
            "enabled": True,
            "ok": False,
            "status": "error",
            "message": str(exc),
        }
