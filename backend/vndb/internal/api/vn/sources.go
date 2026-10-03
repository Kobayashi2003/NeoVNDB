package vn

import (
	"context"

	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/db/gen"
	"github.com/kobayashi/neovndb/internal/vndb"
)

// loadTitles serves title, alttitle and titles from one read of vn_titles;
// title and alttitle come from the row in the VN's own language.
func loadTitles(ctx context.Context, r *Resolver, page []gen.Vn,
	sel query.Selection, byID map[int32]map[string]any) error {

	olang := make(map[int32]string, len(page))
	for _, v := range page {
		olang[v.ID] = v.Olang
	}
	rows, err := r.q.VNTitles(ctx, idsOf(page))
	if err != nil {
		return err
	}

	wantTitle, wantAlt := sel.Has("title"), sel.Has("alttitle")
	grouped := map[int32][]map[string]any{}
	for _, t := range rows {
		obj, ok := byID[t.ID]
		if !ok {
			continue
		}
		if t.Lang == olang[t.ID] {
			if wantTitle {
				obj["title"] = query.PreferLatin(t.Title, t.Latin)
			}
			if wantAlt {
				obj["alttitle"] = query.OriginalOf(t.Title, t.Latin)
			}
		}
		grouped[t.ID] = append(grouped[t.ID], map[string]any{
			"lang": t.Lang, "title": t.Title, "latin": t.Latin, "official": t.Official,
		})
	}
	if !sel.Has("titles") {
		return nil
	}
	for id, obj := range byID {
		obj["titles"] = query.OrEmpty(grouped[id])
	}
	return nil
}

func loadImage(ctx context.Context, r *Resolver, page []gen.Vn,
	sel query.Selection, byID map[int32]map[string]any) error {

	nums := make([]int32, 0, len(page))
	cover := map[int32]int32{}
	for _, v := range page {
		if v.CImage != nil {
			cover[v.ID] = *v.CImage
			nums = append(nums, *v.CImage)
		}
	}
	for _, obj := range byID {
		obj["image"] = nil
	}
	if len(nums) == 0 {
		return nil
	}

	images, err := r.q.GetCovers(ctx, nums)
	if err != nil {
		return err
	}
	meta := map[int32]gen.GetCoversRow{}
	for _, i := range images {
		meta[i.Num] = i
	}

	for id, obj := range byID {
		num, ok := cover[id]
		if !ok {
			continue
		}
		img := map[string]any{"url": vndb.ImageURL("cv", num)}
		if m, ok := meta[num]; ok {
			img["dims"] = []int16{m.Width, m.Height}
			img["sexual"] = query.ContentLevel(m.CSexualAvg, m.CVotecount)
			img["violence"] = query.ContentLevel(m.CViolenceAvg, m.CVotecount)
			img["votecount"] = m.CVotecount
		}
		obj["image"] = img
	}
	return nil
}

// The dump carries no ordering column for screenshots, so the image id is the
// only stable order available.
func loadScreenshots(ctx context.Context, r *Resolver, page []gen.Vn,
	sel query.Selection, byID map[int32]map[string]any) error {

	rows, err := r.q.VNScreenshotList(ctx, idsOf(page))
	if err != nil {
		return err
	}
	grouped := map[int32][]map[string]any{}
	for _, s := range rows {
		shot := map[string]any{
			"url": vndb.ImageURL("sf", s.Scr),
			// st is not an image row: vndb serves a screenshot's thumbnail under a
			// different kind with the same id and aspect ratio, so dims still applies.
			"thumbnail": vndb.ImageURL("st", s.Scr),
			"dims":      []int16{s.Width, s.Height},
			"sexual":    query.ContentLevel(s.CSexualAvg, s.CVotecount),
			"violence":  query.ContentLevel(s.CViolenceAvg, s.CVotecount),
			"release":   nil,
		}
		if s.Rid != nil {
			shot["release"] = vndb.FormatID(vndb.TypeRelease, *s.Rid)
		}
		grouped[s.VnID] = append(grouped[s.VnID], shot)
	}
	for id, obj := range byID {
		obj["screenshots"] = query.OrEmpty(grouped[id])
	}
	return nil
}

