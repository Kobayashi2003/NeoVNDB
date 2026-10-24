package vn

import (
	"context"

	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/db/gen"
	"github.com/kobayashi/neovndb/internal/vndb"
)

// GraphOpts bounds one walk; the ceilings come from configuration. Relation
// graphs need bounds: sequels, fandiscs and shared settings chain into large
// components (Ever17's has ~1,900 nodes), so the walk stops at a depth, as
// vndb's view does, and reports whether it cut anything.
type GraphOpts struct {
	Depth    int
	MaxDepth int
	MaxNodes int
}

type Graph struct {
	Root  string `json:"root"`
	Depth int    `json:"depth"`
	// MaxDepth is the deepest walk this server allows, so a client can offer
	// every depth there is; Reach is the deepest step any returned title sits at.
	MaxDepth int `json:"max_depth"`
	Reach    int `json:"reach"`
	// Truncated says the component continues past what was returned; Capped
	// says the node ceiling stopped it, which more depth will not get past.
	Truncated bool `json:"truncated"`
	Capped    bool `json:"capped"`
	// Deepest is the deepest depth that draws anything new, at any depth asked:
	// where the component ends, or sooner where MaxDepth or the node ceiling
	// stops it. A client offers the depths up to it and no further.
	Deepest int         `json:"deepest"`
	Nodes   []GraphNode `json:"nodes"`
	Edges   []GraphEdge `json:"edges"`
}

type GraphNode struct {
	ID       string  `json:"id"`
	Title    string  `json:"title"`
	Original *string `json:"original"`
	Released string  `json:"released"`
	Lang     string  `json:"lang"`
	Depth    int     `json:"depth"`
	// What a card shows beside the title: the same shapes as the vn type's
	// devstatus, rating and image fields.
	Devstatus int16          `json:"devstatus"`
	Rating    any            `json:"rating"`
	Image     map[string]any `json:"image"`
}

type GraphEdge struct {
	From     string `json:"from"`
	To       string `json:"to"`
	Relation string `json:"relation"`
	Official bool   `json:"official"`
}

// RelationGraph walks outward from one VN and returns what a graph needs to be
// drawn. Truncated says the component continues past what was returned.
func (r *Resolver) RelationGraph(ctx context.Context, rawID string, opt GraphOpts) (*Graph, error) {
	root, err := vndb.ParseID(vndb.TypeVN, rawID)
	if err != nil {
		return nil, query.BadRequest("%v", err)
	}
	depth := opt.Depth
	if depth < 1 {
		depth = 1
	}
	if opt.MaxDepth > 0 && depth > opt.MaxDepth {
		return nil, query.BadRequest("depth may not exceed %d", opt.MaxDepth)
	}

	// One layer beyond the requested depth is walked, purely so the answer can
	// distinguish "the component ends here" from "there is more".
	rows, err := r.q.VNRelationGraph(ctx, gen.VNRelationGraphParams{
		Root: root, MaxDepth: int32(depth + 1),
	})
	if err != nil {
		return nil, err
	}

	w := walk(root, rows, depth, opt.MaxNodes)
	deepest, err := deepestUseful(root, opt, func(ids []int32) ([]int32, error) {
		return r.q.VNRelationNeighbours(ctx, ids)
	})
	if err != nil {
		return nil, err
	}
	graph := &Graph{
		Root: vndb.FormatID(vndb.TypeVN, root), Depth: depth, MaxDepth: opt.MaxDepth,
		Truncated: w.truncated, Capped: w.capped, Deepest: deepest,
	}
	included, depthOf := w.included, w.depthOf

	for _, e := range w.kept {
		graph.Edges = append(graph.Edges, GraphEdge{
			From:     vndb.FormatID(vndb.TypeVN, e.ID),
			To:       vndb.FormatID(vndb.TypeVN, e.Vid),
			Relation: e.Relation,
			Official: e.Official,
		})
	}

	ids := make([]int32, 0, len(included))
	for id := range included {
		ids = append(ids, id)
	}
	nodes, err := r.q.VNGraphNodes(ctx, ids)
	if err != nil {
		return nil, err
	}
	graph.Nodes = make([]GraphNode, 0, len(nodes))
	for _, n := range nodes {
		node := GraphNode{
			ID:        vndb.FormatID(vndb.TypeVN, n.ID),
			Released:  vndb.FormatReleased(n.CReleased),
			Lang:      n.Olang,
			Depth:     depthOf[n.ID],
			Devstatus: n.Devstatus,
			Rating:    tenths(n.CRating),
		}
		// Width is null only when the images table has no row for the cover; a
		// cover nobody can size or rate is left out rather than shown unrated.
		if n.CImage != nil && n.Width != nil {
			node.Image = map[string]any{
				"url":      vndb.ImageURL("cv", *n.CImage),
				"dims":     []int16{*n.Width, *n.Height},
				"sexual":   query.ContentLevel(*n.CSexualAvg, *n.CVotecount),
				"violence": query.ContentLevel(*n.CViolenceAvg, *n.CVotecount),
			}
		}
		if n.Title != nil {
			node.Title = query.PreferLatin(*n.Title, n.Latin)
			node.Original = query.OriginalOf(*n.Title, n.Latin)
		}
		graph.Reach = max(graph.Reach, node.Depth)
		graph.Nodes = append(graph.Nodes, node)
	}
	return graph, nil
}

