-- Descriptions (a release's notes) as the description= filter searches them:
-- markup stripped, then through search_norm_term like every search label, so
-- a query is normalised and matched the same way. Stored normalised so the
-- trigram index's recheck reads text rather than renormalising every row.
-- Filled and indexed by derive/05_text.sql. A file of its own, so a
-- generation from before it can be given one (db.BuildSearchText).
CREATE TABLE search_text (
    entity_type char(1) NOT NULL,
    id          integer NOT NULL,
    body        text    NOT NULL COLLATE "C",
    PRIMARY KEY (entity_type, id)
);
