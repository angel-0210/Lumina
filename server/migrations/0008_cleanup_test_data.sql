-- Migration 0008: Safe cleanup of stale test/development records in dependency order.

DELETE FROM public.audit_logs;
DELETE FROM public.message_retrievals;
DELETE FROM public.session_messages;
DELETE FROM public.tutorial_scenes;
DELETE FROM public.ai_generation_jobs;
DELETE FROM public.concept_scores;
DELETE FROM public.assessment_sessions;
DELETE FROM public.concepts;
DELETE FROM public.topics;
DELETE FROM public.learning_sessions;
DELETE FROM public.media_assets;
DELETE FROM public.document_chunks;
DELETE FROM public.document_processing_jobs;
DELETE FROM public.documents;
DELETE FROM public.profiles;
