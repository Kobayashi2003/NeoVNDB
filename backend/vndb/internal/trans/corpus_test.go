package trans

import (
	"bytes"
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

// The corpus survives a write and a read whole, and a second write changes
// nothing: an export of an unchanged database is no diff.
func TestCorpusEncodeIsStable(t *testing.T) {
	raw, err := os.ReadFile("init.json")
	if err != nil {
		t.Fatal(err)
	}
	var c Corpus
	if err := json.Unmarshal(raw, &c); err != nil {
		t.Fatal(err)
	}

	var once, twice bytes.Buffer
	if err := c.Encode(&once); err != nil {
		t.Fatal(err)
	}
	var back Corpus
	if err := json.Unmarshal(once.Bytes(), &back); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(back.Terms, c.Terms) || len(back.Passages) != len(c.Passages) {
		t.Fatal("terms or passages changed on the way through")
	}
	if err := back.Encode(&twice); err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(once.Bytes(), twice.Bytes()) {
		t.Error("a second encode differs from the first")
	}
	// An escaped <, spelled out.
	if bytes.Contains(once.Bytes(), []byte{'\\', 'u', '0', '0', '3', 'c'}) {
		t.Error("markup was escaped")
	}
}
