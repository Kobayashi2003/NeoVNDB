-- Translations of the text vndb writes in English.
--
-- This is the one thing in this database that does not come from a dump, so it
-- lives outside the generation schemas: an import creates `vndb_next` and
-- renames it over `vndb`, and never touches anything else. A re-import leaves
-- this schema exactly as it was, which is the whole point -- the corpus took a
-- long time to build and must not depend on a mirror that is rebuilt weekly.
--
-- Everything here is keyed by the source *text*, not by the id of the thing it
-- belongs to, for the same reason. A tag keeps its id across imports, but so
-- does its name, and keying by content means a new dump needs no re-resolution
-- pass at all: the text either still matches or it does not.
--
-- Idempotent, and applied on startup.

CREATE SCHEMA IF NOT EXISTS trans;

-- Short names: tag and trait titles. Looked up by a normalised form of the
-- source -- lower-cased with runs of whitespace collapsed -- so that a name
-- differing only in case or spacing still finds its translation.
CREATE TABLE IF NOT EXISTS trans.terms (
    target_lang text NOT NULL,
    source_key  text NOT NULL,          -- normalised source; see trans.Key
    source_text text NOT NULL,          -- the form it was seeded from
    target_text text NOT NULL,
    -- Where the row came from: 'tag' | 'trait'. Lets a re-seed replace one
    -- provenance without touching the others.
    category text,
    PRIMARY KEY (target_lang, source_key)
);

-- Long text: tag and trait descriptions. Too long to index whole, so the key is
-- a hash of the same normalised form. An edited description simply misses,
-- which is the honest answer -- a stale translation of text that has changed is
-- worse than the English.
CREATE TABLE IF NOT EXISTS trans.passages (
    target_lang text  NOT NULL,
    source_hash bytea NOT NULL,         -- sha256 of the normalised source
    source_text text  NOT NULL,
    target_text text  NOT NULL,
    entity_type text,
    PRIMARY KEY (target_lang, source_hash)
);
