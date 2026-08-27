import os
import glob
from sqlalchemy import text
from app.core.database import engine

def run_migrations():
    migrations_dir = os.path.join(os.path.dirname(__file__), "migrations")
    migration_files = sorted(glob.glob(os.path.join(migrations_dir, "*.sql")))
    
    print(f"Found {len(migration_files)} migration files.")
    
    with engine.begin() as conn:
        for filepath in migration_files:
            filename = os.path.basename(filepath)
            print(f"Applying migration: {filename}...")
            with open(filepath, "r", encoding="utf-8") as f:
                sql = f.read()
            
            try:
                conn.execute(text(sql))
                print(f"Migration {filename} applied successfully.")
            except Exception as e:
                print(f"Error applying {filename}: {e}")
                raise e

if __name__ == "__main__":
    run_migrations()
