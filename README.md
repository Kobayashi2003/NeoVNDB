# NeoVNDB

A local mirror of the VNDB database with a read-only API on top.

The database is a copy of the dump's own structure, not a redesign: same table
and column names, plus the derived tables and columns vndb maintains but does
not export. Everything is rebuilt from a weekly archive, so nothing in it is
authored here and nothing has to survive an import.

Scope is vndb data only. Users, collections, translations and audio are
separate applications.

## How data gets in

```
dl.vndb.org archive
      |  COPY, ids converted to int
      v
  vndb_next          built from internal/db/ddl, one generation
      |  derived step: tag scores, closures, search index, c_* columns
      v
  ALTER SCHEMA       vndb -> vndb_prev, vndb_next -> vndb   (one transaction)
      v
  vndb               what the API reads; always this name
```

Renames are transactional in Postgres, so going live is atomic and the
application never has to discover which generation it is talking to.
`vndb_prev` is kept for one cycle so a bad import can be rolled back in
seconds.

## Repository

```
backend/vndb/    the mirror: read API, image mirror, importer, data layer
backend/users/   accounts, sessions and the lists a reader keeps
edge/            the Caddy config: the one address everything is reached at
frontend/        the web client
docs/            design and structure notes
data/            archives and mirrored images, reproducible and not in git
```

Two Go modules, not one. `backend/vndb` is a pure function of a dump and never
migrates -- it rebuilds. `backend/users` holds the one thing here that cannot
be rebuilt from upstream, so it migrates and keeps its own database; separate
modules are what stops the second from reaching into the first.

Every command below runs from `backend/vndb/`.

## The edge

Nothing is reached on its own port. Four processes run -- the read API on
:5100, the image mirror on :5101, the user service on :5102 and Next on :3000
-- and Caddy is the only one anything talks to:

```sh
cd edge && caddy run              # http://127.0.0.1:5090
```

A local checkout goes through it too, so there is one set of addresses rather
than one that works here and another that works when served. `/vndbserve/*`,
`/imgserve/*` and `/userserve/*` reach the three services; everything else is
the site.

Each prefix exposes an allowlist of the routes the frontend uses and refuses
the rest without forwarding them, which is why `backend/vndb` contains no
notion of who may call it: its whole surface stays reachable on :5100, and
which part of it the world can reach is a question the edge answers. Images
that are already on disk are served by the file server and never reach the
mirror process at all.

`frontend/` asks for `/vndbserve/...` from the browser and
`NEOVNDB_API_BASE` (default `http://127.0.0.1:5090/vndbserve`) from the
server, so a deployment points that one variable at its own edge.

## Accounts carried over

`backend/users` can take on the database of the service this project replaces:

```sh
cd backend/users
go run ./cmd/users import-legacy postgres://user:pass@host/olddb
```

It reads the old side and never writes to it, does everything in one
transaction, and reports what it made so the counts can be compared with the
old database rather than taken on trust. A username already taken here is left
alone and named in the output: two rows are the same person only if someone
says so.

Passwords come across as they are. They are Werkzeug scrypt hashes, which
bcrypt cannot read and nothing but the password itself can convert -- so
`internal/auth` reads that format too and re-hashes the row the first time its
owner signs in. Nobody has to reset anything, and the old format retires one
sign-in at a time. Ratings are not carried over; nothing here keeps one.

## Setup

Requires Go 1.24+, PostgreSQL 15+, Caddy 2 for the edge, and `sqlc` to
regenerate the query layer.

```sh
cd backend/vndb
cp .env.sample .env          # adjust NEOVNDB_DB_URL
createdb neovndb
go run ./cmd/neovndb db init 20260819
go run ./cmd/neovndb db verify
```

## Commands

| Command | What it does |
| --- | --- |
| `db status` | Generations, whether the live one matches current DDL, row counts |
| `db init <code>` | Build an empty `vndb_next` from the embedded DDL |
| `db promote` | Run `db check`, then swap `vndb_next` into place; refuses an unfinished import |
| `db rollback` | Swap `vndb_prev` back |
| `db drop <schema>` | Drop one generation; refuses the live one |
| `db check` | Compare `vndb_next` with the live generation and report what objects |
| `db verify` | Write and read through the generated queries, then roll back |

## Updating

```sh
cd backend/vndb && go run ./cmd/neovndb update   # no-op if upstream is already live
```

