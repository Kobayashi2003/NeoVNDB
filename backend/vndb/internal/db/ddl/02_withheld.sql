-- What all-ages mode leaves out (the read API's mask): works, releases and
-- characters for adults, and the tags and traits about sex. vndb has no such
-- mode. Filled by derive/06_withheld.sql. reason names the rule that caught a
-- row, for whoever asks why; nothing filters on it.
--   a  an adult release, or a work none of whose rated releases is for all
--   t  a work rated nowhere but tagged for sexual content
--   c  a character seen only in what is withheld
--   e  a tag about sex, or one under it
--   s  a trait about sex, or one under it
--
-- A file of its own so it can also be built into a live generation imported
-- before it existed (Store.BuildWithheld), without a whole import.
CREATE TABLE withheld (
    entity_type char(1) NOT NULL,
    id          integer NOT NULL,
    reason      char(1) NOT NULL,
    PRIMARY KEY (entity_type, id)
);
