-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

-- Drop old tables cascade if they exist to apply Lumina V3 schema
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS concept_scores CASCADE;
DROP TABLE IF EXISTS assessment_sessions CASCADE;
DROP TABLE IF EXISTS ai_generation_jobs CASCADE;
DROP TABLE IF EXISTS message_retrievals CASCADE;
DROP TABLE IF EXISTS session_messages CASCADE;
DROP TABLE IF EXISTS tutorial_scenes CASCADE;
DROP TABLE IF EXISTS learning_sessions CASCADE;
DROP TABLE IF EXISTS document_chunks CASCADE;
DROP TABLE IF EXISTS document_processing_jobs CASCADE;
DROP TABLE IF EXISTS documents CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- Also clean up legacy placeholder tables if any
DROP TABLE IF EXISTS topics CASCADE;
DROP TABLE IF EXISTS lessons CASCADE;
DROP TABLE IF EXISTS chat_messages CASCADE;
DROP TABLE IF EXISTS crucible_turns CASCADE;
DROP TABLE IF EXISTS crucible_sessions CASCADE;
DROP TABLE IF EXISTS mastery CASCADE;

-- 1. Create Enums with Idempotency Check
DO $$ BEGIN
    CREATE TYPE subscription_tier AS ENUM ('free', 'pro', 'enterprise');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE document_status AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE job_status AS ENUM ('pending', 'processing', 'completed', 'failed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE phase AS ENUM ('learn', 'explore', 'test', 'mastery');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE session_status AS ENUM ('active', 'completed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE level AS ENUM ('Curious', 'Student', 'Expert');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE visual_type AS ENUM ('animation', 'chart', 'diagram', 'code', 'text');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE message_role AS ENUM ('user', 'assistant', 'system');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE message_phase AS ENUM ('question', 'answer', 'insight');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE assessment_status AS ENUM ('started', 'completed');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE ai_job_type AS ENUM ('scene_generation', 'question_generation', 'grading');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE retrieval_method AS ENUM ('keyword', 'vector', 'hybrid');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE audit_action AS ENUM ('insert', 'update', 'delete', 'login', 'logout');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;


-- 2. Create Tables

-- Profiles Table (references Supabase auth.users)
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT,
    email TEXT,
    subscription subscription_tier DEFAULT 'free'::subscription_tier NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    deleted_at TIMESTAMPTZ
);

-- Documents Table
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    file_key TEXT NOT NULL,
    file_public_id TEXT,
    file_type TEXT NOT NULL,
    file_size INTEGER NOT NULL CHECK (file_size > 0),
    chunk_count INTEGER DEFAULT 0 NOT NULL CHECK (chunk_count >= 0),
    status document_status DEFAULT 'pending'::document_status NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    deleted_at TIMESTAMPTZ
);

-- Document Processing Jobs Table
CREATE TABLE document_processing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    status job_status DEFAULT 'pending'::job_status NOT NULL,
    progress_pct INTEGER DEFAULT 0 NOT NULL CHECK (progress_pct BETWEEN 0 AND 100),
    retry_count INTEGER DEFAULT 0 NOT NULL CHECK (retry_count >= 0),
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Document Chunks Table
CREATE TABLE document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    embedding vector(1536), -- 1536 dimensions as per target architecture
    chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
    chunk_hash TEXT NOT NULL,
    token_count INTEGER CHECK (token_count > 0),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT doc_chunk_index_unique UNIQUE (document_id, chunk_index),
    CONSTRAINT doc_chunk_hash_unique UNIQUE (document_id, chunk_hash)
);

-- Learning Sessions Table
CREATE TABLE learning_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    title TEXT,
    status session_status DEFAULT 'active'::session_status NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    deleted_at TIMESTAMPTZ
);

-- Tutorial Scenes Table
CREATE TABLE tutorial_scenes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learning_session_id UUID NOT NULL REFERENCES learning_sessions(id) ON DELETE CASCADE,
    scene_index INTEGER NOT NULL CHECK (scene_index >= 0),
    title TEXT NOT NULL,
    narration TEXT NOT NULL,
    visual_type visual_type NOT NULL,
    visual_data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT scene_index_unique UNIQUE (learning_session_id, scene_index)
);

