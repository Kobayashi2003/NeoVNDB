-- Base rows and relation fragments for releases. A release is titled the same
-- way a visual novel is: the row matching releases.olang wins, romanised form
-- preferred.

-- name: GetReleases :many
SELECT * FROM releases WHERE id = ANY(@ids::int[]);

-- name: ReleaseTitleList :many
SELECT id, lang, mtl, title, latin FROM releases_titles
 WHERE id = ANY(@ids::int[]) ORDER BY id, lang;

-- name: ReleasePlatforms :many
SELECT id, platform FROM releases_platforms WHERE id = ANY(@ids::int[]) ORDER BY id, platform;

-- name: ReleaseMedia :many
SELECT id, medium, qty FROM releases_media WHERE id = ANY(@ids::int[]) ORDER BY id, medium;

-- name: ReleaseVNs :many
SELECT rv.id AS release_id, rv.vid, rv.rtype, v.olang, t.title, t.latin
  FROM releases_vn rv
  JOIN vn v ON v.id = rv.vid
  LEFT JOIN vn_titles t ON t.id = v.id AND t.lang = v.olang
 WHERE rv.id = ANY(@ids::int[])
 ORDER BY rv.id, rv.vid;

-- name: ReleaseProducers :many
SELECT rp.id AS release_id, rp.pid, rp.developer, rp.publisher,
       p.name, p.latin, p.lang
  FROM releases_producers rp
  JOIN producers p ON p.id = rp.pid
 WHERE rp.id = ANY(@ids::int[])
 ORDER BY rp.id, p.name;

-- name: ReleaseImages :many
SELECT ri.id AS release_id, ri.img, ri.vid, ri.itype, ri.lang,
       i.width, i.height, i.c_sexual_avg, i.c_violence_avg, i.c_votecount
  FROM releases_images ri
  JOIN images i ON i.kind = 'cv' AND i.num = ri.img
 WHERE ri.id = ANY(@ids::int[])
 ORDER BY ri.id, ri.img;

-- name: ReleaseDRM :many
SELECT rd.id AS release_id, rd.drm AS drm_id, rd.notes,
       d.name, d.description, d.disc, d.cdkey, d.activate, d.alimit,
       d.account, d.online, d.cloud, d.physical
  FROM releases_drm rd
  JOIN drm d ON d.id = rd.drm
 WHERE rd.id = ANY(@ids::int[])
 ORDER BY rd.id, d.name;

-- name: ReleaseSupersedes :many
SELECT id AS release_id, rid FROM releases_supersedes
 WHERE id = ANY(@ids::int[]) ORDER BY id, rid;

-- name: ReleaseExtLinks :many
SELECT r.id AS release_id, e.site, e.value
  FROM releases_extlinks r
  JOIN extlinks e ON e.id = r.link
 WHERE r.id = ANY(@ids::int[])
 ORDER BY r.id, e.site;

-- name: GetEngines :many
SELECT id, name, description FROM engines WHERE id = ANY(@ids::int[]);
