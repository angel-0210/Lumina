import pytest
import os
import tempfile
import glob
from unittest.mock import MagicMock, patch
import run_migrations

def test_run_migrations_skips_comment_only_sql(tmp_path):
    # Create temp migration files
    mig1 = tmp_path / "0001_valid.sql"
    mig1.write_text("-- Valid migration\nSELECT 1;", encoding="utf-8")
    
    mig2 = tmp_path / "0002_comments_only.sql"
    mig2.write_text("-- Migration 0008: Cleanup completed. Deprecated to prevent wiping user data.\n", encoding="utf-8")

    mock_conn = MagicMock()
    mock_begin = MagicMock()
    mock_begin.__enter__.return_value = mock_conn

    with patch.object(run_migrations.os.path, "dirname", return_value=str(tmp_path)):
        with patch.object(run_migrations.engine, "begin", return_value=mock_begin):
            # Point migrations_dir to tmp_path
            with patch("glob.glob", return_value=sorted([str(mig1), str(mig2)])):
                run_migrations.run_migrations()

    # Verify conn.execute was called only once (for mig1)
    assert mock_conn.execute.call_count == 1
