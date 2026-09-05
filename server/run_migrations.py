import os
import glob
import re
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
            
            # Check if SQL file contains any executable statements (not just comments/whitespace)
            clean_sql = re.sub(r'/\*.*?\*/', '', sql, flags=re.DOTALL)
            clean_sql = re.sub(r'--.*', '', clean_sql)
            if not clean_sql.strip():
                print(f"Migration {filename} has no executable statements, skipping.")
                continue
            
            try:
                conn.execute(text(sql))
                print(f"Migration {filename} applied successfully.")
            except Exception as e:
                print(f"Error applying {filename}: {e}")
                raise e

if __name__ == "__main__":
    run_migrations()
