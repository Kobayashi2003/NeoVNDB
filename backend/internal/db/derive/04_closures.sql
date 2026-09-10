-- Transitive closures over the tag and trait parent DAGs, so a filter on a
-- parent becomes one join instead of a recursive query at read time.
-- depth 0 is the node itself. Both graphs are multi-parent, so a pair can be
-- reached several ways; the shortest depth wins.

INSERT INTO tags_closure (ancestor, descendant, depth)
WITH RECURSIVE up (ancestor, descendant, depth) AS (
        SELECT id, id, 0 FROM tags
    UNION ALL
        SELECT tp.parent, u.descendant, u.depth + 1
          FROM up u
          JOIN tags_parents tp ON tp.id = u.ancestor
         WHERE u.depth < 15
)
SELECT ancestor, descendant, MIN(depth)::smallint
  FROM up
 GROUP BY ancestor, descendant;

INSERT INTO traits_closure (ancestor, descendant, depth)
WITH RECURSIVE up (ancestor, descendant, depth) AS (
        SELECT id, id, 0 FROM traits
    UNION ALL
        SELECT tp.parent, u.descendant, u.depth + 1
          FROM up u
          JOIN traits_parents tp ON tp.id = u.ancestor
         WHERE u.depth < 15
)
SELECT ancestor, descendant, MIN(depth)::smallint
  FROM up
 GROUP BY ancestor, descendant;
