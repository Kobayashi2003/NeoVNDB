package query

import "fmt"

// A Catalog is how one entity type reaches another. The type graph has cycles
// -- a VN reaches characters, which reach VNs -- so a field table cannot hold
// a reference to another type. It holds that type's name, and the catalog
// turns the name into the type once every type has been built.
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

// Check reports any field whose Target names a type that was never
// registered. Called once after wiring, it turns a typo into a startup
// failure instead of a panic on whichever request first follows that field.
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
