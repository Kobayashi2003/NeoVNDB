-- Mirror of the VNDB dump, table and column names unchanged.
-- Source: schema_plain.sql inside the archive.
--
-- Two deliberate deviations:
--   * ids are integer, not the dump's 'v17' text. Everything else about a
--     column is untouched; the prefix is implied by which column it is.
--   * enum-like columns are text, not PG enums, so a new upstream platform or
--     language cannot break an import.
--
-- No foreign keys: they would validate every row on COPY, and the dump is
-- internally consistent by construction. Import verification checks integrity
-- instead.

CREATE TABLE anime (
    id           integer PRIMARY KEY,
    ann_id       integer[],
    type         text,
    year         smallint,
    title_romaji text,
    title_kanji  text,
    mal_id       integer[]
);

-- image is a 'ch' id; main points at another character this one is an
-- instance of.
CREATE TABLE chars (
    id           integer PRIMARY KEY,
    image        integer,
    bloodt       text     NOT NULL,
    cup_size     text     NOT NULL,
    sex          text     NOT NULL,
    spoil_sex    text,
    gender       text,
    spoil_gender text,
    main         integer,
    main_spoil   smallint NOT NULL,
    s_bust       smallint NOT NULL,
    s_waist      smallint NOT NULL,
    s_hip        smallint NOT NULL,
    birthday     smallint NOT NULL,
    height       smallint NOT NULL,
    weight       smallint,
    age          smallint,
    description  text     NOT NULL,
    c_lang       text     NOT NULL DEFAULT 'ja'
);

CREATE TABLE chars_alias (
    id    integer  NOT NULL,
    spoil smallint NOT NULL,
    name  text     NOT NULL,
    latin text,
    PRIMARY KEY (id, name)
);

CREATE TABLE chars_names (
    id    integer NOT NULL,
    lang  text    NOT NULL,
    name  text    NOT NULL,
    latin text,
    PRIMARY KEY (id, lang)
);

CREATE TABLE chars_traits (
    id    integer  NOT NULL,
    tid   integer  NOT NULL,
    spoil smallint NOT NULL,
    lie   boolean  NOT NULL,
    PRIMARY KEY (id, tid)
);

CREATE TABLE chars_vns (
    id    integer  NOT NULL,
    vid   integer  NOT NULL,
    rid   integer,
    role  text     NOT NULL,
    spoil smallint NOT NULL
);

CREATE TABLE drm (
    id          integer PRIMARY KEY,
    disc        boolean NOT NULL,
    cdkey       boolean NOT NULL,
    activate    boolean NOT NULL,
    alimit      boolean NOT NULL,
    account     boolean NOT NULL,
    online      boolean NOT NULL,
    cloud       boolean NOT NULL,
    physical    boolean NOT NULL,
    name        text    NOT NULL,
    description text    NOT NULL
);

CREATE TABLE engines (
    id          integer PRIMARY KEY,
    name        text    NOT NULL,
    description text    NOT NULL
);

-- The dump keys this by a single polymorphic id ('v17', 'c1', 'r5'); split so
-- the numeric part can be an integer.
CREATE TABLE entry_meta (
    entity_type char(1)  NOT NULL,
    id          integer  NOT NULL,
    created     date     NOT NULL,
    lastmod     date     NOT NULL,
    revision    smallint NOT NULL,
    num_edits   smallint NOT NULL,
    num_users   smallint NOT NULL,
    PRIMARY KEY (entity_type, id)
);

CREATE TABLE extlinks (
    id    integer PRIMARY KEY,
    site  text    NOT NULL,
    value text    NOT NULL
);

-- Split like entry_meta: kind is 'cv', 'ch' or 'sf'. The kind also decides the
-- URL path, so it has to survive: cv/20339 -> t.vndb.org/cv/39/20339.jpg
CREATE TABLE images (
    kind              text     NOT NULL,
    num               integer  NOT NULL,
    width             smallint NOT NULL,
    height            smallint NOT NULL,
    c_votecount       smallint NOT NULL,
    c_sexual_avg      smallint NOT NULL,
    c_sexual_stddev   smallint NOT NULL,
    c_violence_avg    smallint NOT NULL,
    c_violence_stddev smallint NOT NULL,
    c_weight          smallint NOT NULL,
    PRIMARY KEY (kind, num)
);

CREATE TABLE producers (
    id          integer PRIMARY KEY,
    type        text    NOT NULL,
    lang        text    NOT NULL,
    name        text    NOT NULL,
    latin       text,
    alias       text    NOT NULL,
    description text    NOT NULL
);

CREATE TABLE producers_extlinks (
    id   integer NOT NULL,
    link integer NOT NULL,
    PRIMARY KEY (id, link)
);

