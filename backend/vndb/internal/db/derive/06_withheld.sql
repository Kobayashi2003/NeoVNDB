-- What all-ages mode leaves out; the rules are on the table (02_withheld.sql).
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
-- by its tags instead, as voted; one voted a lie does not count. A trial is
-- neither the all-ages version nor a rating of the work: an adult work with an
-- all-ages demo is still an adult work. An adult trial still makes it adult.
WITH rated AS (
    SELECT rv.vid,
           COALESCE(bool_or(r.minage >= 18 OR r.has_ero), false) AS adult,
           COALESCE(bool_or(r.minage < 18 AND NOT r.has_ero
                            AND rv.rtype IS DISTINCT FROM 'trial'), false) AS clean,
           COALESCE(bool_or(r.minage IS NOT NULL
                            AND rv.rtype IS DISTINCT FROM 'trial'), false) AS rated
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

-- A shown work's release date, languages, platforms and developers, from its
-- shown releases only: the rules of 01_vncache.sql, less what is withheld.
-- Otherwise a work kept for its all-ages version would carry its adult
-- original's date and platforms, and match a filter on them.
WITH touched AS (
    SELECT DISTINCT rv.vid
      FROM releases_vn rv
      JOIN withheld w ON w.entity_type = 'r' AND w.id = rv.id
     WHERE NOT EXISTS (SELECT 1 FROM withheld x WHERE x.entity_type = 'v' AND x.id = rv.vid)
), shown AS (
    SELECT rv.id, rv.vid, rv.rtype
      FROM releases_vn rv
      JOIN touched t ON t.vid = rv.vid
     WHERE NOT EXISTS (SELECT 1 FROM withheld w WHERE w.entity_type = 'r' AND w.id = rv.id)
), released AS (
    SELECT s.vid, MIN(r.released) AS val
      FROM shown s
      JOIN releases r ON r.id = s.id
     WHERE s.rtype <> 'trial' AND r.released <> 0 AND r.official
     GROUP BY s.vid
), languages AS (
    SELECT s.vid, array_agg(DISTINCT rt.lang ORDER BY rt.lang) AS val
      FROM shown s
      JOIN releases r ON r.id = s.id
      JOIN releases_titles rt ON rt.id = r.id
     WHERE s.rtype <> 'trial'
       AND NOT rt.mtl
       AND r.released <= to_char(now(), 'YYYYMMDD')::int
     GROUP BY s.vid
), platforms AS (
    SELECT s.vid, array_agg(DISTINCT rp.platform ORDER BY rp.platform) AS val
      FROM shown s
      JOIN releases r ON r.id = s.id
      JOIN releases_platforms rp ON rp.id = r.id
     WHERE s.rtype <> 'trial'
       AND r.released <= to_char(now(), 'YYYYMMDD')::int
     GROUP BY s.vid
), developers AS (
    SELECT s.vid, array_agg(DISTINCT rp.pid ORDER BY rp.pid) AS val
      FROM shown s
      JOIN releases r ON r.id = s.id
      JOIN releases_producers rp ON rp.id = r.id
     WHERE rp.developer AND r.official
     GROUP BY s.vid
)
INSERT INTO vn_allages (id, c_released, c_languages, c_platforms, c_developers)
SELECT t.vid, COALESCE(released.val, 0), COALESCE(languages.val, '{}'),
       COALESCE(platforms.val, '{}'), COALESCE(developers.val, '{}')
  FROM touched t
  LEFT JOIN released   ON released.vid   = t.vid
  LEFT JOIN languages  ON languages.vid  = t.vid
  LEFT JOIN platforms  ON platforms.vid  = t.vid
  LEFT JOIN developers ON developers.vid = t.vid;