// deepestUseful walks out from root one layer at a time, as titles rather than
// edges, so even a component of thousands costs one query per layer. It stops
// where the component ends, at MaxDepth, or once the titles so far fill the
// node ceiling: a graph that deep is already capped, and deeper adds nothing.
func deepestUseful(root int32, opt GraphOpts, next func([]int32) ([]int32, error)) (int, error) {
	seen := map[int32]bool{root: true}
	layer := []int32{root}
	depth := 0
	for {
		if opt.MaxDepth > 0 && depth >= opt.MaxDepth || opt.MaxNodes > 0 && len(seen) >= opt.MaxNodes {
			break
		}
		near, err := next(layer)
		if err != nil {
			return 0, err
		}
		layer = nil
		for _, id := range near {
			if !seen[id] {
				seen[id] = true
				layer = append(layer, id)
			}
		}
		if len(layer) == 0 {
			break
		}
		depth++
	}
	// A title with no relations still draws as a graph of one step.
	return max(depth, 1), nil
}

// walked is what one depth of a graph keeps of the rows walked for it.
type walked struct {
	kept      []gen.VNRelationGraphRow
	included  map[int32]bool
	depthOf   map[int32]int
	truncated bool
	capped    bool
}

// walk keeps the edges a graph of this depth shows, from rows that run one
// layer deeper, stopping at maxNodes titles (0: no ceiling).
func walk(root int32, rows []gen.VNRelationGraphRow, depth, maxNodes int) walked {
	// A row's depth is that of its edge's source, and a node can be reached by
	// several paths, so the shortest one wins.
	w := walked{included: map[int32]bool{root: true}, depthOf: map[int32]int{root: 0}}
	for _, e := range rows {
		d := int(e.Depth)
		if cur, seen := w.depthOf[e.ID]; !seen || d < cur {
			w.depthOf[e.ID] = d
		}
	}

	for _, e := range rows {
		if w.depthOf[e.ID] >= depth {
			continue // its target would sit past the boundary
		}
		if !w.included[e.Vid] && maxNodes > 0 && len(w.included) >= maxNodes {
			w.truncated = true
			w.capped = true
			continue
		}
		w.included[e.Vid] = true
		if _, seen := w.depthOf[e.Vid]; !seen {
			w.depthOf[e.Vid] = w.depthOf[e.ID] + 1
		}
		w.kept = append(w.kept, e)
	}

	// Anything the boundary points at but that did not make the cut is what
	// "truncated" means, rather than inferring it from the depth alone.
	for _, e := range rows {
		if w.included[e.ID] && !w.included[e.Vid] {
			w.truncated = true
			break
		}
	}
	return w
}
