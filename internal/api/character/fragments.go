package character

import (
	"context"

	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/db/gen"
	"github.com/kobayashi/neovndb/internal/vndb"
)

type loader func(ctx context.Context, r *Resolver, page []gen.Char,
	sel query.Selection, byID map[int32]map[string]any) error

var fragments = map[string]loader{
	"image":   loadImage,
	"names":   loadNames,
	"aliases": loadAliases,
	"traits":  loadTraits,
	"vns":     loadVNs,
	"seiyuu":  loadSeiyuu,
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

func loadNames(ctx context.Context, r *Resolver, page []gen.Char,
	sel query.Selection, byID map[int32]map[string]any) error {

	rows, err := r.q.CharNames(ctx, idsOf(page))
	if err != nil {
		return err
	}

	grouped := map[int32][]map[string]any{}
	for _, n := range rows {
		grouped[n.ID] = append(grouped[n.ID], map[string]any{
			"lang": n.Lang, "name": n.Name, "latin": n.Latin,
		})
	}
	for id, obj := range byID {
		obj["names"] = query.OrEmpty(grouped[id])
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

	grouped := map[int32][]map[string]any{}
	for _, t := range rows {
		trait := map[string]any{
			"id": vndb.FormatID(vndb.TypeTrait, t.Tid), "name": t.Name,
			"spoiler": t.Spoil, "lie": t.Lie, "sexual": t.Sexual,
		}
		if t.Gid != nil {
			trait["group"] = vndb.FormatID(vndb.TypeTrait, *t.Gid)
		} else {
			trait["group"] = nil
		}
		grouped[t.CharID] = append(grouped[t.CharID], trait)
	}
	for id, obj := range byID {
		obj["traits"] = query.OrEmpty(grouped[id])
	}
	return nil
}

func loadVNs(ctx context.Context, r *Resolver, page []gen.Char,
	sel query.Selection, byID map[int32]map[string]any) error {

	rows, err := r.q.CharVNList(ctx, idsOf(page))
	if err != nil {
		return err
	}

	grouped := map[int32][]map[string]any{}
	for _, v := range rows {
		item := map[string]any{
			"id":       vndb.FormatID(vndb.TypeVN, v.Vid),
			"role":     v.Role,
			"spoiler":  v.Spoil,
			"released": vndb.FormatReleased(v.CReleased),
		}
		if v.Title != nil {
			item["title"] = query.PreferLatin(*v.Title, v.Latin)
		}
		// A character can be tied to one release of a VN rather than all of
		// them, which is how route-specific appearances are recorded.
		if v.Rid != nil {
			item["release"] = vndb.FormatID(vndb.TypeRelease, *v.Rid)
		} else {
			item["release"] = nil
		}
		grouped[v.CharID] = append(grouped[v.CharID], item)
	}
	for id, obj := range byID {
		obj["vns"] = query.OrEmpty(grouped[id])
	}
	return nil
}

func loadSeiyuu(ctx context.Context, r *Resolver, page []gen.Char,
	sel query.Selection, byID map[int32]map[string]any) error {

	rows, err := r.q.CharSeiyuu(ctx, idsOf(page))
	if err != nil {
		return err
	}

	grouped := map[int32][]map[string]any{}
	for _, s := range rows {
		grouped[s.CharID] = append(grouped[s.CharID], map[string]any{
			"id":       vndb.FormatID(vndb.TypeStaff, s.StaffID),
			"name":     query.PreferLatin(s.Name, s.Latin),
			"original": query.OriginalOf(s.Name, s.Latin),
			"vn":       vndb.FormatID(vndb.TypeVN, s.VnID),
			"note":     query.EmptyToNil(s.Note),
		})
	}
	for id, obj := range byID {
		obj["seiyuu"] = query.OrEmpty(grouped[id])
	}
	return nil
}

func vndbCharID(id int32) string { return vndb.FormatID(vndb.TypeCharacter, id) }
