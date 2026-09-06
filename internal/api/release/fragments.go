package release

import (
	"context"

	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/db/gen"
	"github.com/kobayashi/neovndb/internal/vndb"
)

type loader func(ctx context.Context, r *Resolver, page []gen.Release,
	sel query.Selection, byID map[int32]map[string]any) error

var fragments = map[string]loader{
	"titles":     loadTitles,
	"platforms":  loadPlatforms,
	"media":      loadMedia,
	"vns":        loadVNs,
	"producers":  loadProducers,
	"images":     loadImages,
	"drm":        loadDRM,
	"supersedes": loadSupersedes,
	"extlinks":   loadExtLinks,
	"engine":     loadEngine,
}

func loadTitles(ctx context.Context, r *Resolver, page []gen.Release,
	sel query.Selection, byID map[int32]map[string]any) error {

	rows, err := r.q.ReleaseTitleList(ctx, idsOf(page))
	if err != nil {
		return err
	}

	grouped := map[int32][]map[string]any{}
	for _, t := range rows {
		grouped[t.ID] = append(grouped[t.ID], map[string]any{
			"lang": t.Lang, "title": t.Title, "latin": t.Latin, "mtl": t.Mtl,
		})
	}
	for id, obj := range byID {
		obj["titles"] = query.OrEmpty(grouped[id])
	}
	return nil
}

func loadPlatforms(ctx context.Context, r *Resolver, page []gen.Release,
	sel query.Selection, byID map[int32]map[string]any) error {

	rows, err := r.q.ReleasePlatforms(ctx, idsOf(page))
	if err != nil {
		return err
	}

	grouped := map[int32][]string{}
	for _, p := range rows {
		grouped[p.ID] = append(grouped[p.ID], p.Platform)
	}
	for id, obj := range byID {
		obj["platforms"] = query.OrEmpty(grouped[id])
	}
	return nil
}

func loadMedia(ctx context.Context, r *Resolver, page []gen.Release,
	sel query.Selection, byID map[int32]map[string]any) error {

	rows, err := r.q.ReleaseMedia(ctx, idsOf(page))
	if err != nil {
		return err
	}

	grouped := map[int32][]map[string]any{}
	for _, m := range rows {
		grouped[m.ID] = append(grouped[m.ID], map[string]any{
			"medium": m.Medium, "qty": m.Qty,
		})
	}
	for id, obj := range byID {
		obj["media"] = query.OrEmpty(grouped[id])
	}
	return nil
}

func loadVNs(ctx context.Context, r *Resolver, page []gen.Release,
	sel query.Selection, byID map[int32]map[string]any) error {

	rows, err := r.q.ReleaseVNs(ctx, idsOf(page))
	if err != nil {
		return err
	}

	grouped := map[int32][]map[string]any{}
	for _, v := range rows {
		item := map[string]any{
			"id": vndb.FormatID(vndb.TypeVN, v.Vid), "rtype": v.Rtype,
		}
		if v.Title != nil {
			item["title"] = query.PreferLatin(*v.Title, v.Latin)
		}
		grouped[v.ReleaseID] = append(grouped[v.ReleaseID], item)
	}
	for id, obj := range byID {
		obj["vns"] = query.OrEmpty(grouped[id])
	}
	return nil
}

func loadProducers(ctx context.Context, r *Resolver, page []gen.Release,
	sel query.Selection, byID map[int32]map[string]any) error {

	rows, err := r.q.ReleaseProducers(ctx, idsOf(page))
	if err != nil {
		return err
	}

	grouped := map[int32][]map[string]any{}
	for _, p := range rows {
		grouped[p.ReleaseID] = append(grouped[p.ReleaseID], map[string]any{
			"id":        vndb.FormatID(vndb.TypeProducer, p.Pid),
			"name":      query.PreferLatin(p.Name, p.Latin),
			"original":  query.OriginalOf(p.Name, p.Latin),
			"developer": p.Developer,
			"publisher": p.Publisher,
		})
	}
	for id, obj := range byID {
		obj["producers"] = query.OrEmpty(grouped[id])
	}
	return nil
}

