-- The dump ships no indexes beyond primary keys, so every access path the API
-- takes is declared here. Applied after COPY, before the derived step.

-- Home page: a date range within one original language, newest first.
-- c_released stays YYYYMMDD, so a year is 20080000..20089999.
CREATE INDEX vn_browse   ON vn (olang, c_released DESC);
CREATE INDEX vn_released ON vn (c_released DESC);
CREATE INDEX vn_rating   ON vn (c_rating DESC NULLS LAST);

CREATE INDEX tags_vn_direct_ranked  ON tags_vn_direct  (tag, rating DESC);
CREATE INDEX tags_vn_inherit_ranked ON tags_vn_inherit (tag, rating DESC);
CREATE INDEX chars_traits_inherit_by_trait ON chars_traits_inherit (tid);

-- Recomputing scores scans by vid; counts filters out votes that do not apply.
CREATE INDEX tags_vn_by_vid ON tags_vn (vid) WHERE counts;

-- Safe mode filters on these.
CREATE INDEX images_content ON images (c_sexual_avg, c_violence_avg);

-- Reverse directions of the join tables; primary keys already cover forward.
CREATE INDEX chars_vns_by_char       ON chars_vns (id);
CREATE INDEX chars_vns_by_vn         ON chars_vns (vid);
CREATE INDEX chars_traits_by_trait   ON chars_traits (tid);
CREATE INDEX releases_vn_by_vn       ON releases_vn (vid);
CREATE INDEX releases_producers_rev  ON releases_producers (pid);
CREATE INDEX releases_images_by_vn   ON releases_images (vid);
CREATE INDEX vn_relations_rev        ON vn_relations (vid);
CREATE INDEX vn_screenshots_by_img   ON vn_screenshots (scr);
CREATE INDEX vn_staff_by_alias       ON vn_staff (aid);
CREATE INDEX vn_seiyuu_by_char       ON vn_seiyuu (cid);
CREATE INDEX vn_seiyuu_by_alias      ON vn_seiyuu (aid);
CREATE INDEX staff_alias_by_staff    ON staff_alias (id);
CREATE INDEX tags_parents_by_parent  ON tags_parents (parent);
CREATE INDEX traits_parents_by_parent ON traits_parents (parent);
CREATE INDEX tags_closure_rev        ON tags_closure (descendant);
CREATE INDEX traits_closure_rev      ON traits_closure (descendant);

-- Title and name lookups during the derived step and for detail pages.
CREATE INDEX vn_titles_by_lang       ON vn_titles (id, lang);
CREATE INDEX chars_names_by_lang     ON chars_names (id, lang);
CREATE INDEX releases_titles_by_lang ON releases_titles (id, lang);

CREATE INDEX entry_meta_lastmod ON entry_meta (lastmod DESC);

CREATE INDEX search_cache_label  ON search_cache USING gin (label gin_trgm_ops);
CREATE INDEX search_cache_entity ON search_cache (entity_type, id);
