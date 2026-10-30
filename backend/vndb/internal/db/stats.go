package db

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/kobayashi/neovndb/internal/vndb"
)

// Count is one value of a field and how many entries hold it.
type Count struct {
	Key   string `json:"key"`
	Count int64  `json:"count"`
}

// Ranked is one entry and how many of another it is counted against: a
// producer and its titles, a tag and its titles.
type Ranked struct {
	ID string `json:"id"`
	// Latin where there is one; the original script then goes in Original.
	Name     string  `json:"name"`
	Original *string `json:"original"`
	// The project's translation of a tag or trait name, filled by the caller.
	Translation *string `json:"translation,omitempty"`
	Count       int64   `json:"count"`
}

// BySex is one count per character sex: "f", "m", "b" (both), "n" (sexless)
// and "u" for a sex not given. The reader picks one or adds them up.
type BySex map[string][]Count

// SiteStats is the whole live generation counted, for the public statistics
// page: how much of each kind there is, when it came in, and how its fields
// spread.
type SiteStats struct {
	Totals []Count `json:"totals"`
	// Entries created on vndb per month, by entity type (v, r, p, c, s).
	Added map[string][]Count `json:"added"`

	VNYears     []Count `json:"vn_years"`
	VNLanguages []Count `json:"vn_languages"`
	VNPlatforms []Count `json:"vn_platforms"`
	VNLengths   []Count `json:"vn_lengths"`
	VNStatus    []Count `json:"vn_status"`
	// Bayesian rating by half point, keyed ×10 (65 is 6.5 to 6.99); a 10
	// counts with 9.5.
	VNRatings []Count `json:"vn_ratings"`
	// Count is the rating ×100 here, of titles with 100 votes or more.
	VNTopRated  []Ranked `json:"vn_top_rated"`
	VNMostVoted []Ranked `json:"vn_most_voted"`

	ReleaseYears     []Count `json:"release_years"`
	ReleasePlatforms []Count `json:"release_platforms"`
	ReleaseLanguages []Count `json:"release_languages"`
	ReleaseAges      []Count `json:"release_ages"`
	ReleaseVoiced    []Count `json:"release_voiced"`
	// Releases that are each of: official, freeware, a patch, erotic,
	// uncensored.
	ReleaseKinds   []Count  `json:"release_kinds"`
	ReleaseEngines []Count  `json:"release_engines"`
	Developers     []Ranked `json:"developers"`
	Publishers     []Ranked `json:"publishers"`
	ProducerTypes  []Count  `json:"producer_types"`
	ProducerLangs  []Count  `json:"producer_languages"`

	CharSex    []Count `json:"char_sex"`
	CharGender []Count `json:"char_gender"`
	CharRoles  BySex   `json:"char_roles"`
	// Years, 1-100: past that an age is a dragon's or a joke's.
	CharAges BySex `json:"char_ages"`
	// Centimetres, 50-250.
	CharHeights BySex `json:"char_heights"`
	// Bust in centimetres, 40-150.
	CharBust  BySex `json:"char_bust"`
	CharCups  BySex `json:"char_cups"`
	CharBlood BySex `json:"char_blood"`
	// Birth month, 1-12.
	CharBirthMonths BySex `json:"char_birth_months"`

	StaffGender []Count             `json:"staff_gender"`
	StaffLangs  []Count             `json:"staff_languages"`
	StaffRoles  []Count             `json:"staff_roles"`
	StaffTop    map[string][]Ranked `json:"staff_top"`
	Seiyuu      []Ranked            `json:"seiyuu"`

	TagCategories []Count             `json:"tag_categories"`
	Tags          map[string][]Ranked `json:"tags"`
	TraitGroups   []Ranked            `json:"trait_groups"`
	Traits        map[string][]Ranked `json:"traits"`
}

// statsTop is how many entries each ranking keeps.
const statsTop = 15

