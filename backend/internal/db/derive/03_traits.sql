-- Character traits. Adapted from vndb sql/func.sql traits_chars_calc(), whose
-- output table we call chars_traits_inherit.
--
-- Traits are assigned rather than voted on, so only inheritance and the spoiler
-- merge happen here. The thresholds are MIN > 1.3 / 0.7, deliberately different
-- from the tag ones. Kana's character.traits returns the direct assignments,
-- not these.

INSERT INTO chars_traits_inherit (id, tid, spoil, lie)
WITH RECURSIVE up (lvl, tid, cid, spoil, lie) AS (
        SELECT 15, ct.tid, ct.id, ct.spoil, ct.lie FROM chars_traits ct
    UNION ALL
        SELECT u.lvl - 1, tp.parent, u.cid, u.spoil, u.lie
          FROM up u
          JOIN traits_parents tp ON tp.id = u.tid
         WHERE u.lvl > 0
)
SELECT cid, tid
     , (CASE WHEN MIN(spoil) > 1.3 THEN 2 WHEN MIN(spoil) > 0.7 THEN 1 ELSE 0 END)::smallint
     , bool_and(lie)
  FROM up
 WHERE tid IN (SELECT id FROM traits WHERE searchable)
 GROUP BY cid, tid;

UPDATE traits SET c_items = c.n
  FROM (SELECT tid, COUNT(*) AS n FROM chars_traits_inherit GROUP BY tid) c
 WHERE traits.id = c.tid;
