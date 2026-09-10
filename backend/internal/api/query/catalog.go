package query

import "fmt"

// A Catalog is how one entity type reaches another. The type graph has cycles
// -- a VN reaches characters, which reach VNs -- so a field table names the
// type it points at and the catalog resolves that once every type exists.
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

// Check turns a Target that names no registered type into a startup failure
// rather than a panic on whichever request first follows that field.
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
