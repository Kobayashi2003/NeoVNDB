-- Tables vndb has but the dump does not export. Names and columns follow
-- vndb's own schema so the SQL that fills them stays line-comparable with
-- sql/func.sql.
--
-- The five derived columns live on the mirror tables themselves (see
-- 01_mirror.sql): vn.c_released, c_languages, c_platforms, c_developers and
-- chars.c_lang.

-- Kana's vn.tags field returns these. rating is
--   z * (x - y) / (x + y)
-- with x positive votes, y negative and z the mean of the positive ones.
-- Negative votes are a penalty factor, not part of the average.
CREATE TABLE tags_vn_direct (
    tag     integer  NOT NULL,
    vid     integer  NOT NULL,
    rating  real     NOT NULL,
    spoiler smallint NOT NULL,
    count   smallint NOT NULL,
    lie     boolean  NOT NULL,
    PRIMARY KEY (tag, vid)
);

-- What the tag= filter and vndb's own pages use: the direct scores propagated
-- up the parent DAG, then averaged.
CREATE TABLE tags_vn_inherit (
    tag     integer  NOT NULL,
    vid     integer  NOT NULL,
    rating  real     NOT NULL,
    spoiler smallint NOT NULL,
    lie     boolean  NOT NULL,
    PRIMARY KEY (tag, vid)
);

-- Traits are assigned rather than voted on, so there is no rating. The spoiler
-- thresholds on inherit are MIN > 1.3 / 0.7, unlike the tag ones.
--
-- vndb calls this traits_chars, one word order away from the dump's own
-- chars_traits that holds the direct assignments. Named for the pairing here
-- instead: the columns match chars_traits exactly, so the only difference in a
-- query is the _inherit suffix.
--   chars_traits          what a character page shows (Kana returns these)
--   chars_traits_inherit  what a trait= filter matches
CREATE TABLE chars_traits_inherit (
    id    integer  NOT NULL,
    tid   integer  NOT NULL,
    spoil smallint NOT NULL DEFAULT 0,
    lie   boolean  NOT NULL DEFAULT false,
    PRIMARY KEY (id, tid)
);

-- vndb partitions this by id range using the vndbid type; we hold one table
-- and filter on entity_type instead.
--
-- prio ranks a hit: 3 main title, 2 alias, 1 indirect. subid carries
-- staff_alias.aid where a hit is on an alias rather than the person.
CREATE TABLE search_cache (
    entity_type char(1)  NOT NULL,
    id          integer  NOT NULL,
    subid       integer,
    prio        smallint NOT NULL,
    label       text     NOT NULL COLLATE "C"
);

-- Ported from vndb sql/util.sql. Strip trademark marks, NFKC, lowercase,
-- unaccent, fold punctuation and fullwidth marks to 'a', drop whitespace, then
-- normalize a few spellings. Both the index and the query side run through it.
CREATE OR REPLACE FUNCTION search_norm_term(str text) RETURNS text AS $$
  SELECT regexp_replace(regexp_replace(regexp_replace(regexp_replace(
         regexp_replace(regexp_replace(regexp_replace(
            translate(
              lower(public.unaccent(normalize(translate(str, '™©®', ''), NFKC))),
              '@,_-‐.~～〜∼ー῀:[]()%+!?#$`♥★☆♪†「」『』【】・<>''^', 'a'),
            '\s+',    '',       'g'),
            '\*',     'x',      'g'),
            '&',      'and',    'g'),
            'disc',   'disk',   'g'),
            'gray',   'grey',   'g'),
            'colour', 'color',  'g'),
            'senpai', 'sempai', 'g');
$$ LANGUAGE SQL IMMUTABLE;

-- Closures for the tag and trait DAGs, rebuilt from tags_parents and
-- traits_parents. Parent expansion becomes a join instead of a recursive
-- query; depth 0 is the node itself.
CREATE TABLE tags_closure (
    ancestor   integer  NOT NULL,
    descendant integer  NOT NULL,
    depth      smallint NOT NULL,
    PRIMARY KEY (ancestor, descendant)
);

CREATE TABLE traits_closure (
    ancestor   integer  NOT NULL,
    descendant integer  NOT NULL,
    depth      smallint NOT NULL,
    PRIMARY KEY (ancestor, descendant)
);

-- One row, describing the generation it lives in. It is replaced along with
-- everything else, so nothing has to survive an import.
CREATE TABLE import_info (
    code         text        NOT NULL,
    dump_url     text        NOT NULL,
    dump_sha256  text,
    published_at timestamptz,
    started_at   timestamptz NOT NULL DEFAULT now(),
    finished_at  timestamptz,
    ddl_checksum text        NOT NULL,
    row_counts   jsonb       NOT NULL DEFAULT '{}'
);
