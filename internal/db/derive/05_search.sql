-- The search index, following vndb sql/func.sql's search_cache composition.
-- prio: 3 a main title, 2 an alias, 1 an indirect hit such as a release title
-- matching its VN. Labels go through search_norm_term so the query side can
-- normalize the input the same way.
--
-- aliases are newline-separated in one column, hence the regexp_split_to_table.
-- subid is cast because a run of untyped NULLs in a UNION resolves to text,
-- which then cannot be matched against the staff branch's integer aid.

INSERT INTO search_cache (entity_type, id, subid, prio, label)
          SELECT 'v', id, NULL::int, 3, search_norm_term(title) FROM vn_titles
UNION ALL SELECT 'v', id, NULL::int, 3, search_norm_term(latin) FROM vn_titles WHERE latin IS NOT NULL
UNION ALL SELECT 'v', id, NULL::int, 2, search_norm_term(a)
            FROM vn, regexp_split_to_table(vn.alias, E'\n') a WHERE a <> ''
UNION ALL SELECT 'v', rv.vid, NULL::int, 1, search_norm_term(rt.title)
            FROM releases_titles rt JOIN releases_vn rv ON rv.id = rt.id
           WHERE rt.title IS NOT NULL

UNION ALL SELECT 'r', id, NULL::int, 3, search_norm_term(title) FROM releases_titles WHERE title IS NOT NULL
UNION ALL SELECT 'r', id, NULL::int, 3, search_norm_term(latin) FROM releases_titles WHERE latin IS NOT NULL
UNION ALL SELECT 'r', id, NULL::int, 1, search_norm_term(catalog) FROM releases WHERE catalog <> ''

UNION ALL SELECT 'c', id, NULL::int, 3, search_norm_term(name)  FROM chars_names
UNION ALL SELECT 'c', id, NULL::int, 3, search_norm_term(latin) FROM chars_names WHERE latin IS NOT NULL
UNION ALL SELECT 'c', id, NULL::int, 2, search_norm_term(name)  FROM chars_alias
UNION ALL SELECT 'c', id, NULL::int, 2, search_norm_term(latin) FROM chars_alias WHERE latin IS NOT NULL

UNION ALL SELECT 'p', id, NULL::int, 3, search_norm_term(name)  FROM producers
UNION ALL SELECT 'p', id, NULL::int, 3, search_norm_term(latin) FROM producers WHERE latin IS NOT NULL
UNION ALL SELECT 'p', id, NULL::int, 2, search_norm_term(a)
            FROM producers, regexp_split_to_table(producers.alias, E'\n') a WHERE a <> ''

-- Staff hits carry the alias they matched, because that is what a result has
-- to display: the pen name searched for, not the person's main name.
UNION ALL SELECT 's', id, aid, 3, search_norm_term(name)  FROM staff_alias
UNION ALL SELECT 's', id, aid, 3, search_norm_term(latin) FROM staff_alias WHERE latin IS NOT NULL

UNION ALL SELECT 'g', id, NULL::int, 3, search_norm_term(name) FROM tags
UNION ALL SELECT 'g', id, NULL::int, 2, search_norm_term(a)
            FROM tags, regexp_split_to_table(tags.alias, E'\n') a WHERE a <> ''

UNION ALL SELECT 'i', id, NULL::int, 3, search_norm_term(name) FROM traits
UNION ALL SELECT 'i', id, NULL::int, 2, search_norm_term(a)
            FROM traits, regexp_split_to_table(traits.alias, E'\n') a WHERE a <> '';

-- Normalization collapses punctuation and case, so the same label often lands
-- several times for one entity; keep the strongest.
DELETE FROM search_cache a
 USING search_cache b
 WHERE a.entity_type = b.entity_type AND a.id = b.id AND a.label = b.label
   AND a.subid IS NOT DISTINCT FROM b.subid
   AND (a.prio < b.prio OR (a.prio = b.prio AND a.ctid > b.ctid));

DELETE FROM search_cache WHERE label = '';
