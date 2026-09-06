package vn

import (
	"context"

	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/db/gen"
	"github.com/kobayashi/neovndb/internal/vndb"
)

// A loader fills one fragment for a whole page in a single query, attaching
// results to the objects being built. It receives the base rows as well, so it
// never refetches what the caller already read.
type loader func(ctx context.Context, r *Resolver, page []gen.Vn,
	sel query.Selection, byID map[int32]map[string]any) error

var fragments = map[string]loader{
	"titles":    loadTitles,
	"image":     loadImage,
	"tags":      loadTags,
	"relations": loadRelations,
	"extlinks":  loadExtLinks,

	// Fragments reaching other entities live in fragments_related.go.
	"developers":  loadDevelopers,
	"screenshots": loadScreenshots,
	"staff":       loadStaff,
	"releases":    loadReleases,
	"characters":  loadCharacters,
}

func loadTitles(ctx context.Context, r *Resolver, page []gen.Vn,
	sel query.Selection, byID map[int32]map[string]any) error {

	rows, err := r.q.VNTitles(ctx, idsOf(page))
	if err != nil {
		return err
	}

	grouped := map[int32][]map[string]any{}
	for _, t := range rows {
		grouped[t.ID] = append(grouped[t.ID], map[string]any{
			"lang": t.Lang, "title": t.Title, "latin": t.Latin, "official": t.Official,
		})
	}
	for id, obj := range byID {
		obj["titles"] = query.OrEmpty(grouped[id])
	}
	return nil
}

// setTitles fills title and alttitle, which are not columns: vndb picks the
// row matching the entity's own language and prefers its romanised form,
// keeping the original script as the alternative.
func setTitles(rows []gen.VnTitle, olang map[int32]string,
	byID map[int32]map[string]any, wantTitle, wantAlt bool) {

	for _, t := range rows {
		obj, ok := byID[t.ID]
		if !ok || t.Lang != olang[t.ID] {
			continue
		}
		if wantTitle {
			if t.Latin != nil {
				obj["title"] = *t.Latin
			} else {
				obj["title"] = t.Title
			}
		}
		if wantAlt && t.Latin != nil {
			obj["alttitle"] = t.Title
		}
	}
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

func loadTags(ctx context.Context, r *Resolver, page []gen.Vn,
	sel query.Selection, byID map[int32]map[string]any) error {

	rows, err := r.q.VNTags(ctx, idsOf(page))
	if err != nil {
		return err
	}

	// Tag names live in another table, so they are only fetched when asked for.
	names := map[int32]gen.Tag{}
	if sel.Wants("tags", "name") || sel.Wants("tags", "category") {
		ids := make([]int32, 0, len(rows))
		for _, t := range rows {
			ids = append(ids, t.Tag)
		}
		tags, err := r.q.GetTags(ctx, ids)
		if err != nil {
			return err
		}
		for _, t := range tags {
			names[t.ID] = t
		}
	}

	grouped := map[int32][]map[string]any{}
	for _, t := range rows {
		tag := map[string]any{
			"id": vndb.FormatID(vndb.TypeTag, t.Tag), "rating": t.Rating,
			"spoiler": t.Spoiler, "lie": t.Lie,
		}
		if meta, ok := names[t.Tag]; ok {
			tag["name"] = meta.Name
			tag["category"] = meta.Cat
		}
		grouped[t.Vid] = append(grouped[t.Vid], tag)
	}
	for id, obj := range byID {
		obj["tags"] = query.OrEmpty(grouped[id])
	}
	return nil
}

func loadRelations(ctx context.Context, r *Resolver, page []gen.Vn,
	sel query.Selection, byID map[int32]map[string]any) error {

	rows, err := r.q.VNRelations(ctx, idsOf(page))
	if err != nil {
		return err
	}

	grouped := map[int32][]map[string]any{}
	for _, rel := range rows {
		grouped[rel.ID] = append(grouped[rel.ID], map[string]any{
			"id": vndb.FormatID(vndb.TypeVN, rel.Vid), "relation": rel.Relation,
			"official": rel.Official,
		})
	}
	for id, obj := range byID {
		obj["relations"] = query.OrEmpty(grouped[id])
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

func idsOf(page []gen.Vn) []int32 {
	ids := make([]int32, len(page))
	for i, r := range page {
		ids[i] = r.ID
	}
	return ids
}
