import os
import logging
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), '.env'))

logger = logging.getLogger(__name__)

POSTGRES_USER = os.getenv("POSTGRES_USER", "postgres")
POSTGRES_PASSWORD = os.getenv("POSTGRES_PASSWORD") or os.getenv("PSQL_PASSWD") or ""
POSTGRES_HOST = os.getenv("POSTGRES_HOST", "db")
POSTGRES_PORT = os.getenv("POSTGRES_PORT", "5432")
POSTGRES_DB = os.getenv("POSTGRES_DB", "postgres")

POSTGRES_DSN = os.getenv("POSTGRES_DSN") or os.getenv("DATABASE_URL")
if POSTGRES_DSN and POSTGRES_DSN.startswith("postgresql://"):
    POSTGRES_DSN = POSTGRES_DSN.replace("postgresql://", "postgresql+psycopg2://", 1)
elif not POSTGRES_DSN:
    POSTGRES_DSN = f"postgresql+psycopg2://{POSTGRES_USER}:{POSTGRES_PASSWORD}@{POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}"

# ── Always use PostgreSQL (RDS) — SQLite fallback is REMOVED ──────────────────
# The Library Service must NEVER fall back to SQLite.
# SQLite is a local file inside the container — it gets wiped on every ECS restart
# and is not shared between container instances. All Library case/client/hearing
# data would be silently lost on every deploy.
#
# If this block raises, fix the POSTGRES_DSN / POSTGRES_HOST env vars.
try:
    engine = create_engine(
        POSTGRES_DSN,
        pool_pre_ping=True,          # auto-reconnect on dropped connections
        pool_size=5,
        max_overflow=10,
        connect_args={"connect_timeout": 10},
    )
    # Verify connection is actually reachable at startup
    with engine.connect() as _test_conn:
        _test_conn.execute(text("SELECT 1"))
    logger.info(f"[Library DB] Connected to PostgreSQL at {POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}")
except Exception as db_err:
    # DO NOT fall back to SQLite — surface the error clearly
    logger.critical(
        f"[Library DB] CRITICAL: Cannot connect to PostgreSQL RDS!\n"
        f"  DSN host: {POSTGRES_HOST}:{POSTGRES_PORT}/{POSTGRES_DB}\n"
        f"  Error: {db_err}\n"
        f"  Fix: Check POSTGRES_DSN / POSTGRES_HOST env vars in ECS task definition.\n"
        f"  SQLite fallback has been intentionally REMOVED to prevent silent data loss."
    )
    raise RuntimeError(
        f"Library Service cannot start: PostgreSQL unavailable ({POSTGRES_HOST}). "
        f"SQLite fallback removed — fix your database connection."
    ) from db_err

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