// SiteStats counts the live generation. It reads whole tables, seconds of
// work, so callers keep the answer for the generation rather than ask again.
func (s *Store) SiteStats(ctx context.Context) (*SiteStats, error) {
	out := &SiteStats{Added: map[string][]Count{}, StaffTop: map[string][]Ranked{},
		Tags: map[string][]Ranked{}, Traits: map[string][]Ranked{}}

	counted := []struct {
		into *[]Count
		sql  string
	}{
		{&out.Totals, `SELECT entity_type, COUNT(*) FROM entry_meta GROUP BY 1 ORDER BY 2 DESC`},
		// 0 is no release yet and 9999xxxx is "TBA"; neither is a year.
		{&out.VNYears, `SELECT c_released / 10000, COUNT(*) FROM vn
			WHERE c_released > 0 AND c_released < 99990000 GROUP BY 1 ORDER BY 1`},
		{&out.VNLanguages, `SELECT olang, COUNT(*) FROM vn GROUP BY 1 ORDER BY 2 DESC LIMIT 15`},
		{&out.VNPlatforms, `SELECT p, COUNT(*) FROM vn, unnest(c_platforms) p
			GROUP BY 1 ORDER BY 2 DESC LIMIT 15`},
		{&out.VNLengths, `SELECT length, COUNT(*) FROM vn GROUP BY 1 ORDER BY 1`},
		{&out.VNStatus, `SELECT devstatus, COUNT(*) FROM vn GROUP BY 1 ORDER BY 1`},
		{&out.VNRatings, `SELECT LEAST(c_rating / 50, 19) * 5, COUNT(*) FROM vn
			WHERE c_rating IS NOT NULL GROUP BY 1 ORDER BY 1`},

		{&out.ReleaseYears, `SELECT released / 10000, COUNT(*) FROM releases
			WHERE released > 0 AND released < 99990000 GROUP BY 1 ORDER BY 1`},
		{&out.ReleasePlatforms, `SELECT platform, COUNT(*) FROM releases_platforms
			GROUP BY 1 ORDER BY 2 DESC LIMIT 15`},
		{&out.ReleaseLanguages, `SELECT lang, COUNT(*) FROM releases_titles
			GROUP BY 1 ORDER BY 2 DESC LIMIT 15`},
		{&out.ReleaseAges, `SELECT minage, COUNT(*) FROM releases
			WHERE minage IS NOT NULL GROUP BY 1 ORDER BY 1`},
		{&out.ReleaseVoiced, `SELECT voiced, COUNT(*) FROM releases
			WHERE voiced > 0 GROUP BY 1 ORDER BY 1`},
		{&out.ReleaseKinds, `SELECT unnest(ARRAY['official', 'freeware', 'patch', 'erotic', 'uncensored']),
			       unnest(ARRAY[o, f, p, e, u]) FROM (SELECT
			COUNT(*) FILTER (WHERE official) AS o, COUNT(*) FILTER (WHERE freeware) AS f,
			COUNT(*) FILTER (WHERE patch) AS p, COUNT(*) FILTER (WHERE has_ero) AS e,
			COUNT(*) FILTER (WHERE uncensored) AS u FROM releases) c`},
		{&out.ReleaseEngines, `SELECT e.name, COUNT(*) FROM releases r JOIN engines e ON e.id = r.engine
			GROUP BY 1 ORDER BY 2 DESC LIMIT 15`},
		{&out.ProducerTypes, `SELECT type, COUNT(*) FROM producers GROUP BY 1 ORDER BY 2 DESC`},
		{&out.ProducerLangs, `SELECT lang, COUNT(*) FROM producers GROUP BY 1 ORDER BY 2 DESC LIMIT 15`},

		{&out.CharSex, `SELECT sex, COUNT(*) FROM chars WHERE sex <> '' GROUP BY 1 ORDER BY 2 DESC`},
		{&out.CharGender, `SELECT gender, COUNT(*) FROM chars WHERE gender <> '' GROUP BY 1 ORDER BY 2 DESC`},

		{&out.StaffGender, `SELECT gender, COUNT(*) FROM staff WHERE gender <> '' GROUP BY 1 ORDER BY 2 DESC`},
		{&out.StaffLangs, `SELECT lang, COUNT(*) FROM staff GROUP BY 1 ORDER BY 2 DESC LIMIT 15`},
		{&out.StaffRoles, `SELECT vs.role, COUNT(DISTINCT sa.id) FROM vn_staff vs
			JOIN staff_alias sa ON sa.aid = vs.aid GROUP BY 1 ORDER BY 2 DESC`},
		{&out.TagCategories, `SELECT cat, COUNT(*) FROM tags GROUP BY 1 ORDER BY 2 DESC`},
	}
	for _, c := range counted {
		got, err := s.counts(ctx, c.sql)
		if err != nil {
			return nil, err
		}
		*c.into = got
	}

	// Each counted per sex, keyed by it in the row's first column.
	bySex := []struct {
		into *BySex
		sql  string
	}{
		{&out.CharRoles, `SELECT c.sex, cv.role, COUNT(DISTINCT c.id) FROM chars_vns cv
			JOIN chars c ON c.id = cv.id GROUP BY 1, 2 ORDER BY 3 DESC`},
		{&out.CharAges, `SELECT sex, age, COUNT(*) FROM chars WHERE age BETWEEN 1 AND 100
			GROUP BY 1, 2 ORDER BY 2`},
		{&out.CharHeights, `SELECT sex, height, COUNT(*) FROM chars WHERE height BETWEEN 50 AND 250
			GROUP BY 1, 2 ORDER BY 2`},
		{&out.CharBust, `SELECT sex, s_bust, COUNT(*) FROM chars WHERE s_bust BETWEEN 40 AND 150
			GROUP BY 1, 2 ORDER BY 2`},
		{&out.CharCups, `SELECT sex, cup_size, COUNT(*) FROM chars WHERE cup_size <> ''
			GROUP BY 1, 2 ORDER BY CASE cup_size WHEN 'AAA' THEN 0 WHEN 'AA' THEN 1 ELSE 2 END, cup_size`},
		{&out.CharBlood, `SELECT sex, bloodt, COUNT(*) FROM chars WHERE bloodt <> 'unknown'
			GROUP BY 1, 2 ORDER BY 3 DESC`},
		{&out.CharBirthMonths, `SELECT sex, birthday / 100, COUNT(*) FROM chars WHERE birthday > 0
			GROUP BY 1, 2 ORDER BY 2`},
	}
	for _, b := range bySex {
		got, err := s.bySex(ctx, b.sql)
		if err != nil {
			return nil, err
		}
		*b.into = got
	}

	rows, err := s.pool.Query(ctx, `
		SELECT entity_type, to_char(created, 'YYYY-MM'), COUNT(*) FROM entry_meta
		 WHERE entity_type IN ('v', 'r', 'p', 'c', 's') GROUP BY 1, 2 ORDER BY 1, 2`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var kind string
		var c Count
		if err := rows.Scan(&kind, &c.Key, &c.Count); err != nil {
			return nil, err
		}
		out.Added[kind] = append(out.Added[kind], c)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	ranked := []struct {
		into *[]Ranked
		kind string
		sql  string
	}{
		// Named by the title in the original language, as a card names it.
		{&out.VNTopRated, vndb.TypeVN, `SELECT '', v.id, t.title, t.latin, v.c_rating::bigint FROM vn v
			JOIN vn_titles t ON t.id = v.id AND t.lang = v.olang
			WHERE v.c_votecount >= 100 AND v.c_rating IS NOT NULL ORDER BY 5 DESC, v.id LIMIT $1`},
		{&out.VNMostVoted, vndb.TypeVN, `SELECT '', v.id, t.title, t.latin, v.c_votecount::bigint FROM vn v
			JOIN vn_titles t ON t.id = v.id AND t.lang = v.olang ORDER BY 5 DESC, v.id LIMIT $1`},
		{&out.Developers, vndb.TypeProducer, `SELECT '', p.id, p.name, p.latin, COUNT(*) FROM vn, unnest(vn.c_developers) d(pid)
			JOIN producers p ON p.id = d.pid GROUP BY p.id ORDER BY 5 DESC, p.id LIMIT $1`},
		{&out.Publishers, vndb.TypeProducer, `SELECT '', p.id, p.name, p.latin, COUNT(DISTINCT rv.vid) FROM releases_producers rp
			JOIN releases r ON r.id = rp.id AND r.official
			JOIN releases_vn rv ON rv.id = rp.id
			JOIN producers p ON p.id = rp.pid
			WHERE rp.publisher GROUP BY p.id ORDER BY 5 DESC, p.id LIMIT $1`},
		// People by how many characters they voiced, named by their main name.
		{&out.Seiyuu, vndb.TypeStaff, `SELECT '', s.id, m.name, m.latin, COUNT(DISTINCT vs.cid) FROM vn_seiyuu vs
			JOIN staff_alias sa ON sa.aid = vs.aid
			JOIN staff s ON s.id = sa.id
			JOIN staff_alias m ON m.aid = s.main
			GROUP BY s.id, m.name, m.latin ORDER BY 5 DESC, s.id LIMIT $1`},
		{&out.TraitGroups, vndb.TypeTrait, `SELECT '', g.id, g.name, NULL::text, COUNT(DISTINCT ct.id) FROM chars_traits ct
			JOIN traits t ON t.id = ct.tid
			JOIN traits g ON g.id = t.gid
			WHERE ct.spoil = 0 AND NOT ct.lie GROUP BY g.id ORDER BY 5 DESC, g.id LIMIT $1`},
	}
	for _, r := range ranked {
		got := map[string][]Ranked{}
		if err := s.rankedBy(ctx, got, r.kind, r.sql); err != nil {
			return nil, err
		}
		*r.into = got[""]
	}

	// Per role, the people credited on the most titles.
	if err := s.rankedBy(ctx, out.StaffTop, vndb.TypeStaff, `
		WITH counted AS (
			SELECT vs.role, sa.id AS sid, COUNT(DISTINCT vs.id) AS n FROM vn_staff vs
			  JOIN staff_alias sa ON sa.aid = vs.aid GROUP BY 1, 2),
		ranked AS (SELECT *, row_number() OVER (PARTITION BY role ORDER BY n DESC, sid) AS rk FROM counted)
		SELECT r.role, r.sid, m.name, m.latin, r.n FROM ranked r
		  JOIN staff s ON s.id = r.sid JOIN staff_alias m ON m.aid = s.main
		 WHERE r.rk <= $1 ORDER BY r.role, r.rk`); err != nil {
		return nil, err
	}
	// Tags per category and traits per group, by the titles or characters
	// carrying them (vndb's own count, children included).
	if err := s.rankedBy(ctx, out.Tags, vndb.TypeTag, `
		WITH ranked AS (SELECT *, row_number() OVER (PARTITION BY cat ORDER BY c_items DESC, id) AS rk
		                  FROM tags WHERE applicable)
		SELECT cat, id, name, NULL::text, c_items FROM ranked WHERE rk <= $1 ORDER BY cat, rk`); err != nil {
		return nil, err
	}
	// Keyed by the group's id, as TraitGroups names it.
	if err := s.rankedBy(ctx, out.Traits, vndb.TypeTrait, `
		WITH ranked AS (SELECT t.*, row_number() OVER (PARTITION BY t.gid ORDER BY t.c_items DESC, t.id) AS rk
		                  FROM traits t WHERE t.applicable AND t.gid IS NOT NULL)
		SELECT 'i' || gid, id, name, NULL::text, c_items FROM ranked WHERE rk <= $1 ORDER BY gid, rk`); err != nil {
		return nil, err
	}
	return out, nil
}

// TagNames is every tag and trait name the stats show, for translating.
func (m *SiteStats) TagNames() []string {
	var names []string
	for _, group := range []map[string][]Ranked{m.Tags, m.Traits, {"": m.TraitGroups}} {
		for _, list := range group {
			for _, r := range list {
				names = append(names, r.Name)
			}
		}
	}
	return names
}

// Translate puts a translation beside each tag and trait name that has one.
func (m *SiteStats) Translate(name func(string) string) {
	for _, group := range []map[string][]Ranked{m.Tags, m.Traits, {"": m.TraitGroups}} {
		for _, list := range group {
			for i := range list {
				if to := name(list[i].Name); to != "" {
					list[i].Translation = &to
				}
			}
		}
	}
}

func (s *Store) counts(ctx context.Context, sql string) ([]Count, error) {
	rows, err := s.pool.Query(ctx, sql)
	if err != nil {
		return nil, fmt.Errorf("stats: %w", err)
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (Count, error) {
		var c Count
		// A text value or a number, whichever the field is.
		var key any
		err := row.Scan(&key, &c.Count)
		if key != nil {
			c.Key = fmt.Sprint(key)
		}
		return c, err
	})
}

// bySex reads rows of (sex, key, count), a sex not given as "u".
func (s *Store) bySex(ctx context.Context, sql string) (BySex, error) {
	rows, err := s.pool.Query(ctx, sql)
	if err != nil {
		return nil, fmt.Errorf("stats: %w", err)
	}
	defer rows.Close()
	out := BySex{}
	for rows.Next() {
		var sex string
		var key any
		var c Count
		if err := rows.Scan(&sex, &key, &c.Count); err != nil {
			return nil, err
		}
		if sex == "" {
			sex = "u"
		}
		c.Key = fmt.Sprint(key)
		out[sex] = append(out[sex], c)
	}
	return out, rows.Err()
}

// rankedBy fills into from rows of (group, id, name, latin, count), ids of
// kind; $1 is how many to keep.
func (s *Store) rankedBy(ctx context.Context, into map[string][]Ranked, kind, sql string) error {
	rows, err := s.pool.Query(ctx, sql, statsTop)
	if err != nil {
		return fmt.Errorf("stats: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var group, name string
		var latin *string
		var id int32
		var n int64
		if err := rows.Scan(&group, &id, &name, &latin, &n); err != nil {
			return err
		}
		r := Ranked{ID: vndb.FormatID(kind, id), Name: name, Count: n}
		if latin != nil {
			r.Name, r.Original = *latin, &name
		}
		into[group] = append(into[group], r)
	}
	return rows.Err()
}
