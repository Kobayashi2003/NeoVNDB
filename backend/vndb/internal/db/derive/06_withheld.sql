-- What all-ages mode leaves out; the rules are on the table (02_derived.sql).
-- Each step reads those before it, so their order matters.

-- Tags and traits about sex, and everything under them: a child of such a tag
-- is no less about it.
INSERT INTO withheld (entity_type, id, reason)
SELECT DISTINCT 'g', c.descendant, 'e'
  FROM tags t
  JOIN tags_closure c ON c.ancestor = t.id
 WHERE t.cat = 'ero';

INSERT INTO withheld (entity_type, id, reason)
SELECT DISTINCT 'i', c.descendant, 's'
  FROM traits t
  JOIN traits_closure c ON c.ancestor = t.id
 WHERE t.sexual;

-- Releases rated 18 or up, or with erotic scenes.
INSERT INTO withheld (entity_type, id, reason)
SELECT 'r', id, 'a'
  FROM releases
 WHERE minage >= 18 OR has_ero;

-- A work with an adult release and no rated one for all: one also out in an
-- all-ages version stays, showing only that release. A work rated nowhere goes
-- by its tags instead, as voted; one voted a lie does not count.
WITH rated AS (
    SELECT rv.vid,
           COALESCE(bool_or(r.minage >= 18 OR r.has_ero), false) AS adult,
           COALESCE(bool_or(r.minage < 18 AND NOT r.has_ero), false) AS clean,
           bool_or(r.minage IS NOT NULL) AS rated
      FROM releases_vn rv
      JOIN releases r ON r.id = rv.id
     GROUP BY rv.vid
)
INSERT INTO withheld (entity_type, id, reason)
SELECT 'v', v.id, CASE WHEN x.adult THEN 'a' ELSE 't' END
  FROM vn v
  LEFT JOIN rated x ON x.vid = v.id
 WHERE (x.adult AND NOT x.clean)
    OR (NOT COALESCE(x.rated, false) AND EXISTS (
           SELECT 1
             FROM tags_vn_direct d
             JOIN withheld w ON w.entity_type = 'g' AND w.id = d.tag
            WHERE d.vid = v.id AND d.rating > 0 AND NOT d.lie));

-- A character seen nowhere but in withheld works, or in their withheld
-- releases: one added only in a work's adult release goes with that release.
INSERT INTO withheld (entity_type, id, reason)
SELECT 'c', c.id, 'c'
  FROM chars c
 WHERE NOT EXISTS (
           SELECT 1
             FROM chars_vns cv
            WHERE cv.id = c.id
              AND NOT EXISTS (SELECT 1 FROM withheld w WHERE w.entity_type = 'v' AND w.id = cv.vid)
              AND (cv.rid IS NULL
                   OR NOT EXISTS (SELECT 1 FROM withheld w WHERE w.entity_type = 'r' AND w.id = cv.rid)));
