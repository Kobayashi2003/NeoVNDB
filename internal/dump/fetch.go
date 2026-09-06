package dump

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"time"
)

// Release identifies one published archive.
type Release struct {
	Code        string // '20260903', taken from the redirect target
	URL         string
	PublishedAt time.Time
	Size        int64
}

// dl.vndb.org redirects `latest` to a date-stamped file, so a HEAD is enough
// to learn which day is current without downloading anything.
var datePattern = regexp.MustCompile(`vndb-db-(\d{4})-(\d{2})-(\d{2})\.tar\.zst`)

// Latest resolves the newest published archive.
func Latest(ctx context.Context, latestURL string) (*Release, error) {
	client := &http.Client{
		// Stop at the redirect: its target is what carries the date.
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
		Timeout: 30 * time.Second,
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodHead, latestURL, nil)
	if err != nil {
		return nil, err
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	resp.Body.Close()

	target := resp.Header.Get("Location")
	if target == "" {
		target = latestURL
	}
	m := datePattern.FindStringSubmatch(target)
	if m == nil {
		return nil, fmt.Errorf("cannot read a date out of %q", target)
	}
	rel := &Release{Code: m[1] + m[2] + m[3], URL: target}

	// The redirect target carries the size and Last-Modified; the redirect
	// itself does not.
	req, err = http.NewRequestWithContext(ctx, http.MethodHead, target, nil)
	if err != nil {
		return nil, err
	}
	head, err := (&http.Client{Timeout: 30 * time.Second}).Do(req)
	if err != nil {
		return nil, err
	}
	head.Body.Close()
	rel.Size = head.ContentLength
	if lm := head.Header.Get("Last-Modified"); lm != "" {
		if t, err := http.ParseTime(lm); err == nil {
			rel.PublishedAt = t
		}
	}
	return rel, nil
}

// Download fetches the release into dir unless it is already there, and
// returns the local path and its digest. Downloads land on a temporary name
// first so an interrupted run cannot leave a half file that looks complete.
func Download(ctx context.Context, rel *Release, dir string) (path, sum string, err error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", "", err
	}
	path = filepath.Join(dir, filepath.Base(rel.URL))

	if info, statErr := os.Stat(path); statErr == nil && (rel.Size <= 0 || info.Size() == rel.Size) {
		sum, err = digest(path)
		return path, sum, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rel.URL, nil)
	if err != nil {
		return "", "", err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", "", fmt.Errorf("download %s: %s", rel.URL, resp.Status)
	}

	tmp, err := os.CreateTemp(dir, ".download-*")
	if err != nil {
		return "", "", err
	}
	defer os.Remove(tmp.Name())

	h := sha256.New()
	if _, err := io.Copy(io.MultiWriter(tmp, h), resp.Body); err != nil {
		tmp.Close()
		return "", "", err
	}
	if err := tmp.Close(); err != nil {
		return "", "", err
	}
	if err := os.Rename(tmp.Name(), path); err != nil {
		return "", "", err
	}
	return path, hex.EncodeToString(h.Sum(nil)), nil
}

func digest(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}
