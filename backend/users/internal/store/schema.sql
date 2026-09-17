-- Everything this service owns. Its own database, not a schema beside the
-- mirror: the mirror's schemas are dropped and rebuilt from the dump every
-- week, and an account that lived next door would go with them.
--
-- Applied on startup and safe to re-apply, so a fresh checkout needs no
-- migration step to run. Once there are rows worth keeping, changes to this
-- file become migrations rather than edits -- which is the other reason this
-- is not part of the mirror: that half never migrates, it only rebuilds.

CREATE TABLE IF NOT EXISTS users (
    id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username      text        NOT NULL,
    email         text,
    password_hash text        NOT NULL,
    is_admin      boolean     NOT NULL DEFAULT false,
    created_at    timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive, so "Kobayashi" and "kobayashi" cannot both be taken.
CREATE UNIQUE INDEX IF NOT EXISTS users_username_key ON users (lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (lower(email)) WHERE email IS NOT NULL;

-- Sessions are rows rather than signed tokens. A signed token cannot be taken
-- back without a second table to say which ones were, and that table is this
-- one with extra steps; a row can be deleted. The cost is a lookup per
-- request, which is a primary-key read on a table with as many rows as there
-- are open browsers.
CREATE TABLE IF NOT EXISTS sessions (
    token      text        PRIMARY KEY,
    user_id    integer     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL
);

-- For "sign out everywhere", and for sweeping the expired.
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions (expires_at);

-- One table for all seven kinds. A list of characters and a list of visual
-- novels differ only in which letter their ids start with, and seven tables
-- that differ in nothing else is seven places to change anything.
CREATE TABLE IF NOT EXISTS collections (
    id         integer     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    integer     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    type       char(1)     NOT NULL,
    name       text        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, type, name)
);

-- The numeric half of an id, with the type on the collection -- the same rule
-- the mirror follows, where the prefix is implied by which column it is.
--
-- Nothing references the mirror. It is rebuilt from scratch every import, so a
-- foreign key into it would be a promise this service cannot keep; a mark is
-- an id the reader wrote down, and looking it up is the caller's job.
CREATE TABLE IF NOT EXISTS marks (
    collection_id integer     NOT NULL REFERENCES collections (id) ON DELETE CASCADE,
    item          integer     NOT NULL,
    marked_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (collection_id, item)
);

-- "Which of my lists hold v17" is the question every detail page asks, once
-- per page, and this is what makes it one index seek rather than a scan of
-- everything the reader has ever saved.
CREATE INDEX IF NOT EXISTS marks_item_idx ON marks (item);

-- What a reader thought of something, one to five.
--
-- Not hung off a collection the way a mark is. A thing can sit on several
-- lists at once and the reader still has exactly one opinion of it, so the
-- type has to live on this row rather than being implied by a list -- which is
-- also what makes "my rating" a property of the thing rather than of where it
-- was filed.
CREATE TABLE IF NOT EXISTS ratings (
    user_id  integer     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    type     char(1)     NOT NULL,
    item     integer     NOT NULL,
    rating   smallint    NOT NULL CHECK (rating BETWEEN 1 AND 5),
    rated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, type, item)
);
