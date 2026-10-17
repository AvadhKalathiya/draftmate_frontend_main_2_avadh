import logging
import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

logger = logging.getLogger(__name__)

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), '.env'))

POSTGRES_USER = os.getenv("POSTGRES_USER", "postgres")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD") or os.getenv("PSQL_PASSWD") or ""
POSTGRES_HOST = os.getenv("POSTGRES_HOST", "db")
POSTGRES_PORT = os.getenv("POSTGRES_PORT", "5432")
POSTGRES_DB = os.getenv("POSTGRES_DB", "postgres")

POSTGRES_DSN = os.getenv("POSTGRES_DSN") or os.getenv("DATABASE_URL") or f"postgresql://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"


def _postgres_driver_url(dsn: str) -> str:
    """Use psycopg2. SQLAlchemy otherwise selects psycopg (v3), which is not installed."""
    if dsn.startswith("postgresql+psycopg2://") or dsn.startswith("sqlite"):
        return dsn
    if dsn.startswith("postgresql://"):
        return "postgresql+psycopg2://" + dsn[len("postgresql://"):]
    if dsn.startswith("postgres://"):
        return "postgresql+psycopg2://" + dsn[len("postgres://"):]
    return dsn


is_production = os.getenv("ENVIRONMENT", "development").strip().lower() == "production"

try:
    engine = create_engine(_postgres_driver_url(POSTGRES_DSN), pool_pre_ping=True)
    if is_production:
        # In production, verify connection at startup and NEVER fall back to SQLite
        with engine.connect() as _test_conn:
            _test_conn.execute(text("SELECT 1"))
        logger.info(f"[Library DB] Connected to PostgreSQL at {POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}")
except Exception as exc:
    if is_production:
        logger.critical(
            f"[Library DB] CRITICAL: PostgreSQL connection failed in PRODUCTION!\n"
            f"  Host: {POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}\n"
            f"  Error: {exc}\n"
            f"  SQLite fallback is DISABLED in production to prevent silent data loss.\n"
            f"  Fix POSTGRES_DSN / POSTGRES_HOST in ECS task definition env vars."
        )
        raise RuntimeError(
            f"Library Service cannot start: PostgreSQL unavailable in production ({POSTGRES_HOST}). "
            f"SQLite fallback is intentionally disabled."
        ) from exc
    # Fallback to local SQLite if PostgreSQL container is unreachable in development
    sqlite_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "login_db", "auth_fallback.db")
    engine = create_engine(f"sqlite:///{sqlite_path}", connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
