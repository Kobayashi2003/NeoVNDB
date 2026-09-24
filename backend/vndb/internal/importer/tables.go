package importer

// What to do with each archive table. Rows go back to Postgres as COPY text,
// so types need no conversion; only id prefixes are stripped, and three
// tables change shape.

// spec describes one table. Usually only ids is set (columns whose 'v17'
// value becomes an integer); a table that changes shape sets columns and
// rewrite and builds the row itself.
type spec struct {
	table   string
	ids     []string
	columns []string
	rewrite func(fields map[string]string, out []string) ([]string, error)
}

// Tables we do not load at all: user-level detail we have no use for, plus
// vndb's own help pages. `users` is read during the import to resolve tag
// permissions but is never stored.
var skipped = map[string]bool{
	"ulist_vns":       true,
	"ulist_labels":    true,
	"image_votes":     true,
	"vn_image_votes":  true,
	"vn_length_votes": true,
	"rlists":          true,
	"quotes":          true,
	"docs":            true,
	"users":           true,
}

var specs = []spec{
	{table: "anime"},
	{table: "chars", ids: []string{"id", "image", "main"}},
	{table: "chars_alias", ids: []string{"id"}},
	{table: "chars_names", ids: []string{"id"}},
	{table: "chars_traits", ids: []string{"id", "tid"}},
	{table: "chars_vns", ids: []string{"id", "vid", "rid"}},
	{table: "drm"},
	{table: "engines"},
	{table: "extlinks"},
	{table: "producers", ids: []string{"id"}},
	{table: "producers_extlinks", ids: []string{"id"}},
	{table: "producers_relations", ids: []string{"id", "pid"}},
	{table: "releases", ids: []string{"id"}},
	{table: "releases_drm", ids: []string{"id"}},
	{table: "releases_extlinks", ids: []string{"id"}},
	{table: "releases_images", ids: []string{"id", "img", "vid"}},
	{table: "releases_media", ids: []string{"id"}},
	{table: "releases_platforms", ids: []string{"id"}},
	{table: "releases_producers", ids: []string{"id", "pid"}},
	{table: "releases_supersedes", ids: []string{"id", "rid"}},
	{table: "releases_titles", ids: []string{"id"}},
	{table: "releases_vn", ids: []string{"id", "vid"}},
	{table: "staff", ids: []string{"id", "prod"}},
	{table: "staff_alias", ids: []string{"id"}},
	{table: "staff_extlinks", ids: []string{"id"}},
	{table: "tags", ids: []string{"id"}},
	{table: "tags_parents", ids: []string{"id", "parent"}},
	{table: "traits", ids: []string{"id", "gid"}},
	{table: "traits_parents", ids: []string{"id", "parent"}},
	{table: "vn", ids: []string{"id", "image", "c_image"}},
	{table: "vn_anime", ids: []string{"id"}},
	{table: "vn_editions", ids: []string{"id"}},
	{table: "vn_extlinks", ids: []string{"id"}},
	{table: "vn_relations", ids: []string{"id", "vid"}},
	{table: "vn_screenshots", ids: []string{"id", "scr", "rid"}},
	{table: "vn_seiyuu", ids: []string{"id", "cid"}},
	{table: "vn_staff", ids: []string{"id"}},
	{table: "vn_titles", ids: []string{"id"}},
	{table: "wikidata"},

	// An image id carries a two-letter kind that decides its URL path, so it
	// splits rather than losing the prefix.
	{
		table: "images",
		columns: []string{"kind", "num", "width", "height", "c_votecount",
			"c_sexual_avg", "c_sexual_stddev", "c_violence_avg", "c_violence_stddev", "c_weight"},
		rewrite: func(f map[string]string, out []string) ([]string, error) {
			kind, num, err := splitID(f["id"])
			if err != nil {
				return nil, err
			}
			return append(out, kind, num, f["width"], f["height"], f["c_votecount"],
				f["c_sexual_avg"], f["c_sexual_stddev"], f["c_violence_avg"],
				f["c_violence_stddev"], f["c_weight"]), nil
		},
	},

	// entry_meta mixes every entity type under one id, so the type becomes its
	// own column.
	{
		table:   "entry_meta",
		columns: []string{"entity_type", "id", "created", "lastmod", "revision", "num_edits", "num_users"},
		rewrite: func(f map[string]string, out []string) ([]string, error) {
			kind, num, err := splitID(f["id"])
			if err != nil {
				return nil, err
			}
			return append(out, kind, num, f["created"], f["lastmod"],
				f["revision"], f["num_edits"], f["num_users"]), nil
		},
	},

	// uid is replaced by counts. The rewrite lives on the Importer rather than
	// here because it needs the permission set, which only the import pass
	// holds -- see Importer.tagVoteRow.
	{
		table:   "tags_vn",
		columns: []string{"date", "tag", "vid", "vote", "spoiler", "ignore", "lie", "notes", "counts"},
	},
}

func specFor(table string) (spec, bool) {
	for _, s := range specs {
		if s.table == table {
			return s, true
		}
	}
	return spec{}, false
}
