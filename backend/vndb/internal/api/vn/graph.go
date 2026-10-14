package vn

import (
	"context"

	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/db/gen"
	"github.com/kobayashi/neovndb/internal/vndb"
)

// Relation graphs are bounded: sequels, fandiscs and shared settings chain
// into large components (Ever17's has ~1,900 nodes), so the walk stops at a
// depth, as vndb's view does, and reports whether it cut anything.
// GraphOpts bounds one walk; the ceilings come from configuration.
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
	Truncated bool        `json:"truncated"`
	Capped    bool        `json:"capped"`
	Nodes     []GraphNode `json:"nodes"`
	Edges     []GraphEdge `json:"edges"`
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

	// w.depth is the depth of the edge's source, and a node can be reached by
	// several paths, so the shortest one wins.
	depthOf := map[int32]int{root: 0}
	for _, e := range rows {
		d := int(e.Depth)
		if cur, seen := depthOf[e.ID]; !seen || d < cur {
			depthOf[e.ID] = d
		}
	}

	graph := &Graph{Root: vndb.FormatID(vndb.TypeVN, root), Depth: depth, MaxDepth: opt.MaxDepth}
	included := map[int32]bool{root: true}
	var kept []gen.VNRelationGraphRow

	for _, e := range rows {
		if depthOf[e.ID] >= depth {
			continue // its target would sit past the boundary
		}
		if !included[e.Vid] && opt.MaxNodes > 0 && len(included) >= opt.MaxNodes {
			graph.Truncated = true
			graph.Capped = true
			continue
		}
		included[e.Vid] = true
		if _, seen := depthOf[e.Vid]; !seen {
			depthOf[e.Vid] = depthOf[e.ID] + 1
		}
		kept = append(kept, e)
	}

	// Anything the boundary points at but that did not make the cut is what
	// "truncated" means, rather than inferring it from the depth alone.
	for _, e := range rows {
		if included[e.ID] && !included[e.Vid] {
			graph.Truncated = true
			break
		}
	}

	for _, e := range kept {
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
