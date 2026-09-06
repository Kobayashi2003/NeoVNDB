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

## Setup

Requires Go 1.24+, PostgreSQL 15+ and `sqlc` to regenerate the query layer.

```sh
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
| `db promote` | Swap `vndb_next` into place; refuses an unfinished import |
| `db rollback` | Swap `vndb_prev` back |
| `db drop <schema>` | Drop one generation; refuses the live one |
| `db verify` | Write and read through the generated queries, then roll back |

## Layout

```
cmd/neovndb/          single binary, one subcommand per role
internal/config/      environment settings
internal/db/
  ddl/01_mirror.sql   the 42 dump tables we import
  ddl/02_derived.sql  what vndb computes but does not export
  ddl/03_indexes.sql  every access path the API takes
  query/*.sql         sqlc source
  gen/                sqlc output, generated
  db.go               pool and transaction helpers
  generation.go       create, promote, roll back, drop
  status.go
  verify.go
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
- **No migrations.** Each generation is built fresh from the DDL, and its
  `import_info.ddl_checksum` says which version built it. `db status` reports
  when the live generation is behind the source.

## Reference

Conversion rules extracted from vndb's source (AGPL,
`code.blicky.net/yorhel/vndb`) are written up in `../../temp/`:
`vndb-source-answers.md`, `vndb-tag-score-formula.md`, `vndb-official-er.md`,
and the data-layer plan in `PLAN-data-layer.md`.
