-- Base rows and relation fragments. Every fragment takes an id array so a
-- request costs one round trip per fragment rather than one per row.
--
-- Titles are not here: they come from vn_titles, resolved against olang.

-- name: GetVN :one
SELECT * FROM vn WHERE id = $1;

-- name: GetVNs :many
SELECT * FROM vn WHERE id = ANY(@ids::int[]);

-- name: VNTitles :many
SELECT id, lang, official, title, latin
  FROM vn_titles
 WHERE id = ANY(@ids::int[])
 ORDER BY id, lang;

-- name: BrowseVNByRelease :many
-- c_released is YYYYMMDD, so a whole year is 20080000..20089999 and a partial
-- date sorts inside its own year.
SELECT * FROM vn
 WHERE c_released BETWEEN @from_date::int AND @to_date::int
   AND (@olang::text = '' OR olang = @olang::text)
 ORDER BY c_released DESC, id DESC
 LIMIT $1 OFFSET $2;

-- name: VNTags :many
-- tag breaks ties: without it equally rated tags come back in whatever order
-- the scan produced, so two identical requests can disagree.
SELECT vid, tag, rating, spoiler, lie, count
  FROM tags_vn_direct
 WHERE vid = ANY(@ids::int[])
 ORDER BY vid, rating DESC, tag;

-- name: VNsByTag :many
-- tags_vn_inherit already carries a row for every ancestor tag, so matching on
-- it is the parent expansion; no closure join is needed.
SELECT vid, rating
  FROM tags_vn_inherit
 WHERE tag = @tag::int AND rating >= @min_rating::real
 ORDER BY rating DESC
 LIMIT $1 OFFSET $2;

-- name: VNRelations :many
SELECT id, vid, relation, official
  FROM vn_relations
 WHERE id = ANY(@ids::int[])
 ORDER BY id, vid;

-- Best first, as the page shows them.
-- name: VNSimilar :many
SELECT id, vid, score
  FROM vn_similar
 WHERE id = ANY(@ids::int[])
 ORDER BY id, score DESC, vid;

-- name: VNRelationGraph :many
-- The connected component reachable from one VN, breadth-first and capped.
-- Edges are stored in both directions, so following one is enough to reach the
-- whole component -- which for a long-running series runs to a couple of
-- thousand titles, hence the depth limit.
WITH RECURSIVE walk(id, depth) AS (
        SELECT @root::int, 0
    UNION
        SELECT r.vid, w.depth + 1
          FROM vn_relations r
          JOIN walk w ON r.id = w.id
         WHERE w.depth < @max_depth::int
)
SELECT r.id, r.vid, r.relation, r.official, w.depth
  FROM walk w
  JOIN vn_relations r ON r.id = w.id
 ORDER BY w.depth, r.id, r.vid;

-- name: VNGraphNodes :many
-- The nodes a graph draws: title in the entity's own language, the fields the
-- layout orders by, and what a card shows -- status, rating and cover.
SELECT v.id, v.olang, v.c_released, v.devstatus, v.c_rating, v.c_image,
       t.title, t.latin,
       i.width, i.height, i.c_sexual_avg, i.c_violence_avg, i.c_votecount
  FROM vn v
  LEFT JOIN vn_titles t ON t.id = v.id AND t.lang = v.olang
  LEFT JOIN images i ON i.kind = 'cv' AND i.num = v.c_image
 WHERE v.id = ANY(@ids::int[]);

-- name: GetCovers :many
SELECT num, width, height, c_sexual_avg, c_violence_avg, c_votecount
  FROM images
 WHERE kind = 'cv' AND num = ANY(@nums::int[]);

-- name: VNDevelopers :many
-- c_developers is a cached array on the row, so the producers come back in one
-- lookup rather than through the releases.
SELECT v.id AS vn_id, p.id, p.name, p.latin
  FROM vn v
  JOIN producers p ON p.id = ANY(v.c_developers)
 WHERE v.id = ANY(@ids::int[])
 ORDER BY v.id, p.name;

-- name: VNScreenshotList :many
-- The dump carries no ordering column for screenshots, so the image id is the
-- only stable order available.
SELECT s.id AS vn_id, s.scr, s.rid,
       i.width, i.height, i.c_sexual_avg, i.c_violence_avg, i.c_votecount
  FROM vn_screenshots s
  JOIN images i ON i.kind = 'sf' AND i.num = s.scr
 WHERE s.id = ANY(@ids::int[])
 ORDER BY s.id, s.scr;

-- name: VNEditionList :many
-- The named versions of a work. They are what vn_staff.eid points at, so a
-- credit can say which version of the game it was on.
SELECT id AS vn_id, eid, lang, official, name
  FROM vn_editions
 WHERE id = ANY(@ids::int[])
 ORDER BY id, eid;

-- name: VNAnimeList :many
-- Anime adapted from a work. vn_anime holds only the pairing, so the anime
-- itself is joined for anything worth showing.
SELECT va.id AS vn_id, a.id, a.type, a.year, a.title_romaji, a.title_kanji
  FROM vn_anime va
  JOIN anime a ON a.id = va.aid
 WHERE va.id = ANY(@ids::int[])
 ORDER BY va.id, a.year NULLS LAST, a.id;

-- name: VNStaffList :many
-- aid names the pen name credited on this work, so the alias row is joined
-- rather than the person's main name.
SELECT vs.id AS vn_id, vs.role, vs.eid, vs.note,
       s.id AS staff_id, s.lang, sa.name, sa.latin
  FROM vn_staff vs
  JOIN staff_alias sa ON sa.aid = vs.aid
  JOIN staff s ON s.id = sa.id
 WHERE vs.id = ANY(@ids::int[])
 ORDER BY vs.id, vs.role, sa.name;

-- name: VNReleaseList :many
SELECT rv.vid AS vn_id, rv.rtype, r.id, r.released, r.official, r.patch,
       r.minage, r.uncensored, r.freeware
  FROM releases_vn rv
  JOIN releases r ON r.id = rv.id
 WHERE rv.vid = ANY(@ids::int[])
 ORDER BY rv.vid, r.released, r.id;

-- name: VNCharacterList :many
-- chars_vns has a row per release a character is in, each with its own role
-- and spoiler level, so one character can come back five times. A work lists
-- each character once, as vndb does: the weightiest role any release gives it,
-- and the mildest spoiler level, since it is no secret in a release that shows
-- it openly.
SELECT cv.vid AS vn_id,
       (array_agg(cv.role ORDER BY array_position(
           ARRAY['main', 'primary', 'side', 'appears'], cv.role)))[1]::text AS role,
       MIN(cv.spoil)::smallint AS spoil, c.id, c.c_lang, c.image, c.sex
  FROM chars_vns cv
  JOIN chars c ON c.id = cv.id
 WHERE cv.vid = ANY(@ids::int[])
 GROUP BY cv.vid, c.id
 ORDER BY cv.vid, role, c.id;

-- name: GetCharImages :many
SELECT num, width, height, c_sexual_avg, c_violence_avg, c_votecount
  FROM images
 WHERE kind = 'ch' AND num = ANY(@nums::int[]);
