-- Its own database, apart from the mirror, which is rebuilt every import.
-- Applied on startup and idempotent; once real data exists, changes here
-- become migrations.

CREATE TABLE IF NOT EXISTS users (
    id            integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username      text        NOT NULL,
    email         text,
    password_hash text        NOT NULL,
    is_admin      boolean     NOT NULL DEFAULT false,
    created_at    timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness.
CREATE UNIQUE INDEX IF NOT EXISTS users_username_key ON users (lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key ON users (lower(email)) WHERE email IS NOT NULL;

-- Rows rather than signed tokens, so revoking is a delete.
CREATE TABLE IF NOT EXISTS sessions (
    token      text        PRIMARY KEY,
    user_id    integer     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL
);

-- For "sign out everywhere", and for sweeping the expired.
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions (expires_at);

-- One table for all seven types.
CREATE TABLE IF NOT EXISTS collections (
    id         integer     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    integer     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    type       char(1)     NOT NULL,
    name       text        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, type, name)
);

-- The numeric half of an id; the type is on the collection. No foreign key to
-- the mirror, which is rebuilt every import.
CREATE TABLE IF NOT EXISTS marks (
    collection_id integer     NOT NULL REFERENCES collections (id) ON DELETE CASCADE,
    item          integer     NOT NULL,
    marked_at     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (collection_id, item)
);

-- "Which of my lists hold v17", asked by every detail page.
CREATE INDEX IF NOT EXISTS marks_item_idx ON marks (item);

-- One to five, per item rather than per list, so the type lives on the row.
CREATE TABLE IF NOT EXISTS ratings (
    user_id  integer     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    type     char(1)     NOT NULL,
    item     integer     NOT NULL,
    rating   smallint    NOT NULL CHECK (rating BETWEEN 1 AND 5),
    rated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, type, item)
);

-- The reader's display preferences, as the site wrote them. Kept, not read:
-- what the fields mean is the site's business, so a new one needs nothing here.
CREATE TABLE IF NOT EXISTS prefs (
    user_id    integer     PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    value      jsonb       NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- A listing kept under a name: the type's page and the query of its address.
CREATE TABLE IF NOT EXISTS searches (
    id         integer     GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id    integer     NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    type       char(1)     NOT NULL,
    name       text        NOT NULL,
    query      text        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, type, name)
);
