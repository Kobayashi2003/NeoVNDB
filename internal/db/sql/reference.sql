-- Producers, staff, tags and traits. These four are simpler than the first
-- three: producers carry their name on the row, staff keep theirs in
-- staff_alias, and the two vocabularies are mostly self-contained.

-- name: ProducerRelations :many
SELECT pr.id AS producer_id, pr.pid, pr.relation, p.name, p.latin
  FROM producers_relations pr
  JOIN producers p ON p.id = pr.pid
 WHERE pr.id = ANY(@ids::int[])
 ORDER BY pr.id, p.name;

-- name: ProducerExtLinks :many
SELECT pe.id AS producer_id, e.site, e.value
  FROM producers_extlinks pe
  JOIN extlinks e ON e.id = pe.link
 WHERE pe.id = ANY(@ids::int[])
 ORDER BY pe.id, e.site;

-- name: GetStaff :many
SELECT * FROM staff WHERE id = ANY(@ids::int[]);

-- name: StaffAliases :many
-- is_main marks the alias staff.main points at, the person's own name.
SELECT sa.id AS staff_id, sa.aid, sa.name, sa.latin, (sa.aid = s.main) AS is_main
  FROM staff_alias sa
  JOIN staff s ON s.id = sa.id
 WHERE sa.id = ANY(@ids::int[])
 ORDER BY sa.id, is_main DESC, sa.name;

-- name: StaffExtLinks :many
SELECT se.id AS staff_id, e.site, e.value
  FROM staff_extlinks se
  JOIN extlinks e ON e.id = se.link
 WHERE se.id = ANY(@ids::int[])
 ORDER BY se.id, e.site;

-- name: TagParents :many
SELECT tp.id AS tag_id, tp.parent, tp.main, t.name
  FROM tags_parents tp
  JOIN tags t ON t.id = tp.parent
 WHERE tp.id = ANY(@ids::int[])
 ORDER BY tp.id, t.name;

-- name: TagChildren :many
SELECT tp.parent AS tag_id, tp.id AS child, tp.main, t.name
  FROM tags_parents tp
  JOIN tags t ON t.id = tp.id
 WHERE tp.parent = ANY(@ids::int[])
 ORDER BY tp.parent, t.name;

-- name: TraitGroups :many
SELECT t.id, g.id AS group_id, g.name AS group_name
  FROM traits t
  JOIN traits g ON g.id = t.gid
 WHERE t.id = ANY(@ids::int[]);

-- name: TraitParents :many
SELECT tp.id AS trait_id, tp.parent, tp.main, t.name
  FROM traits_parents tp
  JOIN traits t ON t.id = tp.parent
 WHERE tp.id = ANY(@ids::int[])
 ORDER BY tp.id, t.name;

-- name: TraitChildren :many
SELECT tp.parent AS trait_id, tp.id AS child, tp.main, t.name
  FROM traits_parents tp
  JOIN traits t ON t.id = tp.id
 WHERE tp.parent = ANY(@ids::int[])
 ORDER BY tp.parent, t.name;