CREATE TABLE producers_relations (
    id       integer NOT NULL,
    pid      integer NOT NULL,
    relation text    NOT NULL,
    PRIMARY KEY (id, pid)
);

-- released is YYYYMMDD with 99 for an unknown part and 9999 for "no date
-- announced", kept in the dump's own encoding.
CREATE TABLE releases (
    id           integer  PRIMARY KEY,
    gtin         bigint   NOT NULL,
    olang        text     NOT NULL,
    released     integer  NOT NULL,
    voiced       smallint NOT NULL,
    reso_x       smallint NOT NULL,
    reso_y       smallint NOT NULL,
    minage       smallint,
    ani_story    smallint NOT NULL,
    ani_ero      smallint NOT NULL,
    ani_story_sp smallint,
    ani_story_cg smallint,
    ani_cutscene smallint,
    ani_ero_sp   smallint,
    ani_ero_cg   smallint,
    ani_bg       boolean,
    ani_face     boolean,
    has_ero      boolean  NOT NULL,
    patch        boolean  NOT NULL,
    freeware     boolean  NOT NULL,
    uncensored   boolean,
    official     boolean  NOT NULL,
    catalog      text     NOT NULL,
    notes        text     NOT NULL,
    engine       integer
);

CREATE TABLE releases_drm (
    id    integer NOT NULL,
    drm   integer NOT NULL,
    notes text    NOT NULL,
    PRIMARY KEY (id, drm)
);

CREATE TABLE releases_extlinks (
    id   integer NOT NULL,
    link integer NOT NULL,
    PRIMARY KEY (id, link)
);

CREATE TABLE releases_images (
    id    integer NOT NULL,
    img   integer NOT NULL,
    vid   integer,
    itype text    NOT NULL,
    lang  text[],
    PRIMARY KEY (id, img)
);

CREATE TABLE releases_media (
    id     integer  NOT NULL,
    medium text     NOT NULL,
    qty    smallint NOT NULL,
    PRIMARY KEY (id, medium, qty)
);

CREATE TABLE releases_platforms (
    id       integer NOT NULL,
    platform text    NOT NULL,
    PRIMARY KEY (id, platform)
);

CREATE TABLE releases_producers (
    id        integer NOT NULL,
    pid       integer NOT NULL,
    developer boolean NOT NULL,
    publisher boolean NOT NULL,
    PRIMARY KEY (id, pid)
);

CREATE TABLE releases_supersedes (
    id  integer NOT NULL,
    rid integer NOT NULL,
    PRIMARY KEY (id, rid)
);

CREATE TABLE releases_titles (
    id    integer NOT NULL,
    lang  text    NOT NULL,
    mtl   boolean NOT NULL,
    title text,
    latin text,
    PRIMARY KEY (id, lang)
);

CREATE TABLE releases_vn (
    id    integer NOT NULL,
    vid   integer NOT NULL,
    rtype text    NOT NULL,
    PRIMARY KEY (id, vid)
);

-- staff carries no name: it lives in staff_alias, and main points at the alias
-- that is the person's primary one. lang belongs to the person and is what
-- decides latin vs original, not the alias row.
CREATE TABLE staff (
    id          integer PRIMARY KEY,
    gender      text    NOT NULL,
    lang        text    NOT NULL,
    main        integer NOT NULL,
    description text    NOT NULL,
    prod        integer
);

-- aid is globally unique and is what vn_staff and vn_seiyuu reference, so it
-- stays the key rather than (id, name).
CREATE TABLE staff_alias (
    id    integer NOT NULL,
    aid   integer PRIMARY KEY,
    name  text    NOT NULL,
    latin text
);

CREATE TABLE staff_extlinks (
    id   integer NOT NULL,
    link integer NOT NULL,
    PRIMARY KEY (id, link)
);

CREATE TABLE tags (
    id           integer  PRIMARY KEY,
    cat          text     NOT NULL,
    defaultspoil smallint NOT NULL,
    searchable   boolean  NOT NULL,
    applicable   boolean  NOT NULL,
    name         text     NOT NULL,
    alias        text     NOT NULL,
    description  text     NOT NULL,
    c_items      integer  NOT NULL DEFAULT 0
);

CREATE TABLE tags_parents (
    id     integer NOT NULL,
    parent integer NOT NULL,
    main   boolean NOT NULL,
    PRIMARY KEY (id, parent)
);

