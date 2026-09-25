package trans

import (
	"encoding/json"
	"os"
	"testing"
)

// init.json is the only copy of the corpus, so a bad edit is caught here
// rather than when someone next seeds a database.
func TestCorpusFile(t *testing.T) {
	raw, err := os.ReadFile("init.json")
	if err != nil {
		t.Fatal(err)
	}
	var corpus struct {
		TargetLang string                            `json:"target_lang"`
		Terms      map[string]map[string]string      `json:"terms"`
		Passages   []struct{ Source, Target string } `json:"passages"`
	}
	if err := json.Unmarshal(raw, &corpus); err != nil {
		t.Fatal(err)
	}
	if corpus.TargetLang == "" || len(corpus.Terms["tag"]) == 0 || len(corpus.Terms["trait"]) == 0 {
		t.Fatalf("lang %q, %d tag and %d trait names", corpus.TargetLang,
			len(corpus.Terms["tag"]), len(corpus.Terms["trait"]))
	}
	for category, names := range corpus.Terms {
		for source, target := range names {
			if Key(source) == "" || target == "" {
				t.Errorf("%s %q: empty name", category, source)
			}
		}
	}
	for _, p := range corpus.Passages {
		if err := CheckMarkup(p.Source, p.Target); err != nil {
			t.Errorf("%.60q: %v", p.Source, err)
		}
	}
}
