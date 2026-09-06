package vn

import (
	"context"

	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/db/gen"
	"github.com/kobayashi/neovndb/internal/vndb"
)

// Fragments that reach other entities. Each still costs one batched query for
// the relation, plus at most one more for the names or images it displays --
// and those extra lookups only run when the caller asked for that subfield.

func loadDevelopers(ctx context.Context, r *Resolver, page []gen.Vn,
	sel query.Selection, byID map[int32]map[string]any) error {

	rows, err := r.q.VNDevelopers(ctx, idsOf(page))
	if err != nil {
		return err
	}

	grouped := map[int32][]map[string]any{}
	for _, p := range rows {
		grouped[p.VnID] = append(grouped[p.VnID], map[string]any{
			"id":       vndb.FormatID(vndb.TypeProducer, p.ID),
			"name":     query.PreferLatin(p.Name, p.Latin),
			"original": query.OriginalOf(p.Name, p.Latin),
		})
	}
	for id, obj := range byID {
		obj["developers"] = query.OrEmpty(grouped[id])
	}
	return nil
}

func loadScreenshots(ctx context.Context, r *Resolver, page []gen.Vn,
	sel query.Selection, byID map[int32]map[string]any) error {

	rows, err := r.q.VNScreenshotList(ctx, idsOf(page))
	if err != nil {
		return err
	}

	grouped := map[int32][]map[string]any{}
	for _, s := range rows {
		shot := map[string]any{
			"url":      vndb.ImageURL("sf", s.Scr),
			"dims":     []int16{s.Width, s.Height},
			"sexual":   query.ContentLevel(s.CSexualAvg, s.CVotecount),
			"violence": query.ContentLevel(s.CViolenceAvg, s.CVotecount),
		}
		if s.Rid != nil {
			shot["release"] = vndb.FormatID(vndb.TypeRelease, *s.Rid)
		} else {
			shot["release"] = nil
		}
		grouped[s.VnID] = append(grouped[s.VnID], shot)
	}
	for id, obj := range byID {
		obj["screenshots"] = query.OrEmpty(grouped[id])
	}
	return nil
}

func loadStaff(ctx context.Context, r *Resolver, page []gen.Vn,
	sel query.Selection, byID map[int32]map[string]any) error {

	rows, err := r.q.VNStaffList(ctx, idsOf(page))
	if err != nil {
		return err
	}

	grouped := map[int32][]map[string]any{}
	for _, s := range rows {
		member := map[string]any{
			"id":       vndb.FormatID(vndb.TypeStaff, s.StaffID),
			"name":     query.PreferLatin(s.Name, s.Latin),
			"original": query.OriginalOf(s.Name, s.Latin),
			"role":     s.Role,
			"note":     query.EmptyToNil(s.Note),
		}
		if s.Eid != nil {
			member["eid"] = *s.Eid
		}
		grouped[s.VnID] = append(grouped[s.VnID], member)
	}
	for id, obj := range byID {
		obj["staff"] = query.OrEmpty(grouped[id])
	}
	return nil
}

func loadReleases(ctx context.Context, r *Resolver, page []gen.Vn,
	sel query.Selection, byID map[int32]map[string]any) error {

	rows, err := r.q.VNReleaseList(ctx, idsOf(page))
	if err != nil {
		return err
	}

	// A release title lives in its own language table, the same shape a VN
	// title takes, so it is only fetched when the caller wants it.
	titles := map[int32]string{}
	if sel.Wants("releases", "title") {
		ids := make([]int32, 0, len(rows))
		for _, rel := range rows {
			ids = append(ids, rel.ID)
		}
		found, err := r.q.ReleaseTitles(ctx, ids)
		if err != nil {
			return err
		}
		for _, t := range found {
			if t.Title != nil {
				titles[t.ID] = query.PreferLatin(*t.Title, t.Latin)
			}
		}
	}

	grouped := map[int32][]map[string]any{}
	for _, rel := range rows {
		item := map[string]any{
			"id":         vndb.FormatID(vndb.TypeRelease, rel.ID),
			"rtype":      rel.Rtype,
			"released":   vndb.FormatReleased(rel.Released),
			"official":   rel.Official,
			"patch":      rel.Patch,
			"freeware":   rel.Freeware,
			"minage":     rel.Minage,
			"uncensored": rel.Uncensored,
		}
		if title, ok := titles[rel.ID]; ok {
			item["title"] = title
		}
		grouped[rel.VnID] = append(grouped[rel.VnID], item)
	}
	for id, obj := range byID {
		obj["releases"] = query.OrEmpty(grouped[id])
	}
	return nil
}

func loadCharacters(ctx context.Context, r *Resolver, page []gen.Vn,
	sel query.Selection, byID map[int32]map[string]any) error {

	rows, err := r.q.VNCharacterList(ctx, idsOf(page))
	if err != nil {
		return err
	}

	charIDs := make([]int32, 0, len(rows))
	portraits := make([]int32, 0, len(rows))
	for _, c := range rows {
		charIDs = append(charIDs, c.ID)
		if c.Image != nil {
			portraits = append(portraits, *c.Image)
		}
	}

	// A character's name is the row in its own language, which the import
	// resolved into chars.c_lang.
	names := map[int32]gen.CharacterNamesRow{}
	if sel.Wants("characters", "name") || sel.Wants("characters", "original") {
		found, err := r.q.CharacterNames(ctx, charIDs)
		if err != nil {
			return err
		}
		for _, n := range found {
			names[n.ID] = n
		}
	}
	images := map[int32]gen.GetCharImagesRow{}
	if sel.Wants("characters", "image") && len(portraits) > 0 {
		found, err := r.q.GetCharImages(ctx, portraits)
		if err != nil {
			return err
		}
		for _, i := range found {
			images[i.Num] = i
		}
	}

	grouped := map[int32][]map[string]any{}
	for _, c := range rows {
		char := map[string]any{
			"id":      vndb.FormatID(vndb.TypeCharacter, c.ID),
			"role":    c.Role,
			"spoiler": c.Spoil,
			"sex":     query.EmptyToNil(c.Sex),
		}
		if n, ok := names[c.ID]; ok {
			char["name"] = query.PreferLatin(n.Name, n.Latin)
			char["original"] = query.OriginalOf(n.Name, n.Latin)
		}
		if c.Image != nil {
			img := map[string]any{"url": vndb.ImageURL("ch", *c.Image)}
			if m, ok := images[*c.Image]; ok {
				img["dims"] = []int16{m.Width, m.Height}
				img["sexual"] = query.ContentLevel(m.CSexualAvg, m.CVotecount)
				img["violence"] = query.ContentLevel(m.CViolenceAvg, m.CVotecount)
			}
			char["image"] = img
		}
		grouped[c.VnID] = append(grouped[c.VnID], char)
	}
	for id, obj := range byID {
		obj["characters"] = query.OrEmpty(grouped[id])
	}
	return nil
}
