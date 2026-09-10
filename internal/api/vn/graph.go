package vn

import (
	"context"

	"github.com/kobayashi/neovndb/internal/api/query"
	"github.com/kobayashi/neovndb/internal/db/gen"
	"github.com/kobayashi/neovndb/internal/vndb"
)

// Relation graphs are bounded because the component is not small: sequels,
// fandiscs and shared settings chain titles together until one web holds them
// all, and the component containing Ever17 alone runs to about nineteen
// hundred nodes. The walk therefore stops at a depth, the way vndb's own view
// does, and reports whether it cut anything off.
// GraphOpts bounds one walk. Depth is what the caller asked for; the two
// ceilings come from configuration, because how big a graph is worth drawing
// is a deployment's call rather than a property of the data.
type GraphOpts struct {
	Depth    int
	MaxDepth int
	MaxNodes int
}

type Graph struct {
	Root      string      `json:"root"`
	Depth     int         `json:"depth"`
	Truncated bool        `json:"truncated"`
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

	graph := &Graph{Root: vndb.FormatID(vndb.TypeVN, root), Depth: depth}
	included := map[int32]bool{root: true}
	var kept []gen.VNRelationGraphRow

	for _, e := range rows {
		if depthOf[e.ID] >= depth {
			continue // its target would sit past the boundary
		}
		if !included[e.Vid] && opt.MaxNodes > 0 && len(included) >= opt.MaxNodes {
			graph.Truncated = true
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
			ID:       vndb.FormatID(vndb.TypeVN, n.ID),
			Released: vndb.FormatReleased(n.CReleased),
			Lang:     n.Olang,
			Depth:    depthOf[n.ID],
		}
		if n.Title != nil {
			node.Title = query.PreferLatin(*n.Title, n.Latin)
			node.Original = query.OriginalOf(*n.Title, n.Latin)
		}
		graph.Nodes = append(graph.Nodes, node)
	}
	return graph, nil
}