// loadExtLinks renders each stored (site, value) pair through the recipe
// table. A site with no recipe is dropped rather than shown broken.
func loadExtLinks(ctx context.Context, r *Resolver, page []gen.Vn,
	sel query.Selection, byID map[int32]map[string]any) error {

	rows, err := r.q.VNExtLinks(ctx, idsOf(page))
	if err != nil {
		return err
	}
	grouped := map[int32][]vndb.ExtLink{}
	for _, l := range rows {
		if link, ok := vndb.BuildExtLink(l.Site, l.Value); ok {
			grouped[l.ID] = append(grouped[l.ID], link)
		}
	}
	for id, obj := range byID {
		obj["extlinks"] = query.OrEmpty(grouped[id])
	}
	return nil
}

// The sources below fetch only the pairings; the type at the other end renders
// itself, so every field it has is reachable from here.

func loadTags(ctx context.Context, r *Resolver, page []gen.Vn,
	sel query.Selection, byID map[int32]map[string]any) error {

	rows, err := r.q.VNTags(ctx, idsOf(page))
	if err != nil {
		return err
	}
	edges := make([]query.Edge, len(rows))
	for i, t := range rows {
		edges[i] = query.Edge{Parent: t.Vid, Child: t.Tag, Attrs: map[string]any{
			"rating": t.Rating, "spoiler": t.Spoiler, "lie": t.Lie,
		}}
	}
	return query.Relate(ctx, r.cat, vndb.TypeVN, "tags", edges, sel, byID)
}

func loadRelations(ctx context.Context, r *Resolver, page []gen.Vn,
	sel query.Selection, byID map[int32]map[string]any) error {

	rows, err := r.q.VNRelations(ctx, idsOf(page))
	if err != nil {
		return err
	}
	edges := make([]query.Edge, len(rows))
	for i, rel := range rows {
		edges[i] = query.Edge{Parent: rel.ID, Child: rel.Vid, Attrs: map[string]any{
			"relation": rel.Relation, "official": rel.Official,
		}}
	}
	return query.Relate(ctx, r.cat, vndb.TypeVN, "relations", edges, sel, byID)
}

func loadSimilar(ctx context.Context, r *Resolver, page []gen.Vn,
	sel query.Selection, byID map[int32]map[string]any) error {

	rows, err := r.q.VNSimilar(ctx, idsOf(page))
	if err != nil {
		return err
	}
	edges := make([]query.Edge, len(rows))
	for i, s := range rows {
		edges[i] = query.Edge{Parent: s.ID, Child: s.Vid, Attrs: map[string]any{"score": s.Score}}
	}
	return query.Relate(ctx, r.cat, vndb.TypeVN, "similar", edges, sel, byID)
}

// c_developers is a cached array on the row, so the producers come back
// without going through the releases.
func loadDevelopers(ctx context.Context, r *Resolver, page []gen.Vn,
	sel query.Selection, byID map[int32]map[string]any) error {

	rows, err := r.q.VNDevelopers(ctx, idsOf(page))
	if err != nil {
		return err
	}
	edges := make([]query.Edge, len(rows))
	for i, p := range rows {
		edges[i] = query.Edge{Parent: p.VnID, Child: p.ID}
	}
	return query.Relate(ctx, r.cat, vndb.TypeVN, "developers", edges, sel, byID)
}

