# NeoVNDB

A local mirror of the VNDB database with a read-only API on top.

The database is a copy of the dump's own structure, not a redesign: same table
and column names, plus the derived tables and columns vndb maintains but does
not export. Everything is rebuilt from a weekly archive, so nothing in it is
authored here and nothing has to survive an import.

The mirror's scope is vndb data only. Readers' accounts and lists live beside
it in `backend/users`, with a database of their own; audio is not here yet.

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
mirror process at all. Nothing is resized: the mirror keeps vndb's files byte
for byte, and thumbnails are vndb's own (`cv.t` for covers wider than 256px,
`st` for screenshots).

`frontend/` asks for `/vndbserve/...` from the browser and
`NEOVNDB_API_BASE` (default `http://127.0.0.1:5090/vndbserve`) from the
server, so a deployment points that one variable at its own edge.

Caddy has no `.env`; it takes its settings from the environment, each with a
default that suits a local checkout. `start.ps1` sets all of them from the
services' own `.env` files, so a port or image directory changed there moves
the edge with it:

| Variable | Default | What it is |
| --- | --- | --- |
| `NEOVNDB_BIND` | `:5090` | where the edge listens |
| `VNDBSERVE_UPSTREAM` | `127.0.0.1:5100` | the read API |
| `IMGSERVE_UPSTREAM` | `127.0.0.1:5101` | the image mirror |
| `USERSERVE_UPSTREAM` | `127.0.0.1:5102` | the user service |
| `NEXT_UPSTREAM` | `127.0.0.1:3000` | the site |
| `NEOVNDB_IMAGE_DIR` | `../data/images` | stored images, served straight off disk |

## Running it

```powershell
.\start.ps1            # builds, starts all five, Ctrl+C stops them again
.\start.ps1 -Prod      # a production build of the frontend instead of the dev server
.\start.ps1 -NoImages  # draw the site without fetching a single cover
.\start.ps1 -Stop      # stop a run that was left behind
.\start.ps1 -Force     # take the ports from whatever already holds them
```

`-NoImages` is for working on the site away from the machine holding the image
mirror: no cover or screenshot is requested at all, and each one's box is still
drawn at the size it would have taken, so the layout being worked on is the
real one. The interface's own sprite icons -- flags, platforms -- are local and
still appear.

It refuses to start on a port that is already in use rather than guessing, waits
until each service actually answers, and prints the tail of a log for any that
does not. The three services' ports and the image directory come from their
`.env` files, not from the script, and are handed on to the edge; Next and the
edge keep 3000 and 5090. Each process logs to `<name>.out.log` and
`<name>.err.log` in its own directory.

By hand it is five processes, each from its own directory, each reading the
`.env` beside it -- which is also why the script sets a working directory per
process rather than running them all from the root:

```sh
cd backend/vndb  && go run ./cmd/neovndb serve     # :5100  the read API
cd backend/vndb  && go run ./cmd/neovndb images    # :5101  the image mirror
cd backend/users && go run ./cmd/users             # :5102  accounts and lists
cd frontend      && npm run dev                    # :3000  the site
cd edge          && caddy run                      # :5090  the only address
```

Then open <http://127.0.0.1:5090>.

`caddy run` must start from `edge/`, because the image roots in the snippet are
written relative to it. Open the site on :5090, never :3000: nothing but the
edge serves `/imgserve` and `/userserve`, and the dev server only accepts its
hot-reload connection from the edge's origin because `next.config.ts` names it
-- without that no page hydrates, which looks like images that never appear
and a header that never learns who is signed in. `npm run dev` is the one to
use while editing; `npm run build && npm start` serves a production build,
which is what the numbers in the CLS notes were measured against -- and which
will not pick up a source change until it is rebuilt.

Nothing here starts PostgreSQL. The read API also expects a promoted
generation: without one it starts and says so, and every query fails until
`db promote` has run.

## Setup

Requires Go 1.27+, Node 20.9+, PostgreSQL 15+, Caddy 2 for the edge, and
`sqlc` to regenerate the query layer. Each part reads the `.env` beside it;
every `.env.sample` lists every setting that part reads, with the value a
deployment wants. `.env` files are not in git.

```sh
cd backend/vndb
cp .env.sample .env          # adjust NEOVNDB_DB_URL
createdb neovndb
go run ./cmd/neovndb db init 20260819
go run ./cmd/neovndb db verify
go run ./cmd/neovndb update  # fetch and import the latest archive, then go live
go run ./cmd/neovndb trans seed   # the translation corpus kept in internal/trans/init.json

cd ../users
cp .env.sample .env          # adjust NEOVNDB_USERS_DB_URL
createdb neovndb_users       # the schema is applied when the service starts

cd ../../frontend
npm install                  # .env.sample documents its two settings; the defaults suit a checkout
```