func loadImages(ctx context.Context, r *Resolver, page []gen.Release,
	sel query.Selection, byID map[int32]map[string]any) error {

	rows, err := r.q.ReleaseImages(ctx, idsOf(page))
	if err != nil {
		return err
	}

	grouped := map[int32][]map[string]any{}
	for _, i := range rows {
		img := map[string]any{
			"url":       vndb.ImageURL("cv", i.Img),
			"dims":      []int16{i.Width, i.Height},
			"itype":     i.Itype,
			"languages": query.OrEmpty(i.Lang),
			"sexual":    query.ContentLevel(i.CSexualAvg, i.CVotecount),
			"violence":  query.ContentLevel(i.CViolenceAvg, i.CVotecount),
		}
		// An image can belong to one of the VNs a bundle covers rather than to
		// the release as a whole.
		if i.Vid != nil {
			img["vn"] = vndb.FormatID(vndb.TypeVN, *i.Vid)
		} else {
			img["vn"] = nil
		}
		grouped[i.ReleaseID] = append(grouped[i.ReleaseID], img)
	}
	for id, obj := range byID {
		obj["images"] = query.OrEmpty(grouped[id])
	}
	return nil
}

func loadDRM(ctx context.Context, r *Resolver, page []gen.Release,
	sel query.Selection, byID map[int32]map[string]any) error {

	rows, err := r.q.ReleaseDRM(ctx, idsOf(page))
	if err != nil {
		return err
	}

	grouped := map[int32][]map[string]any{}
	for _, d := range rows {
		// The eight booleans say what the scheme actually does to the user,
		// which is more useful than its name alone.
		properties := []string{}
		for _, p := range []struct {
			on   bool
			name string
		}{
			{d.Disc, "disc"}, {d.Cdkey, "cdkey"}, {d.Activate, "activation"},
			{d.Alimit, "activation_limit"}, {d.Account, "account"},
			{d.Online, "online"}, {d.Cloud, "cloud"}, {d.Physical, "physical"},
		} {
			if p.on {
				properties = append(properties, p.name)
			}
		}
		grouped[d.ReleaseID] = append(grouped[d.ReleaseID], map[string]any{
			"id":          d.DrmID,
			"name":        d.Name,
			"description": query.EmptyToNil(d.Description),
			"notes":       query.EmptyToNil(d.Notes),
			"properties":  properties,
		})
	}
	for id, obj := range byID {
		obj["drm"] = query.OrEmpty(grouped[id])
	}
	return nil
}

func loadSupersedes(ctx context.Context, r *Resolver, page []gen.Release,
	sel query.Selection, byID map[int32]map[string]any) error {

	rows, err := r.q.ReleaseSupersedes(ctx, idsOf(page))
	if err != nil {
		return err
	}

	grouped := map[int32][]string{}
	for _, s := range rows {
		grouped[s.ReleaseID] = append(grouped[s.ReleaseID],
			vndb.FormatID(vndb.TypeRelease, s.Rid))
	}
	for id, obj := range byID {
		obj["supersedes"] = query.OrEmpty(grouped[id])
	}
	return nil
}

func loadExtLinks(ctx context.Context, r *Resolver, page []gen.Release,
	sel query.Selection, byID map[int32]map[string]any) error {

	rows, err := r.q.ReleaseExtLinks(ctx, idsOf(page))
	if err != nil {
		return err
	}

	grouped := map[int32][]vndb.ExtLink{}
	for _, l := range rows {
		if link, ok := vndb.BuildExtLink(l.Site, l.Value); ok {
			grouped[l.ReleaseID] = append(grouped[l.ReleaseID], link)
		}
	}
	for id, obj := range byID {
		obj["extlinks"] = query.OrEmpty(grouped[id])
	}
	return nil
}

func loadEngine(ctx context.Context, r *Resolver, page []gen.Release,
	sel query.Selection, byID map[int32]map[string]any) error {

	ids := make([]int32, 0, len(page))
	engineOf := map[int32]int32{}
	for _, rel := range page {
		if rel.Engine != nil {
			engineOf[rel.ID] = *rel.Engine
			ids = append(ids, *rel.Engine)
		}
	}
	for _, obj := range byID {
		obj["engine"] = nil
	}
	if len(ids) == 0 {
		return nil
	}

	engines, err := r.q.GetEngines(ctx, ids)
	if err != nil {
		return err
	}
	meta := map[int32]gen.Engine{}
	for _, e := range engines {
		meta[e.ID] = e
	}
	for id, obj := range byID {
		if e, ok := meta[engineOf[id]]; ok {
			obj["engine"] = map[string]any{
				"id": e.ID, "name": e.Name, "description": query.EmptyToNil(e.Description),
			}
		}
	}
	return nil
}
