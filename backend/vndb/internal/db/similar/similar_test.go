package similar

import "testing"

// Works sharing their distinctive tags come out as each other's neighbours;
// a work sharing only a tag everything has does not.
func TestNeighbours(t *testing.T) {
	var tags []Tag
	add := func(work int32, ts ...int32) {
		for _, tag := range ts {
			tags = append(tags, Tag{Work: work, Tag: tag, Rating: 2})
		}
	}
	// Tag 1 is on everything; 10-15 describe a time-loop mystery, 20-25 a
	// school romance.
	add(1, 1, 10, 11, 12, 13, 14, 15)
	add(2, 1, 10, 11, 12, 13, 14)
	add(3, 1, 20, 21, 22, 23, 24, 25)
	add(4, 1, 20, 21, 22, 23, 24)
	add(5, 1, 10, 20)
	for w := int32(100); w < 140; w++ {
		add(w, 1, 30+w) // filler, so tag 1 is common
	}

	got := map[int32][]Pair{}
	for _, p := range Neighbours(tags, func(a, b int32) bool { return a == 3 && b == 4 }) {
		got[p.Work] = append(got[p.Work], p)
	}
	if len(got[1]) == 0 || got[1][0].Similar != 2 {
		t.Errorf("1's best: %+v, want 2", got[1])
	}
	// 3 and 4 are alike but related, so 4 is left out of 3's list.
	for _, p := range got[3] {
		if p.Similar == 4 {
			t.Errorf("3 lists 4, which it was told to skip")
		}
	}
	if len(got[4]) == 0 || got[4][0].Similar != 3 {
		t.Errorf("4's best: %+v, want 3", got[4])
	}
	for _, p := range got[1] {
		if p.Similar >= 100 {
			t.Errorf("1 was matched to filler %d through the common tag", p.Similar)
		}
		if p.Score <= 0 || p.Score > 1 {
			t.Errorf("score %v out of range", p.Score)
		}
	}
	for i := 1; i < len(got[1]); i++ {
		if got[1][i].Score > got[1][i-1].Score {
			t.Errorf("not best first: %+v", got[1])
		}
	}
}
