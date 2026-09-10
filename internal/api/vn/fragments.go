package vn

import (
	"context"

	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/db/gen"
	"github.com/kobayashi/neovndb/internal/vndb"
)

// loadTitles serves title, alttitle and the titles fragment from one read of
// vn_titles. title and alttitle are the row matching the VN's own language:
// vndb prefers the romanised form there and keeps the original script as the
// alternative.
func (r *Resolver) loadTitles(ctx context.Context, page []gen.Vn,
	sel query.Selection, byID map[int32]map[string]any) error {

	rows, err := r.q.VNTitles(ctx, idsOf(page))
	if err != nil {
		return err
	}

	wantTitle, wantAlt := sel.Has("title"), sel.Has("alttitle")
	olang := make(map[int32]string, len(page))
	for _, v := range page {
		olang[v.ID] = v.Olang
	}

	grouped := map[int32][]map[string]any{}
	for _, t := range rows {
		obj, ok := byID[t.ID]
		if !ok {
			continue
		}
		if t.Lang == olang[t.ID] {
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
		grouped[t.ID] = append(grouped[t.ID], map[string]any{
			"lang": t.Lang, "title": t.Title, "latin": t.Latin, "official": t.Official,
		})
	}
	if sel.Has("titles") {
		for id, obj := range byID {
			obj["titles"] = query.OrEmpty(grouped[id])
		}
	}
	return nil
}

func (r *Resolver) loadImage(ctx context.Context, page []gen.Vn,
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

func (r *Resolver) loadTags(ctx context.Context, page []gen.Vn,
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

func (r *Resolver) loadRelations(ctx context.Context, page []gen.Vn,
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
func (r *Resolver) loadExtLinks(ctx context.Context, page []gen.Vn,
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
