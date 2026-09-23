package query

import "fmt"

// Catalog resolves type names once every type exists; the type graph has
// cycles (vn -> character -> vn), so field tables name their targets.
type Catalog struct{ types map[string]Nested }

func NewCatalog() *Catalog { return &Catalog{types: map[string]Nested{}} }

func (c *Catalog) Put(name string, n Nested) { c.types[name] = n }

func (c *Catalog) Get(name string) Nested {
	n, ok := c.types[name]
	if !ok {
		panic(fmt.Sprintf("catalog has no type %q", name))
	}
	return n
}

// Check makes an unknown Target a startup failure rather than a request panic.
func (c *Catalog) Check() error {
	for name, n := range c.types {
		for field, def := range n.Registry() {
			if def.Target == "" {
				continue
			}
			if _, ok := c.types[def.Target]; !ok {
				return fmt.Errorf("%s.%s targets unknown type %q", name, field, def.Target)
			}
		}
	}
	return nil
}
