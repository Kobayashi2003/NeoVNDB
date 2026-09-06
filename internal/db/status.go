package db

import (
	"context"
	"time"
)

type Status struct {
	Server    string
	Database  string
	User      string
	SizeBytes int64
	Latency   time.Duration

	Acquired int32
	Idle     int32

	// One entry per existing generation schema, live first.
	Generations []*Generation
	// True when the live generation was built by DDL that no longer matches
	// the source: an import is needed to pick the changes up.
	DDLStale bool

	Tables []TableStat
}

type TableStat struct {
	Name string
	Rows int64
}

func (s *Store) Status(ctx context.Context) (*Status, error) {
	started := time.Now()
	st := &Status{}

	err := s.pool.QueryRow(ctx, `
		SELECT split_part(version(), ' on ', 1),
		       current_database(),
		       current_user,
		       pg_database_size(current_database())
	`).Scan(&st.Server, &st.Database, &st.User, &st.SizeBytes)
	if err != nil {
		return nil, err
	}
	st.Latency = time.Since(started)

	stat := s.pool.Stat()
	st.Acquired = stat.AcquiredConns()
	st.Idle = stat.IdleConns()

	current, err := DDLChecksum()
	if err != nil {
		return nil, err
	}
	for _, schema := range []string{SchemaLive, SchemaNext, SchemaPrev} {
		g, err := s.Describe(ctx, schema)
		if err != nil {
			return nil, err
		}
		if g == nil {
			continue
		}
		if schema == SchemaLive && g.DDLChecksum != current {
			st.DDLStale = true
		}
		st.Generations = append(st.Generations, g)
	}

	if st.Tables, err = s.tableStats(ctx); err != nil {
		return nil, err
	}
	return st, nil
}

// Row counts come from planner statistics rather than COUNT(*): this is a
// status readout and chars_traits alone is around three million rows. Freshly
// loaded tables read zero until ANALYZE runs.
func (s *Store) tableStats(ctx context.Context) ([]TableStat, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT relname, GREATEST(n_live_tup, 0)
		  FROM pg_stat_user_tables
		 WHERE schemaname = $1
		 ORDER BY relname
	`, SchemaLive)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var stats []TableStat
	for rows.Next() {
		var t TableStat
		if err := rows.Scan(&t.Name, &t.Rows); err != nil {
			return nil, err
		}
		stats = append(stats, t)
	}
	return stats, rows.Err()
}
