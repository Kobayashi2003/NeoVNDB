package staff

import (
	"context"

	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/db/gen"
	"github.com/kobayashi/neovndb/internal/vndb"
)

// loadAliases serves name, original and the aliases fragment from one read:
// they are all rows of staff_alias, and name is the one staff.main points at.
func loadAliases(ctx context.Context, r *Resolver, page []gen.Staff,
	sel query.Selection, byID map[int32]map[string]any) error {

	main := make(map[int32]int32, len(page))
	for _, s := range page {
		main[s.ID] = s.Main
	}
	rows, err := r.q.StaffAliases(ctx, idsOf(page))
	if err != nil {
		return err
	}

	grouped := map[int32][]map[string]any{}
	for _, a := range rows {
		obj, ok := byID[a.StaffID]
		if !ok {
			continue
		}
		if a.Aid == main[a.StaffID] {
			if sel.Has("name") {
				obj["name"] = query.PreferLatin(a.Name, a.Latin)
			}
			if sel.Has("original") {
				obj["original"] = query.OriginalOf(a.Name, a.Latin)
			}
		}
		grouped[a.StaffID] = append(grouped[a.StaffID], map[string]any{
			"aid":      a.Aid,
			"name":     query.PreferLatin(a.Name, a.Latin),
			"original": query.OriginalOf(a.Name, a.Latin),
			"ismain":   a.IsMain,
		})
	}
	if !sel.Has("aliases") {
		return nil
	}
	for id, obj := range byID {
		obj["aliases"] = query.OrEmpty(grouped[id])
	}
	return nil
}

// loadExtLinks renders each stored (site, value) pair through the recipe
// table. A site with no recipe is dropped rather than shown broken.
func loadExtLinks(ctx context.Context, r *Resolver, page []gen.Staff,
	sel query.Selection, byID map[int32]map[string]any) error {

	rows, err := r.q.StaffExtLinks(ctx, idsOf(page))
	if err != nil {
		return err
	}
	grouped := map[int32][]vndb.ExtLink{}
	for _, l := range rows {
		if link, ok := vndb.BuildExtLink(l.Site, l.Value); ok {
			grouped[l.StaffID] = append(grouped[l.StaffID], link)
		}
	}
	for id, obj := range byID {
		obj["extlinks"] = query.OrEmpty(grouped[id])
	}
	return nil
}

func idsOf(page []gen.Staff) []int32 {
	ids := make([]int32, len(page))
	for i, s := range page {
		ids[i] = s.ID
	}
	return ids
}
