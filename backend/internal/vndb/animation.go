package vndb

// Release animation is packed into one smallint. vndb documents the encoding
// in its schema, and the shape is unusual enough to be worth decoding here
// rather than handing a client a bare number:
//
//	NULL  not known
//	   0  no animation
//	   1  does not apply, e.g. the release has no sprites
//	else  type flags 4 handdrawn, 8 vectorial, 16 3d, 32 live
//	      frequency flags 256 some scenes, 512 all scenes
//	      at least one type flag is set; no frequency flag means unknown
const (
	animNone      = 0
	animNotApply  = 1
	animHanddrawn = 4
	animVectorial = 8
	anim3D        = 16
	animLive      = 32
	animSome      = 256
	animAll       = 512
)

// Animation is one decoded animation column.
type Animation struct {
	Kind      string   `json:"kind"` // none | not_applicable | animated
	Types     []string `json:"types,omitempty"`
	Frequency string   `json:"frequency,omitempty"` // some | all | unknown
}

// DecodeAnimation unpacks one column. A nil input means the information was
// never recorded, which is different from a recorded "no animation".
func DecodeAnimation(v *int16) *Animation {
	if v == nil {
		return nil
	}
	switch *v {
	case animNone:
		return &Animation{Kind: "none"}
	case animNotApply:
		return &Animation{Kind: "not_applicable"}
	}

	a := &Animation{Kind: "animated", Frequency: "unknown"}
	for _, t := range []struct {
		bit  int16
		name string
	}{
		{animHanddrawn, "handdrawn"},
		{animVectorial, "vectorial"},
		{anim3D, "3d"},
		{animLive, "live"},
	} {
		if *v&t.bit != 0 {
			a.Types = append(a.Types, t.name)
		}
	}
	switch {
	case *v&animAll != 0:
		a.Frequency = "all"
	case *v&animSome != 0:
		a.Frequency = "some"
	}
	return a
}

// Resolution renders the stored width and height. 0 means unknown and the
// pair (0, 1) is vndb's way of saying the release has no fixed resolution.
func Resolution(x, y int16) *string {
	var s string
	switch {
	case x == 0 && y == 0:
		return nil
	case x == 0 && y == 1:
		s = "non-standard"
	default:
		s = itoa(x) + "x" + itoa(y)
	}
	return &s
}

func itoa(v int16) string {
	if v == 0 {
		return "0"
	}
	var buf [6]byte
	i := len(buf)
	for v > 0 {
		i--
		buf[i] = byte('0' + v%10)
		v /= 10
	}
	return string(buf[i:])
}
