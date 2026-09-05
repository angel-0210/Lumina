-- Migration 0009: Add notification preferences column to profiles

DO $$ BEGIN
    ALTER TABLE profiles ADD COLUMN notification_preferences JSONB DEFAULT '{"daily_mastery": true, "reminders": true, "streaks": true}'::jsonb NOT NULL;
EXCEPTION
    WHEN duplicate_column THEN null;
END $$;
