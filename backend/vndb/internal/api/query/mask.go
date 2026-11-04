package query

import (
	"context"
	"fmt"

	"github.com/kobayashi/neovndb/internal/vndb"
)

// The all-ages mask: what a reader who is not signed in, or every reader while
// the site is set to all ages, may not see. What it leaves out was settled at
// import (the withheld table, internal/db/derive/06_withheld.sql); here it is
// only applied. A request carries it in its context, put there once for the
// whole request, so a query about one type and the entities nested in it
// agree.

// Withholder answers which of some entities of one type are withheld.
type Withholder interface {
	Withheld(ctx context.Context, letter string, ids []int32) (map[int32]bool, error)
}

type maskKey struct{}

// WithMask masks everything answered under ctx.
func WithMask(ctx context.Context, w Withholder) context.Context {
	return context.WithValue(ctx, maskKey{}, w)
}

// MaskOf is the mask in force, or nil when nothing is masked.
func MaskOf(ctx context.Context) Withholder {
	w, _ := ctx.Value(maskKey{}).(Withholder)
	return w
}

// withheldAs is the letter the withheld table files a type under; producers
// and staff are never withheld, only their lists are narrowed.
var withheldAs = map[string]string{
	vndb.TypeVN:        "v",
	vndb.TypeRelease:   "r",
	vndb.TypeCharacter: "c",
	vndb.TypeTag:       "g",
	vndb.TypeTrait:     "i",
}

// Withholdable is the letter for entity, and whether it can be withheld.
func Withholdable(entity string) (string, bool) {
	letter, ok := withheldAs[entity]
	return letter, ok
}

// VisibleSQL is the condition keeping withheld rows of entity, aliased alias,
// out of a query; TRUE for a type nothing of which is withheld.
func VisibleSQL(entity, alias string) string {
	letter, ok := Withholdable(entity)
	if !ok {
		return "TRUE"
	}
	return fmt.Sprintf("NOT EXISTS (SELECT 1 FROM withheld w WHERE w.entity_type = '%s' AND w.id = %s.id)",
		letter, alias)
}

// Unwithheld keeps the ids under ctx's mask that are not withheld, in order.
func Unwithheld(ctx context.Context, entity string, ids []int32) ([]int32, error) {
	mask := MaskOf(ctx)
	letter, ok := Withholdable(entity)
	if mask == nil || !ok || len(ids) == 0 {
		return ids, nil
	}
	gone, err := mask.Withheld(ctx, letter, ids)
	if err != nil {
		return nil, err
	}
	kept := ids[:0:0]
	for _, id := range ids {
		if !gone[id] {
			kept = append(kept, id)
		}
	}
	return kept, nil
}

// ImageShown says whether an image may be shown under ctx's mask: only those
// voted safe and tame, as the reader's own strictest setting would leave
// unblurred. Votes are vndb's averages times 100.
func ImageShown(ctx context.Context, votes, sexual, violence int16) bool {
	if MaskOf(ctx) == nil {
		return true
	}
	return votes > 0 && sexual <= 50 && violence <= 50
}
