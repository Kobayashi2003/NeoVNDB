// Package settings holds what an administrator may change while a service
// runs. Each service has its own set, starting from .env; the admin page's
// changes are kept in a JSON file of only the values that differ from .env,
// which wins over .env at the next start. Setting a value back to .env's
// takes it out of the file.
package settings

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

// Duration is a time.Duration written as Go writes one ("1h0m0s").
type Duration time.Duration

func (d Duration) MarshalText() ([]byte, error) { return []byte(time.Duration(d).String()), nil }

func (d *Duration) UnmarshalText(b []byte) error {
	v, err := time.ParseDuration(string(b))
	*d = Duration(v)
	return err
}

// Live is one service's settings, T being a struct of JSON fields.
type Live[T any] struct {
	path  string
	check func(T) error

	mu       sync.Mutex
	base     T
	current  T
	watchers []func(T)
}

// Open starts from base (.env) and applies what the file at path holds. A
// value in the file that does not pass check stops the service, as a bad
// .env value does.
func Open[T any](path string, base T, check func(T) error) (*Live[T], error) {
	if err := check(base); err != nil {
		return nil, err
	}
	l := &Live[T]{path: path, check: check, base: base, current: base}
	saved, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return l, nil
	}
	if err != nil {
		return nil, err
	}
	if l.current, err = l.merge(base, saved); err != nil {
		return nil, fmt.Errorf("%s: %w", path, err)
	}
	return l, nil
}

// Get is the settings in force.
func (l *Live[T]) Get() T {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.current
}

// Base is what .env says.
func (l *Live[T]) Base() T {
	return l.base
}

// Watch calls fn with the new settings after each change. Changes close
// together may reach fn out of order; fn that must end on the latest reads
// Get.
func (l *Live[T]) Watch(fn func(T)) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.watchers = append(l.watchers, fn)
}

// Set applies a JSON object of some of the fields, keeps the result and
// tells the watchers. Nothing changes if any field is unknown or invalid.
func (l *Live[T]) Set(patch []byte) (T, error) {
	l.mu.Lock()
	next, err := l.merge(l.current, patch)
	if err == nil {
		err = l.save(next)
	}
	if err != nil {
		l.mu.Unlock()
		return next, err
	}
	l.current = next
	watchers := append([]func(T){}, l.watchers...)
	l.mu.Unlock()

	for _, fn := range watchers {
		fn(next)
	}
	return next, nil
}

// merge lays patch's fields over from.
func (l *Live[T]) merge(from T, patch []byte) (T, error) {
	var out T
	fields, err := fieldsOf(from)
	if err != nil {
		return out, err
	}
	var changes map[string]json.RawMessage
	if err := json.Unmarshal(patch, &changes); err != nil {
		return out, fmt.Errorf("not a JSON object: %w", err)
	}
	for name, value := range changes {
		if _, ok := fields[name]; !ok {
			return out, fmt.Errorf("no setting %q", name)
		}
		fields[name] = value
	}
	merged, err := json.Marshal(fields)
	if err != nil {
		return out, err
	}
	if err := json.Unmarshal(merged, &out); err != nil {
		return out, err
	}
	return out, l.check(out)
}

// save writes the fields of next that differ from .env, or removes the file
// when none do. Temporary file and rename, so a crash leaves the old one.
func (l *Live[T]) save(next T) error {
	base, err := fieldsOf(l.base)
	if err != nil {
		return err
	}
	now, err := fieldsOf(next)
	if err != nil {
		return err
	}
	changed := map[string]json.RawMessage{}
	for name, value := range now {
		if !bytes.Equal(value, base[name]) {
			changed[name] = value
		}
	}
	if len(changed) == 0 {
		if err := os.Remove(l.path); err != nil && !errors.Is(err, os.ErrNotExist) {
			return err
		}
		return nil
	}

	data, err := json.MarshalIndent(changed, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(l.path), 0o755); err != nil {
		return err
	}
	tmp := l.path + ".tmp"
	if err := os.WriteFile(tmp, append(data, '\n'), 0o644); err != nil {
		return err
	}
	return os.Rename(tmp, l.path)
}

// Changed names the fields that differ from .env, in order.
func (l *Live[T]) Changed() []string {
	base, _ := fieldsOf(l.base)
	now, _ := fieldsOf(l.Get())
	out := []string{}
	for name, value := range now {
		if !bytes.Equal(value, base[name]) {
			out = append(out, name)
		}
	}
	sort.Strings(out)
	return out
}

func fieldsOf(v any) (map[string]json.RawMessage, error) {
	data, err := json.Marshal(v)
	if err != nil {
		return nil, err
	}
	var fields map[string]json.RawMessage
	return fields, json.Unmarshal(data, &fields)
}
