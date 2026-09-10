package dump

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
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

// The index names archives in two places: as links to files that exist, and as
// plain text saying where `latest` is meant to point. Those disagree while a
// dump is being published, and only the links can be fetched, so only hrefs
// are considered.
var hrefPattern = regexp.MustCompile(`href="(vndb-db-\d{4}-\d{2}-\d{2}\.tar\.zst)"`)

// Latest resolves the newest published archive.
//
// The `latest` link has redirected two different ways over time: straight at
// the dated archive, and at the directory that holds them. Either is handled,
// because which one upstream serves is not ours to decide.
func Latest(ctx context.Context, latestURL string) (*Release, error) {
	target, err := redirectTarget(ctx, latestURL)
	if err != nil {
		return nil, err
	}

	// The redirect named the archive itself.
	if m := datePattern.FindStringSubmatch(target); m != nil {
		return describe(ctx, target, m)
	}

	// It named a directory instead, so the newest archive listed there is the
	// one meant.
	name, err := newestListed(ctx, target)
	if err != nil {
		return nil, err
	}
	base, err := url.Parse(target)
	if err != nil {
		return nil, err
	}
	ref, err := url.Parse(name)
	if err != nil {
		return nil, err
	}
	return describe(ctx, base.ResolveReference(ref).String(), datePattern.FindStringSubmatch(name))
}

// redirectTarget follows one redirect and reports where it points, or the URL
// itself when it does not redirect.
func redirectTarget(ctx context.Context, from string) (string, error) {
	client := &http.Client{
		// Stop at the redirect: its target is what carries the date.
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
		Timeout: 30 * time.Second,
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodHead, from, nil)
	if err != nil {
		return "", err
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	resp.Body.Close()

	if target := resp.Header.Get("Location"); target != "" {
		base, err := url.Parse(from)
		if err != nil {
			return "", err
		}
		ref, err := url.Parse(target)
		if err != nil {
			return "", err
		}
		return base.ResolveReference(ref).String(), nil
	}
	return from, nil
}

// maxListing bounds the index page read, which should be a few kilobytes.
const maxListing = 1 << 20

// newestListed picks the newest dated archive named on an index page.
func newestListed(ctx context.Context, indexURL string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, indexURL, nil)
	if err != nil {
		return "", err
	}
	resp, err := (&http.Client{Timeout: 30 * time.Second}).Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("listing %s: %s", indexURL, resp.Status)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxListing))
	if err != nil {
		return "", err
	}

	var names []string
	for _, m := range hrefPattern.FindAllStringSubmatch(string(body), -1) {
		names = append(names, m[1])
	}
	if len(names) == 0 {
		return "", fmt.Errorf("no dump linked at %s", indexURL)
	}
	// Names sort the same as the dates they carry, so the last is the newest.
	sort.Strings(names)
	return names[len(names)-1], nil
}

// describe fills in the size and publication date, which only the archive
// itself carries.
func describe(ctx context.Context, archiveURL string, date []string) (*Release, error) {
	rel := &Release{Code: date[1] + date[2] + date[3], URL: archiveURL}

	req, err := http.NewRequestWithContext(ctx, http.MethodHead, archiveURL, nil)
	if err != nil {
		return nil, err
	}
	head, err := (&http.Client{Timeout: 30 * time.Second}).Do(req)
	if err != nil {
		return nil, err
	}
	head.Body.Close()
	// Without this an archive that is advertised but not yet published comes
	// back as a zero-byte release dated year one, and the failure only shows
	// up later as a 404 on the download.
	if head.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%s: %s", archiveURL, head.Status)
	}
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
