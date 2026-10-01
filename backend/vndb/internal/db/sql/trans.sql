-- Translations of the English text vndb writes. These are the only queries in
-- this service that read outside a generation schema; see internal/trans.

-- name: TermTranslations :many
SELECT source_key, target_text
  FROM trans.terms
 WHERE target_lang = sqlc.arg(target_lang) AND source_key = ANY(sqlc.arg(keys)::text[]);

-- name: PassageTranslations :many
SELECT source_hash, target_text
  FROM trans.passages
 WHERE target_lang = sqlc.arg(target_lang) AND source_hash = ANY(sqlc.arg(hashes)::bytea[]);

-- name: UpsertTerm :exec
INSERT INTO trans.terms (target_lang, source_key, source_text, target_text, category)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (target_lang, source_key) DO UPDATE
   SET source_text = EXCLUDED.source_text,
       target_text = EXCLUDED.target_text,
       category    = EXCLUDED.category;

-- name: UpsertPassage :exec
INSERT INTO trans.passages (target_lang, source_hash, source_text, target_text, entity_type)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (target_lang, source_hash) DO UPDATE
   SET source_text = EXCLUDED.source_text,
       target_text = EXCLUDED.target_text,
       entity_type = EXCLUDED.entity_type;

-- name: TranslationCounts :one
SELECT (SELECT count(*) FROM trans.terms)    AS terms,
       (SELECT count(*) FROM trans.passages) AS passages;

-- name: TransRevision :one
SELECT n FROM trans.revision;

-- name: BumpTransRevision :exec
UPDATE trans.revision SET n = n + 1;

-- name: DeleteTerm :exec
DELETE FROM trans.terms WHERE target_lang = $1 AND source_key = $2;

-- name: DeletePassage :exec
DELETE FROM trans.passages WHERE target_lang = $1 AND source_hash = $2;

-- name: AllTerms :many
SELECT category, source_text, target_text FROM trans.terms WHERE target_lang = $1;

-- name: AllPassages :many
SELECT entity_type, source_text, target_text FROM trans.passages WHERE target_lang = $1;

-- The text a translator works from: every tag and trait, the most used first.
-- name: TranslatableTags :many
SELECT id, name, description, c_items, ''::text AS group_name
  FROM tags
 ORDER BY c_items DESC, id;

-- name: TranslatableTraits :many
SELECT t.id, t.name, t.description, t.c_items, COALESCE(g.name, '') AS group_name
  FROM traits t
  LEFT JOIN traits g ON g.id = t.gid
 ORDER BY t.c_items DESC, t.id;
