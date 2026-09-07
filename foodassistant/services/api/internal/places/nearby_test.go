package places

import "testing"

func TestSearchNearbyFood_Disabled(t *testing.T) {
	c := New("")
	places, err := c.SearchNearbyFood(t.Context(), 47.7622, 27.9289, 4000)
	if err == nil {
		t.Fatal("expected error when disabled")
	}
	if places != nil {
		t.Fatalf("got places=%v", places)
	}
}
