import os
import pytest
from fastapi.testclient import TestClient
import jwt
from sqlalchemy import create_engine, text
from sqlalchemy.pool import StaticPool
import uuid
import datetime

# 1. Force the settings to use test environment variables before anything imports them.
os.environ["APP_ENV"] = "test"
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["SUPABASE_JWT_SECRET"] = "testsecret_must_be_long_enough_to_be_secure_32_bytes_or_more"
os.environ["GEMINI_API_KEY"] = "mock_key"
os.environ["CLOUDINARY_CLOUD_NAME"] = "mock_cloud"
os.environ["CLOUDINARY_API_KEY"] = "mock_key"
os.environ["CLOUDINARY_API_SECRET"] = "mock_secret"
os.environ["RATE_LIMIT_ENABLED"] = "False"

# 2. Re-create the engine for tests with StaticPool so in-memory SQLite connection is shared.
test_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

from sqlalchemy import event

@event.listens_for(test_engine, "connect")
def register_sqlite_functions(dbapi_connection, connection_record):
    dbapi_connection.create_function(
        "now", 0, lambda: datetime.datetime.now(datetime.timezone.utc).isoformat()
    )
    dbapi_connection.create_function(
        "gen_random_uuid", 0, lambda: str(uuid.uuid4())
    )

# 3. Override PostgreSQL specific types for SQLite in-memory schema creation before importing tables
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.dialects.postgresql import JSONB, UUID, ENUM

@compiles(JSONB, "sqlite")
def compile_jsonb_sqlite(type_, compiler, **kw):
    return "TEXT"

@compiles(UUID, "sqlite")
def compile_uuid_sqlite(type_, compiler, **kw):
    return "TEXT"

@compiles(ENUM, "sqlite")
def compile_enum_sqlite(type_, compiler, **kw):
    return "TEXT"

# Patch PostgreSQL UUID type handling to allow string UUIDs on SQLite
original_bind_processor = UUID.bind_processor

def patched_bind_processor(self, dialect):
    if dialect.name == "sqlite":
        return lambda value: str(value) if value is not None else None
    return original_bind_processor(self, dialect)

UUID.bind_processor = patched_bind_processor

# 4. Patch the core.database engine and dispose_engine before importing any app modules.
import app.core.database
app.core.database.engine = test_engine
app.core.database.dispose_engine = lambda: None

# 5. Now import the rest of the application modules safely.
from app.core.config import settings
from app.core.database import get_db, engine
from app.models.tables import metadata, profiles
from app.main import create_app

@pytest.fixture(scope="session", autouse=True)
def setup_database():
    """Create in-memory SQLite schema."""
    metadata.create_all(test_engine)
    yield
    metadata.drop_all(test_engine)

@pytest.fixture
def db():
    """Yield an auto-committing database connection for unit tests."""
    conn = test_engine.connect().execution_options(isolation_level="AUTOCOMMIT")
    try:
        yield conn
    finally:
        conn.close()

@pytest.fixture(autouse=True)
def clean_database(db):
    """Clean all database tables after each test to ensure isolation."""
    yield
    db.execute(text("PRAGMA foreign_keys = OFF"))
    for table in reversed(metadata.sorted_tables):
        db.execute(table.delete())
    db.execute(text("PRAGMA foreign_keys = ON"))
    db.commit()

@pytest.fixture
def client(db):
    """Yield a FastAPI TestClient."""
    app = create_app()
    with TestClient(app) as test_client:
        yield test_client

# ─── Helpers to generate valid test JWTs ──────────────────────────────────────

USER_ID_A = "11111111-1111-1111-1111-111111111111"
USER_ID_B = "22222222-2222-2222-2222-222222222222"

def generate_jwt(user_id: str, email: str, role: str = "authenticated") -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "aud": settings.supabase_jwt_aud,
        "app_metadata": {
            "role": role,
            "roles": [role]
        }
    }
    return jwt.encode(payload, settings.supabase_jwt_secret, algorithm="HS256")

@pytest.fixture
def auth_headers(db):
    """Generate headers for User A (Dr. Evelyn Vance) and pre-populate their profile in DB."""
    from sqlalchemy import select
    email = "evelyn@lumina.ai"
    token = generate_jwt(USER_ID_A, email)
    
    # Pre-populate the user profile so AI rate limit works
    exists = db.execute(select(profiles.c.id).where(profiles.c.id == USER_ID_A)).first()
    if not exists:
        db.execute(
            profiles.insert().values(
                id=USER_ID_A,
                name="Dr. Evelyn Vance",
                email=email,
                subscription="pro"
            )
        )
    return {"Authorization": f"Bearer {token}"}

@pytest.fixture
def auth_headers_other(db):
    """Generate headers for User B and pre-populate their profile in DB."""
    from sqlalchemy import select
    email = "other@lumina.ai"
    token = generate_jwt(USER_ID_B, email)
    
    exists = db.execute(select(profiles.c.id).where(profiles.c.id == USER_ID_B)).first()
    if not exists:
        db.execute(
            profiles.insert().values(
                id=USER_ID_B,
                name="Other User",
                email=email,
                subscription="free"
            )
        )
    return {"Authorization": f"Bearer {token}"}
