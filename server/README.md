# Lumina Backend Service

FastAPI service powering the Lumina AI learning platform. Handles Supabase GoTrue authentication, document RAG ingestion, Explore grounded Q&A, lesson scene generation, Socratic Crucible assessments, and mastery metrics.

## Requirements & Setup

1. **Python version**: Python 3.10+ is required.
2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```
3. **Configure environment**:
   Copy `.env.template` to `.env` and fill in the required credentials:
   - `DATABASE_URL`: PostgreSQL connection string (Supabase).
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET`: Credentials for authentication and JWT parsing.
   - `GEMINI_API_KEY`: API key for Gemini models (generating text, embedding chunks, grading).
   - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`: Credentials for Cloudinary (where uploaded PDF/markdown bytes and generated assets are saved).

## Database Migrations

Lumina uses SQLAlchemy Core. To apply SQL migrations to your database:
Run the SQL files located in the `migrations/` directory against your database in sequential order (0001, 0002, 0003, 0004).

## Running the Server Locally

Start the local development server using uvicorn:
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
The API documentation will be available at [http://localhost:8000/docs](http://localhost:8000/docs).

## Running Tests

Lumina uses `pytest` for unit, integration, and security testing.
To execute the test suite:
```bash
python -m pytest tests/ -v
```
Tests automatically run in a self-contained environment using an in-memory SQLite database and mock integrations.