// loadEditions reads the named versions of a work. They are worth returning on
// their own only because the staff credits point at them: a credit carries an
// eid and nothing else could say which version that is.
func loadEditions(ctx context.Context, r *Resolver, page []gen.Vn,
	_ query.Selection, byID map[int32]map[string]any) error {

	rows, err := r.q.VNEditionList(ctx, idsOf(page))
	if err != nil {
		return err
	}
	grouped := map[int32][]map[string]any{}
	for _, e := range rows {
		grouped[e.VnID] = append(grouped[e.VnID], map[string]any{
			"eid": e.Eid, "name": e.Name, "lang": e.Lang, "official": e.Official,
		})
	}
	for id, obj := range byID {
		obj["editions"] = query.OrEmpty(grouped[id])
	}
	return nil
}

// loadAnime reads what a work was adapted into. Titles are folded by hand:
// here the romanisation is always present and the original may be NULL, the
// reverse of what PreferLatin/OriginalOf expect.
func loadAnime(ctx context.Context, r *Resolver, page []gen.Vn,
	_ query.Selection, byID map[int32]map[string]any) error {

	rows, err := r.q.VNAnimeList(ctx, idsOf(page))
	if err != nil {
		return err
	}
	grouped := map[int32][]map[string]any{}
	for _, a := range rows {
		title := ""
		if a.TitleRomaji != nil {
			title = *a.TitleRomaji
		}
		grouped[a.VnID] = append(grouped[a.VnID], map[string]any{
			"id":       a.ID,
			"type":     blankToNil(a.Type),
			"year":     a.Year,
			"title":    title,
			"original": blankToNil(a.TitleKanji),
		})
	}
	for id, obj := range byID {
		obj["anime"] = query.OrEmpty(grouped[id])
	}
	return nil
}

// blankToNil is EmptyToNil for a column that is already nullable: absent and
// present-but-empty are the same thing to a reader, and only one of them
// should reach one.
func blankToNil(s *string) *string {
	if s == nil || *s == "" {
		return nil
	}
	return s
}

func loadStaff(ctx context.Context, r *Resolver, page []gen.Vn,
	sel query.Selection, byID map[int32]map[string]any) error {

	rows, err := r.q.VNStaffList(ctx, idsOf(page))
	if err != nil {
		return err
	}
	edges := make([]query.Edge, len(rows))
	for i, s := range rows {
		attrs := map[string]any{
			"role": s.Role, "note": query.EmptyToNil(s.Note), "eid": nil,
			"name": query.PreferLatin(s.Name, s.Latin), "original": query.OriginalOf(s.Name, s.Latin),
		}
		if s.Eid != nil {
			attrs["eid"] = *s.Eid
		}
		edges[i] = query.Edge{Parent: s.VnID, Child: s.StaffID, Attrs: attrs}
	}
	return query.Relate(ctx, r.cat, vndb.TypeVN, "staff", edges, sel, byID)
}

func loadReleases(ctx context.Context, r *Resolver, page []gen.Vn,
	sel query.Selection, byID map[int32]map[string]any) error {

	rows, err := r.q.VNReleaseList(ctx, idsOf(page))
	if err != nil {
		return err
	}
	edges := make([]query.Edge, len(rows))
	for i, rel := range rows {
		edges[i] = query.Edge{Parent: rel.VnID, Child: rel.ID,
			Attrs: map[string]any{"rtype": rel.Rtype}}
	}
	return query.Relate(ctx, r.cat, vndb.TypeVN, "releases", edges, sel, byID)
}

func loadCharacters(ctx context.Context, r *Resolver, page []gen.Vn,
	sel query.Selection, byID map[int32]map[string]any) error {

	rows, err := r.q.VNCharacterList(ctx, idsOf(page))
	if err != nil {
		return err
	}
	edges := make([]query.Edge, len(rows))
	for i, c := range rows {
		edges[i] = query.Edge{Parent: c.VnID, Child: c.ID,
			Attrs: map[string]any{"role": c.Role, "spoiler": c.Spoil}}
	}
	return query.Relate(ctx, r.cat, vndb.TypeVN, "characters", edges, sel, byID)
}

func idsOf(page []gen.Vn) []int32 {
	ids := make([]int32, len(page))
	for i, v := range page {
		ids[i] = v.ID
	}
	return ids
}