-- Session Messages Table
CREATE TABLE session_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learning_session_id UUID NOT NULL REFERENCES learning_sessions(id) ON DELETE CASCADE,
    role message_role NOT NULL,
    phase message_phase NOT NULL,
    content TEXT NOT NULL,
    token_count INTEGER CHECK (token_count > 0),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Message Retrievals Table
CREATE TABLE message_retrievals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES session_messages(id) ON DELETE CASCADE,
    chunk_id UUID NOT NULL REFERENCES document_chunks(id) ON DELETE CASCADE,
    rank INTEGER NOT NULL CHECK (rank > 0),
    score FLOAT,
    retrieval_method retrieval_method NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT message_chunk_unique UNIQUE (message_id, chunk_id)
);

-- AI Generation Jobs Table
CREATE TABLE ai_generation_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learning_session_id UUID NOT NULL REFERENCES learning_sessions(id) ON DELETE CASCADE,
    message_id UUID REFERENCES session_messages(id) ON DELETE CASCADE,
    job_type ai_job_type NOT NULL,
    status job_status DEFAULT 'pending'::job_status NOT NULL,
    input_token_count INTEGER DEFAULT 0 NOT NULL CHECK (input_token_count >= 0),
    output_token_count INTEGER DEFAULT 0 NOT NULL CHECK (output_token_count >= 0),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Assessment Sessions Table
CREATE TABLE assessment_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learning_session_id UUID NOT NULL REFERENCES learning_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    status assessment_status DEFAULT 'started'::assessment_status NOT NULL,
    level level NOT NULL DEFAULT 'Curious'::level,
    started_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    completed_at TIMESTAMPTZ,
    CONSTRAINT assessment_learning_session_unique UNIQUE (learning_session_id)
);

-- Concept Scores Table
CREATE TABLE concept_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_session_id UUID NOT NULL REFERENCES assessment_sessions(id) ON DELETE CASCADE,
    concept_name TEXT NOT NULL,
    score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
    mastery INTEGER NOT NULL CHECK (mastery BETWEEN 0 AND 100),
    evidence TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT assessment_concept_unique UNIQUE (assessment_session_id, concept_name)
);

-- Audit Logs Table
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    action audit_action NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    old_state JSONB,
    new_state JSONB,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Media Assets Table
CREATE TABLE media_assets (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    learning_session_id  UUID REFERENCES learning_sessions(id) ON DELETE SET NULL,
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

-- Topics Table
CREATE TABLE topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    order_index INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);

-- Concepts Table
CREATE TABLE concepts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    order_index INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at TIMESTAMPTZ
);


-- 3. Create Indexes

