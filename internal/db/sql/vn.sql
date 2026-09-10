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
-- The nodes a graph draws: title in the entity's own language, plus the two
-- fields the layout orders by.
SELECT v.id, v.olang, v.c_released, t.title, t.latin
  FROM vn v
  LEFT JOIN vn_titles t ON t.id = v.id AND t.lang = v.olang
 WHERE v.id = ANY(@ids::int[]);

-- name: VNReleases :many
SELECT rv.vid, rv.rtype, r.*
  FROM releases r
  JOIN releases_vn rv ON rv.id = r.id
 WHERE rv.vid = ANY(@ids::int[])
 ORDER BY rv.vid, r.released;

-- name: VNCharacters :many
SELECT cv.vid, cv.role, cv.spoil, c.*
  FROM chars c
  JOIN chars_vns cv ON cv.id = c.id
 WHERE cv.vid = ANY(@ids::int[])
 ORDER BY cv.vid, cv.role, c.id;

-- name: VNStaff :many
-- aid identifies the pen name credited on this work, so the alias row is
-- joined rather than the person's main name.
SELECT vs.id, vs.aid, vs.role, vs.eid, vs.note,
       sa.id AS staff_id, sa.name, sa.latin, s.lang
  FROM vn_staff vs
  JOIN staff_alias sa ON sa.aid = vs.aid
  JOIN staff s ON s.id = sa.id
 WHERE vs.id = ANY(@ids::int[])
 ORDER BY vs.id, vs.role;

-- name: VNScreenshots :many
SELECT s.id, s.scr, s.rid,
       i.width, i.height, i.c_sexual_avg, i.c_violence_avg, i.c_votecount
  FROM vn_screenshots s
  JOIN images i ON i.kind = 'sf' AND i.num = s.scr
 WHERE s.id = ANY(@ids::int[])
 ORDER BY s.id, s.scr;

-- name: GetCovers :many
SELECT num, width, height, c_sexual_avg, c_violence_avg, c_votecount
  FROM images
 WHERE kind = 'cv' AND num = ANY(@nums::int[]);

-- name: ListVNs :many
-- count travels with the page: the filter is the expensive half either way, and
-- a window function avoids running it twice.
SELECT sqlc.embed(vn), COUNT(*) OVER ()::int AS total
  FROM vn
 ORDER BY id
 LIMIT $1 OFFSET $2;

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
SELECT cv.vid AS vn_id, cv.role, cv.spoil, c.id, c.c_lang, c.image, c.sex
  FROM chars_vns cv
  JOIN chars c ON c.id = cv.id
 WHERE cv.vid = ANY(@ids::int[])
 ORDER BY cv.vid, cv.role, c.id;

-- name: ReleaseTitles :many
SELECT id, lang, mtl, title, latin
  FROM releases_titles
 WHERE id = ANY(@ids::int[]);

-- name: CharacterNames :many
SELECT n.id, n.name, n.latin
  FROM chars_names n
  JOIN chars c ON c.id = n.id AND c.c_lang = n.lang
 WHERE n.id = ANY(@ids::int[]);

-- name: GetCharImages :many
SELECT num, width, height, c_sexual_avg, c_violence_avg, c_votecount
  FROM images
 WHERE kind = 'ch' AND num = ANY(@nums::int[]);