For local work the `.env` files turn the limits off (0 means no ceiling) and
lower the bcrypt cost; `.env.sample` holds the numbers a deployment wants.

## Commands

`backend/vndb`, one binary with a subcommand per role (`go run ./cmd/neovndb
<command>`, or `bin/neovndb.exe` once `start.ps1` has built it):

| Command | What it does |
| --- | --- |
| `serve [--addr host:port]` | Run the read API |
| `images [--addr host:port]` | Run the image mirror; it also crawls ahead of readers every hour |
| `crawl [--limit n]` | Fetch images the database knows of and the disk lacks, now (`--limit 0`: all of them) |
| `import [--file p] [--promote] [--force]` | Load an archive into `vndb_next` |
| `update [--force]` | Import and go live if upstream is newer |
| `db status` | Generations, whether the live one matches current DDL, row counts |
| `db init <code>` | Build an empty `vndb_next` from the embedded DDL |
| `db check` | Compare `vndb_next` with the live generation and report what objects |
| `db promote [--force]` | Run `db check`, then swap `vndb_next` into place; refuses an unfinished import |
| `db rollback` | Swap `vndb_prev` back |
| `db drop <schema>` | Drop one generation; refuses the live one |
| `db verify` | Write and read through the generated queries, then roll back |
| `trans status` | What the translation corpus holds, and the language it is in |
| `trans seed [file]` | Load a corpus, by default `internal/trans/init.json`; refuses the whole file if any row loses its markup |

`backend/users` (`go run ./cmd/users`):

| Command | What it does |
| --- | --- |
| *(none)* | Run the user service; it also backs its database up on a schedule |
| `backup` | Dump the user database now, into `NEOVNDB_USERS_BACKUP_DIR` |

`frontend` (`npm run <script>`):

| Script | What it does |
| --- | --- |
| `dev` | The dev server; reach it through the edge |
| `build` / `start` | A production build, and serving it |
| `lint` | ESLint |
| `test` / `test:watch` | The unit tests in `tests/unit/`, once or on every change |
| `test:e2e` | The end-to-end tests in `tests/e2e/`, against the running site |
| `typecheck:tests` | Type-check the tests, which the app's own `tsc` leaves out |

## Tests

```sh
cd backend/vndb  && go test ./...
cd backend/users && go test ./...
cd frontend      && npm test
cd frontend      && npm run test:e2e   # needs the site up (start.ps1)
```

Only the end-to-end tests need a running service; they drive Chromium
through the edge (`E2E_BASE_URL`, default `http://127.0.0.1:5090`). The user service's storage tests need a
database and skip without one: point `NEOVNDB_USERS_TEST_DB_URL` at a database
whose name ends in `_test` (`createdb neovndb_users_test`). Every run empties
it, which is why any other name is refused. The same variable lets the
end-to-end tests start a throwaway user service of their own on :5199 and
exercise signed-in pages; without it those three skip. Frontend tests live in
`frontend/tests/`, never in `src/`.

## Scheduled work

Three things run on a schedule, and only one of them needs anything from
outside:

- **Updating the mirror** is left to the system's scheduler, which runs
  `neovndb update` from `backend/vndb` (it is a no-op when upstream has nothing
  newer, so daily is fine):

  ```powershell
  schtasks /Create /TN "NeoVNDB update" /SC DAILY /ST 05:00 /TR "cmd /c cd /d D:\path\to\NeoVNDB\backend\vndb && bin\neovndb.exe update >> update.log 2>&1"
  ```

  or a cron line / systemd timer running the same command.
- **Backing up the user database** is done by the user service itself: it
  checks hourly and dumps (`pg_dump`, custom format) when the newest copy is
  older than `NEOVNDB_USERS_BACKUP_EVERY` (a week), keeping the newest
  `NEOVNDB_USERS_BACKUP_KEEP`. Restore with
  `pg_restore --clean --if-exists -d <database url> <file>`.
- **Mirroring images ahead of readers** is done by the image mirror: every
  `NEOVNDB_IMAGE_CRAWL_EVERY` it fetches up to `NEOVNDB_IMAGE_CRAWL_PER_RUN`
  images, and their upstream thumbnails, that the database knows of and the disk
  does not hold, newest first and `NEOVNDB_IMAGE_CRAWL_DELAY` apart. The dump's
  `images` table is the list, so nothing is probed.

## Updating

```sh
cd backend/vndb && go run ./cmd/neovndb update   # no-op if upstream is already live
```

Run it while the read API is up: going live is one transaction, and responses
are cached under the generation, so readers move to the new data at once.

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
internal/trans/       translations of tag and trait text; init.json is the
                      corpus itself, the only copy, loaded by `trans seed`
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
  handlers.go         the handlers (query, relation graph, meta, health) and the JSON envelope
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
  others out of entries keyed to the old one. The key also carries the
  translation corpus's revision, which every `trans seed` bumps, so a changed
  translation is served at once too.
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