CREATE INDEX IF NOT EXISTS idx_documents_user_id_created_at ON documents(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_documents_user_id_status ON documents(user_id, status);

CREATE INDEX IF NOT EXISTS idx_doc_processing_jobs_doc_id_created_at ON document_processing_jobs(document_id, created_at);
CREATE INDEX IF NOT EXISTS idx_doc_processing_jobs_status_created_at ON document_processing_jobs(status, created_at);

CREATE INDEX IF NOT EXISTS idx_doc_chunks_doc_id_chunk_index ON document_chunks(document_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_doc_chunks_doc_id_chunk_hash ON document_chunks(document_id, chunk_hash);

CREATE INDEX IF NOT EXISTS idx_learning_sessions_user_id_created_at ON learning_sessions(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_learning_sessions_doc_id ON learning_sessions(document_id);
CREATE INDEX IF NOT EXISTS idx_learning_sessions_user_id_status ON learning_sessions(user_id, status);

CREATE INDEX IF NOT EXISTS idx_tutorial_scenes_session_id_scene_index ON tutorial_scenes(learning_session_id, scene_index);

CREATE INDEX IF NOT EXISTS idx_media_assets_user_id ON media_assets (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_assets_session_id ON media_assets (learning_session_id);
CREATE INDEX IF NOT EXISTS idx_topics_document_id ON topics(document_id);
CREATE INDEX IF NOT EXISTS idx_topics_user_id ON topics(user_id);
CREATE INDEX IF NOT EXISTS idx_concepts_topic_id ON concepts(topic_id);
CREATE INDEX IF NOT EXISTS idx_concepts_document_id ON concepts(document_id);

CREATE INDEX IF NOT EXISTS idx_session_messages_session_id_phase_created_at ON session_messages(learning_session_id, phase, created_at);
CREATE INDEX IF NOT EXISTS idx_session_messages_session_id_created_at ON session_messages(learning_session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_message_retrievals_message_id_rank ON message_retrievals(message_id, rank);
CREATE INDEX IF NOT EXISTS idx_message_retrievals_chunk_id ON message_retrievals(chunk_id);

CREATE INDEX IF NOT EXISTS idx_ai_generation_jobs_session_id_created_at ON ai_generation_jobs(learning_session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_generation_jobs_status_created_at ON ai_generation_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_generation_jobs_type_status_created ON ai_generation_jobs(job_type, status, created_at);

CREATE INDEX IF NOT EXISTS idx_assessment_sessions_user_id_started_at ON assessment_sessions(user_id, started_at);

CREATE INDEX IF NOT EXISTS idx_concept_scores_session_id_concept ON concept_scores(assessment_session_id, concept_name);
CREATE INDEX IF NOT EXISTS idx_concept_scores_session_id_score ON concept_scores(assessment_session_id, score);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id_created_at ON audit_logs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_info ON audit_logs(entity_type, entity_id, created_at);

-- Cosine similarity HNSW vector index
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding ON document_chunks USING hnsw (embedding vector_cosine_ops);


-- 4. Row Level Security Configuration

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_processing_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tutorial_scenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_retrievals ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_generation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE concept_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE concepts ENABLE ROW LEVEL SECURITY;

-- Owner Policies
CREATE POLICY "profiles_owner_policy" ON profiles FOR ALL USING (auth.uid() = id);
CREATE POLICY "documents_owner_policy" ON documents FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "doc_processing_jobs_owner_policy" ON document_processing_jobs FOR ALL USING (
    EXISTS (SELECT 1 FROM documents WHERE documents.id = document_id AND documents.user_id = auth.uid())
);
CREATE POLICY "doc_chunks_owner_policy" ON document_chunks FOR ALL USING (
    EXISTS (SELECT 1 FROM documents WHERE documents.id = document_id AND documents.user_id = auth.uid())
);
CREATE POLICY "learning_sessions_owner_policy" ON learning_sessions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "tutorial_scenes_owner_policy" ON tutorial_scenes FOR ALL USING (
    EXISTS (SELECT 1 FROM learning_sessions WHERE learning_sessions.id = learning_session_id AND learning_sessions.user_id = auth.uid())
);
CREATE POLICY "session_messages_owner_policy" ON session_messages FOR ALL USING (
    EXISTS (SELECT 1 FROM learning_sessions WHERE learning_sessions.id = learning_session_id AND learning_sessions.user_id = auth.uid())
);
CREATE POLICY "message_retrievals_owner_policy" ON message_retrievals FOR ALL USING (
    EXISTS (
        SELECT 1 FROM session_messages 
        JOIN learning_sessions ON learning_sessions.id = session_messages.learning_session_id 
        WHERE session_messages.id = message_id AND learning_sessions.user_id = auth.uid()
    )
);
CREATE POLICY "ai_generation_jobs_owner_policy" ON ai_generation_jobs FOR ALL USING (
    EXISTS (SELECT 1 FROM learning_sessions WHERE learning_sessions.id = learning_session_id AND learning_sessions.user_id = auth.uid())
);
CREATE POLICY "assessment_sessions_owner_policy" ON assessment_sessions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "concept_scores_owner_policy" ON concept_scores FOR ALL USING (
    EXISTS (SELECT 1 FROM assessment_sessions WHERE assessment_sessions.id = assessment_session_id AND assessment_sessions.user_id = auth.uid())
);
CREATE POLICY "audit_logs_owner_policy" ON audit_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "media_assets_owner_policy" ON media_assets FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "topics_owner_policy" ON topics FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "concepts_owner_policy" ON concepts FOR ALL USING (auth.uid() = user_id);


-- 5. Triggers and Functions

-- updated_at Trigger Function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_doc_processing_jobs_updated_at BEFORE UPDATE ON document_processing_jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_learning_sessions_updated_at BEFORE UPDATE ON learning_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ai_generation_jobs_updated_at BEFORE UPDATE ON ai_generation_jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_topics_updated_at BEFORE UPDATE ON topics FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_concepts_updated_at BEFORE UPDATE ON concepts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- User Profile creation from auth.users (SECURITY DEFINER with secure search path)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, name, email, subscription)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'name', 'New Learner'),
        NEW.email,
        'free'::subscription_tier
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Denormalized documents.chunk_count consistency sync
CREATE OR REPLACE FUNCTION public.sync_document_chunk_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.documents
        SET chunk_count = chunk_count + 1
        WHERE id = NEW.document_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.documents
        SET chunk_count = GREATEST(0, chunk_count - 1)
        WHERE id = OLD.document_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_document_chunk_change
    AFTER INSERT OR DELETE ON public.document_chunks
    FOR EACH ROW EXECUTE FUNCTION public.sync_document_chunk_count();

-- Generic audit logging function
CREATE OR REPLACE FUNCTION public.process_audit_log()
RETURNS TRIGGER AS $$
DECLARE
    v_user_id UUID;
    v_action audit_action;
    v_old JSONB := NULL;
    v_new JSONB := NULL;
    v_entity_id UUID;
BEGIN
    BEGIN
        v_user_id := auth.uid();
    EXCEPTION WHEN OTHERS THEN
        v_user_id := NULL;
    END;

    IF TG_OP = 'INSERT' THEN
        v_action := 'insert'::audit_action;
        v_new := to_jsonb(NEW);
        v_entity_id := NEW.id;
    ELSIF TG_OP = 'UPDATE' THEN
        v_action := 'update'::audit_action;
        v_old := to_jsonb(OLD);
        v_new := to_jsonb(NEW);
        v_entity_id := NEW.id;
    ELSIF TG_OP = 'DELETE' THEN
        v_action := 'delete'::audit_action;
        v_old := to_jsonb(OLD);
        v_entity_id := OLD.id;
    END IF;

    IF v_user_id IS NULL THEN
        IF TG_OP IN ('INSERT', 'UPDATE') THEN
            IF TG_TABLE_NAME = 'profiles' THEN
                v_user_id := NEW.id;
            ELSIF TG_TABLE_NAME IN ('documents', 'learning_sessions', 'assessment_sessions') THEN
                v_user_id := NEW.user_id;
            END IF;
        ELSE
            IF TG_TABLE_NAME = 'profiles' THEN
                v_user_id := OLD.id;
            ELSIF TG_TABLE_NAME IN ('documents', 'learning_sessions', 'assessment_sessions') THEN
                v_user_id := OLD.user_id;
            END IF;
        END IF;
    END IF;

    INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, old_state, new_state)
    VALUES (v_user_id, v_action, TG_TABLE_NAME, v_entity_id, v_old, v_new);

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER audit_profiles_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();

CREATE TRIGGER audit_documents_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.documents
    FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();

CREATE TRIGGER audit_learning_sessions_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.learning_sessions
    FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();

CREATE TRIGGER audit_assessment_sessions_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.assessment_sessions
    FOR EACH ROW EXECUTE FUNCTION public.process_audit_log();


-- 6. Storage Bucket & Policies Configuration

-- Insert storage bucket for Lumina Documents (private)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'lumina-documents', 
    'lumina-documents', 
    false, 
    52428800, -- 50 MB
    '{application/pdf,text/plain,text/markdown}'
)
ON CONFLICT (id) DO UPDATE 
SET public = false, 
    file_size_limit = 52428800, 
    allowed_mime_types = '{application/pdf,text/plain,text/markdown}';

-- Row Level Security on storage.objects is enabled by default in Supabase

-- Drop existing policies on storage.objects if they exist
DROP POLICY IF EXISTS "select_own_documents" ON storage.objects;
DROP POLICY IF EXISTS "insert_own_documents" ON storage.objects;
DROP POLICY IF EXISTS "update_own_documents" ON storage.objects;
DROP POLICY IF EXISTS "delete_own_documents" ON storage.objects;

-- Select own documents policy
CREATE POLICY "select_own_documents" ON storage.objects
    FOR SELECT
    TO authenticated
    USING (bucket_id = 'lumina-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Insert own documents policy
CREATE POLICY "insert_own_documents" ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'lumina-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Update own documents policy
CREATE POLICY "update_own_documents" ON storage.objects
    FOR UPDATE
    TO authenticated
    USING (bucket_id = 'lumina-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Delete own documents policy
CREATE POLICY "delete_own_documents" ON storage.objects
    FOR DELETE
    TO authenticated
    USING (bucket_id = 'lumina-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
