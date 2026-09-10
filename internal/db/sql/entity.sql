-- name: GetImportInfo :one
SELECT * FROM import_info LIMIT 1;

-- name: Search :many
-- prio ranks main titles above aliases above indirect hits. The term goes
-- through the same normalizer that built the labels.
SELECT entity_type, id, MAX(prio)::smallint AS prio
  FROM search_cache
 WHERE label LIKE '%' || search_norm_term(@term::text) || '%'
   AND (@entity_type::text = '' OR entity_type = @entity_type::text)
 GROUP BY entity_type, id
 ORDER BY prio DESC, id
 LIMIT $1 OFFSET $2;

-- name: VNExtLinks :many
SELECT v.id, e.site, e.value
  FROM vn_extlinks v
  JOIN extlinks e ON e.id = v.link
 WHERE v.id = ANY(@ids::int[])
 ORDER BY v.id, e.site;

-- name: GetTags :many
SELECT * FROM tags WHERE id = ANY(@ids::int[]);

-- name: GetTraits :many
SELECT * FROM traits WHERE id = ANY(@ids::int[]);

-- name: GetProducers :many
SELECT * FROM producers WHERE id = ANY(@ids::int[]);