One command for the weekly run and for a run by hand -- an update path that
only ever runs unattended is one nobody can reproduce when it fails. It stops
if upstream has nothing newer, and refuses to go backwards if upstream
republishes an older archive.

Before a generation goes live it is compared with the one it replaces. An
import can succeed in every mechanical sense and still be wrong: a truncated
archive parses, and a derive step whose joins match nothing writes no rows and
reports no error. A mirror of a dump has no invariant of its own to violate --
what it has is a predecessor. Three checks ship: a table that lost more than
`NEOVNDB_GUARD_MAX_LOSS` of its rows, a table that was not imported at all, and
a derived table that came back empty. They are an interface, so a deployment
that knows a table is expected to shrink adds or drops one. `-force` promotes
anyway.

## Layout

```
backend/vndb/
cmd/neovndb/          single binary, one subcommand per role
internal/config/      environment settings
internal/cache/       response cache: memory LRU or Redis
internal/dump/        fetch and stream the tar
internal/importer/    COPY the dump into a fresh generation
internal/vndb/        the dump's own encodings: ids, dates, extlinks, animation
internal/db/
  guard/              what makes a fresh generation unfit to go live
  ddl/01_mirror.sql   the 42 dump tables we import
  ddl/02_derived.sql  what vndb computes but does not export
  ddl/03_indexes.sql  every access path the API takes
  derive/*.sql        the derived step, run after COPY
  sql/*.sql           sqlc source
  gen/                sqlc output, generated
  db.go               pool and transaction helpers
  generation.go       create, promote, roll back, drop
  status.go
  verify.go
internal/api/
  server.go           routes and graceful shutdown
  handlers.go         the four handlers and the JSON envelope
  middleware.go       panic recovery and request logging
  cache.go            picking a backend, and the live generation's code
  query/              shared machinery: field tables, request parsing,
                      filter builder, paging, the type catalog
  vn/ release/ character/ producer/ staff/ tag/ trait/
                      one package per type, all seven the same four files:
                        resolver.go  Resolver, Registry, Objects, Resolve
                        fields.go    the field table
                        filters.go   filters, sorts, page spec
                        sources.go   the batched loaders
                      vn adds graph.go for the relation graph.
```

## Decisions worth knowing before reading the schema

- **ids are `integer`**, formatted as `v17` at the API edge. The dump's text
  ids sort lexically, which would put v10 before v9.
- **`images` and `entry_meta` are split** into `(kind, num)` and
  `(entity_type, id)`: their ids are polymorphic and an integer cannot carry
  the prefix. Every other id column has a fixed type, so it is a plain integer.
- **Enum-like columns are `text`**, not PG enums, so a new upstream platform
  cannot break an import. Labels come from `api.vndb.org/kana/schema`.
- **`tags_vn.uid` is replaced by `counts`**, resolved at load time against
  `users.perm_tag`. The users table is read during import but never stored, so
  no user data lands in the database. An unknown voter counts, matching vndb's
  `LEFT JOIN`.
- **No foreign keys.** They would validate every row during COPY; the dump is
  internally consistent and import verification checks integrity instead.
- **`tags_vn_direct` and `tags_vn_inherit` are separate.** Kana's `vn.tags`
  returns the direct scores; the `tag=` filter expands parents.
- **Responses are cached under the generation's code.** The database only
  changes when an import is promoted, so a rendered response stays correct
  until then. Putting the live generation's code at the front of every key
  means a promote makes the whole previous generation unreachable at once,
  with nothing to invalidate by hand. The key is built from the *parsed*
  request, so `fields=a,b` and `fields=b,a` are one entry. The live
  generation is read per request rather than remembered: that read is a
  fraction of a millisecond, and paying it is what keeps a promote from being
  followed by a window where some types answer out of the new generation and
  others out of entries keyed to the old one.
- **Every bound is a setting.** Page size, id-list length, field depth, the
  response cost ceiling, the graph's depth and node cap, and the request
  timeout all come from the environment (see `.env.sample`). They bound work
  rather than correctness, and what a deployment can afford differs; 0 turns
  a ceiling off.
- **No migrations.** Each generation is built fresh from the DDL, and its
  `import_info.ddl_checksum` says which version built it. `db status` reports
  when the live generation is behind the source.

## Reference

Conversion rules extracted from vndb's source (AGPL,
`code.blicky.net/yorhel/vndb`) are written up in `../../temp/`:
`vndb-source-answers.md`, `vndb-tag-score-formula.md`, `vndb-official-er.md`,
and the data-layer plan in `PLAN-data-layer.md`.
