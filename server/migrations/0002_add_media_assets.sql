-- Migration 0002: persist AI-generated media (Cloudinary-hosted images/videos).
--
-- Justification (additive, backward-compatible):
--   The product's "full breadth" scope includes AI image generation and VEO
--   video generation. Generated assets are hosted on Cloudinary, but the base
--   schema has no table to record them, so a completed generation would have
--   nowhere durable to live. This table stores only non-secret, client-safe
--   metadata (public_id + secure URL + dimensions); Cloudinary credentials never
--   touch the database. An optional learning_session_id ties an asset to a
--   lesson/topic when it was generated in that context.
--
-- Depends on: profiles, learning_sessions (base schema).

CREATE TABLE IF NOT EXISTS public.media_assets (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    learning_session_id  UUID REFERENCES public.learning_sessions(id) ON DELETE SET NULL,
    kind                 TEXT NOT NULL DEFAULT 'image',       -- 'image' | 'video'
    provider             TEXT NOT NULL DEFAULT 'cloudinary',
    resource_type        TEXT NOT NULL DEFAULT 'image',       -- cloudinary resource_type
    public_id            TEXT NOT NULL,
    url                  TEXT NOT NULL,
    format               TEXT,
    width                INTEGER,
    height               INTEGER,
    duration             DOUBLE PRECISION,
    bytes                INTEGER,
    prompt               TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS media_assets_user_idx
    ON public.media_assets (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS media_assets_session_idx
    ON public.media_assets (learning_session_id);

-- Row Level Security (defense-in-depth; the backend also filters by user_id).
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'media_assets'
          AND policyname = 'media_assets_owner'
    ) THEN
        CREATE POLICY media_assets_owner ON public.media_assets
            FOR ALL
            USING (auth.uid() = user_id)
            WITH CHECK (auth.uid() = user_id);
    END IF;
END $$;
