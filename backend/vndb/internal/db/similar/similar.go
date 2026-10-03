// Package similar finds, for every visual novel, the ones whose tags look most
// like its own. vndb has no such list and the dump has nothing to read it
// from, so it is computed at import, after the tag scores, and stored per
// generation in vn_similar.
//
// A work is a vector of its direct tags, each weighted by its score (how
// strongly voters say it applies) times its rarity (inverse document
// frequency: "Male protagonist" says little, "Time loop" a lot). Two works are
// as similar as the cosine of their vectors.
//
// Comparing every pair is billions of products, so candidates are found
// through an inverted index of the rarer tags only, scored approximately by
// what they share there, and the best few are then scored exactly.
package similar

import (
	"math"
	"runtime"
	"slices"
	"sync"
)

const (
	// Kept per work.
	keep = 20
	// Tags on more works than this still count in the score but do not
	// propose candidates: sharing one is true of a large part of the database.
	maxPosting = 3000
	// Candidates scored exactly after the approximate pass.
	shortlist = 80
	// Works with few tags match everything they have perfectly. Shrinking
	// scores by n/(n+damping) for n tags favours works described in depth.
	damping = 6
	// Below this a neighbour is noise rather than a recommendation.
	minScore = 0.08
)

// Tag is one scored tag of one work.
type Tag struct {
	Work   int32
	Tag    int32
	Rating float32
}

// Pair is one work's neighbour.
type Pair struct {
	Work, Similar int32
	Score         float32
}

type entry struct {
	tag    int32
	weight float32
}

type posting struct {
	work   int32 // index into works
	weight float32
}

// Neighbours returns up to keep neighbours per work, best first. A pair skip
// reports true for is left out -- related works, which have their own list and
// would otherwise fill this one with sequels and ports.
func Neighbours(tags []Tag, skip func(a, b int32) bool) []Pair {
	// Dense indexes for works and tags.
	workIx := map[int32]int32{}
	var works []int32
	df := map[int32]int{}
	for _, t := range tags {
		if _, ok := workIx[t.Work]; !ok {
			workIx[t.Work] = int32(len(works))
			works = append(works, t.Work)
		}
		df[t.Tag]++
	}
	n := float64(len(works))
	idf := make(map[int32]float32, len(df))
	for tag, d := range df {
		idf[tag] = float32(math.Log(n / float64(d)))
	}

	vectors := make([][]entry, len(works))
	for _, t := range tags {
		w := t.Rating * idf[t.Tag]
		if w <= 0 {
			continue
		}
		i := workIx[t.Work]
		vectors[i] = append(vectors[i], entry{t.Tag, w})
	}
	norms := make([]float32, len(works))
	postings := map[int32][]posting{}
	for i, v := range vectors {
		slices.SortFunc(v, func(a, b entry) int { return int(a.tag - b.tag) })
		var sum float64
		for _, e := range v {
			sum += float64(e.weight) * float64(e.weight)
			if df[e.tag] <= maxPosting {
				postings[e.tag] = append(postings[e.tag], posting{int32(i), e.weight})
			}
		}
		norms[i] = float32(math.Sqrt(sum))
	}

	out := make([][]Pair, len(works))
	var next int64
	var mu sync.Mutex
	take := func() int {
		mu.Lock()
		defer mu.Unlock()
		i := int(next)
		next++
		return i
	}

	var wg sync.WaitGroup
	for range runtime.GOMAXPROCS(0) {
		wg.Add(1)
		go func() {
			defer wg.Done()
			acc := make([]float32, len(works))
			var touched []int32
			for a := take(); a < len(works); a = take() {
				if norms[a] == 0 {
					continue
				}
				touched = touched[:0]
				for _, e := range vectors[a] {
					for _, p := range postings[e.tag] {
						if int(p.work) == a {
							continue
						}
						if acc[p.work] == 0 {
							touched = append(touched, p.work)
						}
						acc[p.work] += e.weight * p.weight
					}
				}
				// The approximate best, by what they share among rarer tags.
				best := top(touched, acc, shortlist)

				pairs := make([]Pair, 0, len(best))
				for _, b := range best {
					if skip != nil && skip(works[a], works[b]) {
						continue
					}
					cos := dot(vectors[a], vectors[b]) / (norms[a] * norms[b])
					shrink := float32(len(vectors[b])) / float32(len(vectors[b])+damping)
					if s := cos * shrink; s >= minScore {
						pairs = append(pairs, Pair{works[a], works[b], s})
					}
				}
				for _, b := range touched {
					acc[b] = 0
				}
				slices.SortFunc(pairs, func(x, y Pair) int {
					switch {
					case x.Score > y.Score:
						return -1
					case x.Score < y.Score:
						return 1
					}
					return int(x.Similar - y.Similar)
				})
				out[a] = pairs[:min(len(pairs), keep)]
			}
		}()
	}
	wg.Wait()

	var all []Pair
	for _, p := range out {
		all = append(all, p...)
	}
	return all
}

// top picks the k works with the highest acc, in no particular order. A small
// min-heap of the best so far: sorting every candidate of every work would
// cost more than finding them.
func top(cands []int32, acc []float32, k int) []int32 {
	if len(cands) <= k {
		return append([]int32(nil), cands...)
	}
	h := append([]int32(nil), cands[:k]...)
	less := func(i, j int) bool { return acc[h[i]] < acc[h[j]] }
	down := func(i int) {
		for {
			l, smallest := 2*i+1, i
			if l < len(h) && less(l, smallest) {
				smallest = l
			}
			if r := l + 1; r < len(h) && less(r, smallest) {
				smallest = r
			}
			if smallest == i {
				return
			}
			h[i], h[smallest] = h[smallest], h[i]
			i = smallest
		}
	}
	for i := len(h)/2 - 1; i >= 0; i-- {
		down(i)
	}
	for _, c := range cands[k:] {
		if acc[c] > acc[h[0]] {
			h[0] = c
			down(0)
		}
	}
	return h
}

// dot is the product of two vectors sorted by tag.
func dot(a, b []entry) float32 {
	var sum float32
	for i, j := 0, 0; i < len(a) && j < len(b); {
		switch {
		case a[i].tag < b[j].tag:
			i++
		case a[i].tag > b[j].tag:
			j++
		default:
			sum += a[i].weight * b[j].weight
			i++
			j++
		}
	}
	return sum
}
