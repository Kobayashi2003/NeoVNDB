package tag

import (
	"context"

	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/db/gen"
	"github.com/kobayashi/neovndb/internal/vndb"
)

// loadTranslation fills the target-language name and description, looked up
// separately. A tag with neither gets null, not an object of empty strings.
func loadTranslation(ctx context.Context, r *Resolver, page []gen.Tag,
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

func loadParents(ctx context.Context, r *Resolver, page []gen.Tag,
	sel query.Selection, byID map[int32]map[string]any) error {

	rows, err := r.q.TagParents(ctx, idsOf(page))
	if err != nil {
		return err
	}
	edges := make([]query.Edge, len(rows))
	for i, p := range rows {
		edges[i] = query.Edge{Parent: p.TagID, Child: p.Parent,
			Attrs: map[string]any{"main": p.Main}}
	}
	return query.Relate(ctx, r.cat, vndb.TypeTag, "parents", edges, sel, byID)
}

func loadChildren(ctx context.Context, r *Resolver, page []gen.Tag,
	sel query.Selection, byID map[int32]map[string]any) error {

	rows, err := r.q.TagChildren(ctx, idsOf(page))
	if err != nil {
		return err
	}
	edges := make([]query.Edge, len(rows))
	for i, c := range rows {
		edges[i] = query.Edge{Parent: c.TagID, Child: c.Child,
			Attrs: map[string]any{"main": c.Main}}
	}
	return query.Relate(ctx, r.cat, vndb.TypeTag, "children", edges, sel, byID)
}

func idsOf(page []gen.Tag) []int32 {
	ids := make([]int32, len(page))
	for i, t := range page {
		ids[i] = t.ID
	}
	return ids
}
