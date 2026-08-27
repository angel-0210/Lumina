-- Migration 0001: add a human-friendly title to learning_sessions.
--
-- Justification (additive, backward-compatible):
--   The frontend renders a "topic"/"lesson" with a display name. A
--   learning_session is the backing entity for both, but the base schema has no
--   title column, so the name would otherwise have to be derived from the
--   document every time. This nullable column lets us persist the AI-generated
--   lesson title (falling back to the document title when NULL) without any
--   change to existing rows or behaviour.
--
-- Safe to run more than once (guarded by IF NOT EXISTS).

ALTER TABLE public.learning_sessions
    ADD COLUMN IF NOT EXISTS title TEXT;

COMMENT ON COLUMN public.learning_sessions.title IS
    'Optional display title for the topic/lesson; NULL falls back to the document title.';
