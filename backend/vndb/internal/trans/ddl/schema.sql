-- Translations of vndb's English text. Outside the generation schemas so
-- imports never touch it, and keyed by source text so a new dump needs no
-- re-resolution. Idempotent, applied on startup.

CREATE SCHEMA IF NOT EXISTS trans;

-- Tag and trait names, keyed case- and whitespace-insensitively.
CREATE TABLE IF NOT EXISTS trans.terms (
    target_lang text NOT NULL,
    source_key  text NOT NULL,          -- normalised source; see trans.Key
    source_text text NOT NULL,          -- the form it was seeded from
    target_text text NOT NULL,
    -- 'tag' | 'trait', so a re-seed can replace one provenance.
    category text,
    PRIMARY KEY (target_lang, source_key)
);

-- Descriptions, keyed by hash. An edited description misses on purpose: a
-- stale translation is worse than the English.
CREATE TABLE IF NOT EXISTS trans.passages (
    target_lang text  NOT NULL,
    source_hash bytea NOT NULL,         -- sha256 of the normalised source
    source_text text  NOT NULL,
    target_text text  NOT NULL,
    entity_type text,
    PRIMARY KEY (target_lang, source_hash)
);

-- Bumped by every seed and read into every response cache key, so a changed
-- translation is served at once instead of when the cached page expires.
CREATE TABLE IF NOT EXISTS trans.revision (
    one boolean PRIMARY KEY DEFAULT true CHECK (one),
    n   bigint  NOT NULL DEFAULT 0
);
INSERT INTO trans.revision DEFAULT VALUES ON CONFLICT DO NOTHING;
