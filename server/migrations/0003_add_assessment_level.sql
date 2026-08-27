-- Migration 0003: persist the chosen Concept Crucible difficulty.
--
-- Justification (additive, backward-compatible):
--   A Crucible assessment is multi-turn: the first question and every follow-up
--   are generated at a chosen difficulty (Curious / Critical / Crucible, which
--   maps to the existing `level` enum: Curious / Student / Expert). Difficulty is
--   selected once at start, but follow-up questions are produced in later requests
--   that only carry the student's answer. Without persisting the difficulty, the
--   backend would lose it after the first turn and every follow-up would drift to
--   a default level. This column stores it so the whole assessment stays at the
--   chosen difficulty. A DEFAULT backfills existing rows safely.
--
-- Depends on: assessment_sessions, level enum (base schema).

ALTER TABLE public.assessment_sessions
    ADD COLUMN IF NOT EXISTS level level NOT NULL DEFAULT 'Curious';
