package character

import (
	"context"

	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/db/gen"
	"github.com/kobayashi/neovndb/internal/vndb"
)

// loadNames serves name, original and the names fragment from one read of
// chars_names. name is the row in the character's own language, which the
// import resolved into chars.c_lang.
func loadNames(ctx context.Context, r *Resolver, page []gen.Char,
	sel query.Selection, byID map[int32]map[string]any) error {

	lang := make(map[int32]string, len(page))
	for _, c := range page {
		lang[c.ID] = c.CLang
	}
	rows, err := r.q.CharNames(ctx, idsOf(page))
	if err != nil {
		return err
	}

	grouped := map[int32][]map[string]any{}
	for _, n := range rows {
		obj, ok := byID[n.ID]
		if !ok {
			continue
		}
		if n.Lang == lang[n.ID] {
			if sel.Has("name") {
				obj["name"] = query.PreferLatin(n.Name, n.Latin)
			}
			if sel.Has("original") {
				obj["original"] = query.OriginalOf(n.Name, n.Latin)
			}
		}
		grouped[n.ID] = append(grouped[n.ID], map[string]any{
			"lang": n.Lang, "name": n.Name, "latin": n.Latin,
		})
	}
	if !sel.Has("names") {
		return nil
	}
	for id, obj := range byID {
		obj["names"] = query.OrEmpty(grouped[id])
	}
	return nil
}

func loadImage(ctx context.Context, r *Resolver, page []gen.Char,
	sel query.Selection, byID map[int32]map[string]any) error {

	nums := make([]int32, 0, len(page))
	portrait := map[int32]int32{}
	for _, c := range page {
		if c.Image != nil {
			portrait[c.ID] = *c.Image
			nums = append(nums, *c.Image)
		}
	}
	for _, obj := range byID {
		obj["image"] = nil
	}
	if len(nums) == 0 {
		return nil
	}

	images, err := r.q.GetCharImages(ctx, nums)
	if err != nil {
		return err
	}
	meta := map[int32]gen.GetCharImagesRow{}
	for _, i := range images {
		meta[i.Num] = i
	}

	for id, obj := range byID {
		num, ok := portrait[id]
		if !ok {
			continue
		}
		img := map[string]any{"url": vndb.ImageURL("ch", num)}
		if m, ok := meta[num]; ok {
			img["dims"] = []int16{m.Width, m.Height}
			img["sexual"] = query.ContentLevel(m.CSexualAvg, m.CVotecount)
			img["violence"] = query.ContentLevel(m.CViolenceAvg, m.CVotecount)
		}
		obj["image"] = img
	}
	return nil
}

func loadAliases(ctx context.Context, r *Resolver, page []gen.Char,
	sel query.Selection, byID map[int32]map[string]any) error {

	rows, err := r.q.CharAliases(ctx, idsOf(page))
	if err != nil {
		return err
	}
	grouped := map[int32][]map[string]any{}
	for _, a := range rows {
		grouped[a.ID] = append(grouped[a.ID], map[string]any{
			"name": a.Name, "latin": a.Latin, "spoiler": a.Spoil,
		})
	}
	for id, obj := range byID {
		obj["aliases"] = query.OrEmpty(grouped[id])
	}
	return nil
}

func loadTraits(ctx context.Context, r *Resolver, page []gen.Char,
	sel query.Selection, byID map[int32]map[string]any) error {

	rows, err := r.q.CharTraitList(ctx, idsOf(page))
	if err != nil {
		return err
	}
	edges := make([]query.Edge, len(rows))
	for i, t := range rows {
		edges[i] = query.Edge{Parent: t.CharID, Child: t.Tid,
			Attrs: map[string]any{"spoiler": t.Spoil, "lie": t.Lie}}
	}
	return query.Relate(ctx, r.cat, vndb.TypeCharacter, "traits", edges, sel, byID)
}

func loadVNs(ctx context.Context, r *Resolver, page []gen.Char,
	sel query.Selection, byID map[int32]map[string]any) error {

	rows, err := r.q.CharVNList(ctx, idsOf(page))
	if err != nil {
		return err
	}
	edges := make([]query.Edge, len(rows))
	for i, v := range rows {
		attrs := map[string]any{"role": v.Role, "spoiler": v.Spoil, "release": nil}
		if v.Rid != nil {
			attrs["release"] = vndb.FormatID(vndb.TypeRelease, *v.Rid)
		}
		edges[i] = query.Edge{Parent: v.CharID, Child: v.Vid, Attrs: attrs}
	}
	return query.Relate(ctx, r.cat, vndb.TypeCharacter, "vns", edges, sel, byID)
}

func loadSeiyuu(ctx context.Context, r *Resolver, page []gen.Char,
	sel query.Selection, byID map[int32]map[string]any) error {

	rows, err := r.q.CharSeiyuu(ctx, idsOf(page))
	if err != nil {
		return err
	}
	edges := make([]query.Edge, len(rows))
	for i, s := range rows {
		edges[i] = query.Edge{Parent: s.CharID, Child: s.StaffID, Attrs: map[string]any{
			"vn":       vndb.FormatID(vndb.TypeVN, s.VnID),
			"note":     query.EmptyToNil(s.Note),
			"name":     query.PreferLatin(s.Name, s.Latin),
			"original": query.OriginalOf(s.Name, s.Latin),
		}}
	}
	return query.Relate(ctx, r.cat, vndb.TypeCharacter, "seiyuu", edges, sel, byID)
}

func idsOf(page []gen.Char) []int32 {
	ids := make([]int32, len(page))
	for i, c := range page {
		ids[i] = c.ID
	}
	return ids
}