-- uid is replaced by counts, resolved at load time from users.perm_tag:
-- counts = NOT ignore AND (the voter is unknown OR still allowed to tag).
-- An unknown voter is allowed through, matching vndb's LEFT JOIN.
CREATE TABLE tags_vn (
    date    date     NOT NULL,
    tag     integer  NOT NULL,
    vid     integer  NOT NULL,
    vote    smallint NOT NULL,
    spoiler smallint,
    ignore  boolean  NOT NULL,
    lie     boolean,
    notes   text     NOT NULL,
    counts  boolean  NOT NULL
);

CREATE TABLE traits (
    id           integer  PRIMARY KEY,
    gid          integer,
    gorder       smallint NOT NULL,
    defaultspoil smallint NOT NULL,
    sexual       boolean  NOT NULL,
    searchable   boolean  NOT NULL,
    applicable   boolean  NOT NULL,
    name         text     NOT NULL,
    alias        text     NOT NULL,
    description  text     NOT NULL,
    c_items      integer  NOT NULL DEFAULT 0
);

CREATE TABLE traits_parents (
    id     integer NOT NULL,
    parent integer NOT NULL,
    main   boolean NOT NULL,
    PRIMARY KEY (id, parent)
);

-- image is deprecated upstream; c_image is the cover actually in use. Both are
-- 'cv' ids. c_released and the three arrays are not in the dump and are filled
-- by the derived step.
CREATE TABLE vn (
    id           integer  PRIMARY KEY,
    image        integer,
    c_image      integer,
    olang        text     NOT NULL,
    c_votecount  integer  NOT NULL,
    c_rating     smallint,
    c_average    smallint,
    c_length     smallint,
    c_lengthnum  smallint NOT NULL,
    length       smallint NOT NULL,
    devstatus    smallint NOT NULL,
    alias        text     NOT NULL,
    description  text     NOT NULL,
    c_released   integer  NOT NULL DEFAULT 0,
    c_languages  text[]   NOT NULL DEFAULT '{}',
    c_platforms  text[]   NOT NULL DEFAULT '{}',
    c_developers integer[] NOT NULL DEFAULT '{}'
);

CREATE TABLE vn_anime (
    id  integer NOT NULL,
    aid integer NOT NULL,
    PRIMARY KEY (id, aid)
);

CREATE TABLE vn_editions (
    id       integer  NOT NULL,
    lang     text,
    eid      smallint NOT NULL,
    official boolean  NOT NULL,
    name     text     NOT NULL,
    PRIMARY KEY (id, eid)
);

CREATE TABLE vn_extlinks (
    id   integer NOT NULL,
    link integer NOT NULL,
    PRIMARY KEY (id, link)
);

CREATE TABLE vn_relations (
    id       integer NOT NULL,
    vid      integer NOT NULL,
    relation text    NOT NULL,
    official boolean NOT NULL,
    PRIMARY KEY (id, vid)
);

CREATE TABLE vn_screenshots (
    id  integer NOT NULL,
    scr integer NOT NULL,
    rid integer,
    PRIMARY KEY (id, scr)
);

CREATE TABLE vn_seiyuu (
    id   integer NOT NULL,
    cid  integer NOT NULL,
    aid  integer NOT NULL,
    note text    NOT NULL,
    PRIMARY KEY (id, aid, cid)
);

CREATE TABLE vn_staff (
    id   integer  NOT NULL,
    aid  integer  NOT NULL,
    role text     NOT NULL,
    eid  smallint,
    note text     NOT NULL
);

CREATE TABLE vn_titles (
    id       integer NOT NULL,
    lang     text    NOT NULL,
    official boolean NOT NULL,
    title    text    NOT NULL,
    latin    text,
    PRIMARY KEY (id, lang)
);

CREATE TABLE wikidata (
    id                 integer PRIMARY KEY,
    enwiki             text,
    jawiki             text,
    website            text[],
    vndb               text[],
    mobygames          text[],
    mobygames_company  text[],
    gamefaqs_game      integer[],
    gamefaqs_company   integer[],
    anidb_anime        integer[],
    anidb_person       integer[],
    ann_anime          integer[],
    ann_manga          integer[],
    musicbrainz_artist uuid[],
    twitter            text[],
    vgmdb_product      integer[],
    vgmdb_artist       integer[],
    discogs_artist     integer[],
    acdb_char          integer[],
    acdb_source        integer[],
    indiedb_game       text[],
    howlongtobeat      integer[],
    crunchyroll        text[],
    igdb_game          text[],
    giantbomb          text[],
    pcgamingwiki       text[],
    steam              integer[],
    gog                text[],
    pixiv_user         integer[],
    doujinshi_author   integer[],
    soundcloud         text[],
    humblestore        text[],
    itchio             text[],
    playstation_jp     text[],
    playstation_na     text[],
    playstation_eu     text[],
    lutris             text[],
    wine               integer[],
    mobygames_game     integer[]
);
