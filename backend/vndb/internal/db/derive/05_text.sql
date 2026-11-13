-- Fills search_text (ddl/02_text.sql). BBCode tags go first: [url=...] is an
-- address, not words, and search_norm_term would keep it as text.
--
-- The trigram index is made here, after the rows, unlike the rest of the
-- derived tables' indexes (ddl/03_indexes.sql): this one script also brings a
-- generation from before it up to date (db.BuildSearchText), and a GIN index
-- built once over 50 MB is far quicker than one kept up a row at a time.
INSERT INTO search_text (entity_type, id, body)
SELECT entity_type, id, search_norm_term(regexp_replace(body, '\[/?[a-z]+(=[^\]]*)?\]', '', 'gi'))
  FROM (
          SELECT 'v' AS entity_type, id, description AS body FROM vn        WHERE description <> ''
UNION ALL SELECT 'c', id, description FROM chars     WHERE description <> ''
UNION ALL SELECT 'p', id, description FROM producers WHERE description <> ''
UNION ALL SELECT 's', id, description FROM staff     WHERE description <> ''
UNION ALL SELECT 'g', id, description FROM tags      WHERE description <> ''
UNION ALL SELECT 'i', id, description FROM traits    WHERE description <> ''
UNION ALL SELECT 'r', id, notes       FROM releases  WHERE notes <> ''
  ) d;

DELETE FROM search_text WHERE body = '';

CREATE INDEX search_text_body ON search_text USING gin (body gin_trgm_ops);
