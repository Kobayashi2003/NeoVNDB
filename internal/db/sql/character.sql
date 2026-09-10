-- Base rows and relation fragments for characters. As with visual novels a
-- character is not named on its own row: the names live in chars_names, keyed
-- by the language the import resolved into chars.c_lang.

-- name: GetChars :many
SELECT * FROM chars WHERE id = ANY(@ids::int[]);

-- name: CharNames :many
-- Every language a character is named in, so a caller can pick.
SELECT id, lang, name, latin FROM chars_names WHERE id = ANY(@ids::int[]) ORDER BY id, lang;

-- name: CharAliases :many
SELECT id, spoil, name, latin FROM chars_alias WHERE id = ANY(@ids::int[]) ORDER BY id, name;

-- name: CharTraitList :many
-- The direct assignments, which is what a character page shows; the inherited
-- table is what a trait= filter matches.
SELECT ct.id AS char_id, ct.tid, ct.spoil, ct.lie,
       t.name, t.gid, t.sexual
  FROM chars_traits ct
  JOIN traits t ON t.id = ct.tid
 WHERE ct.id = ANY(@ids::int[])
 ORDER BY ct.id, t.name;

-- name: CharVNList :many
SELECT cv.id AS char_id, cv.vid, cv.rid, cv.role, cv.spoil,
       v.olang, v.c_released, t.title, t.latin
  FROM chars_vns cv
  JOIN vn v ON v.id = cv.vid
  LEFT JOIN vn_titles t ON t.id = v.id AND t.lang = v.olang
 WHERE cv.id = ANY(@ids::int[])
 ORDER BY cv.id, v.c_released;

-- name: CharSeiyuu :many
-- The voice credits are recorded on the VN, not the character, so this reaches
-- through vn_seiyuu and resolves the alias that was credited.
SELECT vs.cid AS char_id, vs.id AS vn_id, vs.note,
       s.id AS staff_id, s.lang, sa.name, sa.latin
  FROM vn_seiyuu vs
  JOIN staff_alias sa ON sa.aid = vs.aid
  JOIN staff s ON s.id = sa.id
 WHERE vs.cid = ANY(@ids::int[])
 ORDER BY vs.cid, sa.name;
