-- Migration 0004: Add file_public_id to documents
--
-- Adds a nullable TEXT column to store the Cloudinary public_id for each
-- uploaded document. The file_key column continues to store the Cloudinary
-- secure_url (used by the ingestion pipeline to download raw bytes).
-- file_public_id is used to delete the asset from Cloudinary when a document
-- is hard-deleted or soft-deleted with cleanup.
--
-- Existing rows (uploaded before this migration) have no public_id and the
-- column is intentionally nullable so those rows remain valid.

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS file_public_id TEXT;

COMMENT ON COLUMN documents.file_public_id IS
  'Cloudinary public_id for the stored document file (resource_type=raw). '
  'Used for deletion. Nullable for documents uploaded before Cloudinary storage was enabled.';
