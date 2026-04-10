-- Migration: Create llm_enrichment_cache table
-- Description: Stores results of LLM enrichment to avoid redundant API calls and costs.
-- Cache Key: SHA-256 hash of (normalized_title + normalized_description + is_domestic + prompt_hash + LLM_CACHE_VERSION)

CREATE TABLE IF NOT EXISTS llm_enrichment_cache (
    cache_key TEXT PRIMARY KEY,
    result JSONB NOT NULL,
    model_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for maintenance/cleanup
CREATE INDEX IF NOT EXISTS idx_llm_cache_created_at ON llm_enrichment_cache(created_at);
