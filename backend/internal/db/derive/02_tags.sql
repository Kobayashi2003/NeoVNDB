-- Tag scores. Adapted from vndb sql/func.sql tag_vn_calc(); the arithmetic is
-- unchanged, the `hidden` filters are gone and the permission check has
-- already been folded into tags_vn.counts at load time.
--
-- Verified against the Kana API on v1, v17 and v11: 475 tags, every rating and
-- spoiler identical.

INSERT INTO tags_vn_direct (tag, vid, rating, spoiler, count, lie)
SELECT tv.tag, tv.vid
     -- https://vndb.org/t13470.28 -> (z || 3) * ((x-y) / (x+y))
     -- Negative votes are a penalty factor, not part of the average: a plain
     -- mean over all votes never reproduces these numbers.
     , (COALESCE(AVG(tv.vote) FILTER (WHERE tv.vote > 0), 3)
        * SUM(sign(tv.vote)) / COUNT(tv.vote))::real
     , CASE WHEN COUNT(tv.spoiler) = 0 THEN MIN(t.defaultspoil)
            WHEN AVG(tv.spoiler) > 1.3 THEN 2
            WHEN AVG(tv.spoiler) > 0.4 THEN 1
            ELSE 0 END
     , LEAST(COUNT(tv.vote) FILTER (WHERE tv.vote > 0), 32000)::smallint
     , COUNT(tv.lie) FILTER (WHERE tv.lie) > 0
       AND COUNT(tv.lie) FILTER (WHERE tv.lie) >= COUNT(tv.lie) FILTER (WHERE NOT tv.lie)
  FROM tags_vn tv
  JOIN tags t ON t.id = tv.tag
 WHERE tv.counts
 GROUP BY tv.tag, tv.vid
-- A tag with no more positive than negative votes does not appear at all.
HAVING SUM(sign(tv.vote)) > 0;

-- Inherited scores: each direct score propagates up every parent edge, at most
-- fifteen levels, and the copies that land on one tag are averaged. A tag
-- reachable by several paths therefore counts several times, as upstream does.
INSERT INTO tags_vn_inherit (tag, vid, rating, spoiler, lie)
WITH RECURSIVE up (lvl, tag, vid, rating, spoiler, lie) AS (
        SELECT 15, tag, vid, rating, spoiler, lie FROM tags_vn_direct
    UNION ALL
        SELECT u.lvl - 1, tp.parent, u.vid, u.rating, u.spoiler, u.lie
          FROM up u
          JOIN tags_parents tp ON tp.id = u.tag
         WHERE u.lvl > 0
)
SELECT tag, vid, AVG(rating)::real, MIN(spoiler), bool_and(lie)
  FROM up
 WHERE tag IN (SELECT id FROM tags WHERE searchable)
 GROUP BY tag, vid;

UPDATE tags SET c_items = c.n
  FROM (SELECT tag, COUNT(*) AS n FROM tags_vn_inherit GROUP BY tag) c
 WHERE tags.id = c.tag;
