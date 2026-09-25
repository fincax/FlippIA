-- Runs once on first container start. Creates the test database and extensions.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- pgvector is not bundled in postgis/postgis; install it if the image provides it.
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgvector not available in this image; semantic retrieval falls back to lexical search';
END $$;
CREATE DATABASE flippia_test OWNER flippia;
