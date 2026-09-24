package trait

import (
	"context"

	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/db"
	"github.com/kobayashi/neovndb/internal/db/gen"
	"github.com/kobayashi/neovndb/internal/vndb"
)

// loadGroup leaves a trait with no group as null, which is what a top-level
// group trait itself is.
func loadGroup(ctx context.Context, r *Resolver, page []gen.Trait,
	sel query.Selection, byID map[int32]map[string]any) error {

	rows, err := r.q.TraitGroups(ctx, idsOf(page))
	if err != nil {
		return err
	}

	// Group names are translated here too, where the group rows are in hand; an
	// English heading over translated traits would look broken.
	var groups *db.Translations
	if sel.Has("group_translation") {
		names := make([]string, len(rows))
		for i, g := range rows {
			names[i] = g.GroupName
		}
		if groups, err = r.store.Translations(ctx, names, nil); err != nil {
			return err
		}
	}

	for _, g := range rows {
		obj, ok := byID[g.ID]
		if !ok {
			continue
		}
		if sel.Has("group_id") {
			obj["group_id"] = vndb.FormatID(vndb.TypeTrait, g.GroupID)
		}
		if sel.Has("group_name") {
			obj["group_name"] = g.GroupName
		}
		if sel.Has("group_translation") {
			obj["group_translation"] = query.EmptyToNil(groups.Name(g.GroupName))
		}
	}
	return nil
}

// loadTranslation fills the target-language name and description, looked up
// separately. A trait with neither gets null, not an object of empty strings.
func loadTranslation(ctx context.Context, r *Resolver, page []gen.Trait,
	sel query.Selection, byID map[int32]map[string]any) error {

	// Descriptions only when asked for: most callers are chips that need the
	// name alone.
	wantName := sel.Wants("translation", "name")
	wantText := sel.Wants("translation", "description")
	names := make([]string, 0, len(page))
	texts := make([]string, 0, len(page))
	for _, t := range page {
		names = append(names, t.Name)
		if wantText {
			texts = append(texts, t.Description)
		}
	}
	found, err := r.store.Translations(ctx, names, texts)
	if err != nil {
		return err
	}

	for _, t := range page {
		obj, ok := byID[t.ID]
		if !ok {
			continue
		}
		name, description := found.Name(t.Name), found.Passage(t.Description)
		if name == "" && description == "" {
			obj["translation"] = nil
			continue
		}
		// Only the halves that were asked for: a null for one that was never
		// looked up would read as "nobody has translated this".
		out := map[string]any{"lang": found.Lang}
		if wantName {
			out["name"] = query.EmptyToNil(name)
		}
		if wantText {
			out["description"] = query.EmptyToNil(description)
		}
		obj["translation"] = out
	}
	return nil
}

func loadParents(ctx context.Context, r *Resolver, page []gen.Trait,
	sel query.Selection, byID map[int32]map[string]any) error {

	rows, err := r.q.TraitParents(ctx, idsOf(page))
	if err != nil {
		return err
	}
	edges := make([]query.Edge, len(rows))
	for i, p := range rows {
		edges[i] = query.Edge{Parent: p.TraitID, Child: p.Parent,
			Attrs: map[string]any{"main": p.Main}}
	}
	return query.Relate(ctx, r.cat, vndb.TypeTrait, "parents", edges, sel, byID)
}

func loadChildren(ctx context.Context, r *Resolver, page []gen.Trait,
	sel query.Selection, byID map[int32]map[string]any) error {

	rows, err := r.q.TraitChildren(ctx, idsOf(page))
	if err != nil {
		return err
	}
	edges := make([]query.Edge, len(rows))
	for i, c := range rows {
		edges[i] = query.Edge{Parent: c.TraitID, Child: c.Child,
			Attrs: map[string]any{"main": c.Main}}
	}
	return query.Relate(ctx, r.cat, vndb.TypeTrait, "children", edges, sel, byID)
}

func idsOf(page []gen.Trait) []int32 {
	ids := make([]int32, len(page))
	for i, t := range page {
		ids[i] = t.ID
	}
	return ids
}
