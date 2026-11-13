-- What a search matches: search_cache, plus each tag and trait's translated
-- name as an alias. A view rather than rows in search_cache, because the
-- translations are this project's own data: they stay in trans, outside every
-- generation, and an edit on the admin page is searchable at once.
--
-- A tag finds its translation by trans.Key of its name (case folded, runs of
-- space made one). Branches for other types are pruned by the planner when a
-- search names its type, so a VN search costs what it did.
CREATE OR REPLACE VIEW search_labels AS
          SELECT entity_type, id, subid, prio, label FROM search_cache
UNION ALL SELECT 'g'::char(1), g.id, NULL::int, 2::smallint, t.target_norm
            FROM tags g
            JOIN trans.terms t ON t.source_key = lower(regexp_replace(btrim(g.name), '\s+', ' ', 'g'))
           WHERE t.target_norm <> ''
UNION ALL SELECT 'i'::char(1), i.id, NULL::int, 2::smallint, t.target_norm
            FROM traits i
            JOIN trans.terms t ON t.source_key = lower(regexp_replace(btrim(i.name), '\s+', ' ', 'g'))
           WHERE t.target_norm <> '';
