package store

import (
	"path/filepath"
	"strings"
	"testing"

	"github.com/seatiko/api/internal/models"
)

func TestDemoMenuCoversEveryVenue(t *testing.T) {
	mem := NewMemory()
	seen := map[string]bool{}
	for venueID, venue := range mem.venues {
		items, err := mem.ListMenu(venueID)
		if err != nil {
			t.Fatalf("%s: %v", venueID, err)
		}
		if len(items) < 12 {
			t.Errorf("%s: want a full demo menu, got %d dishes", venueID, len(items))
		}
		closed := map[string]bool{}
		current := ""
		for i, item := range items {
			if seen[item.ID] {
				t.Errorf("duplicate menu id %s", item.ID)
			}
			seen[item.ID] = true
			if item.Position != i+1 {
				t.Errorf("%s: %s has position %d, want %d", venueID, item.ID, item.Position, i+1)
			}
			if item.Name.RU == "" || item.Name.EN == "" || item.Name.RO == "" ||
				item.Category.RU == "" || item.Category.EN == "" || item.Category.RO == "" {
				t.Errorf("%s: %s misses a translation", venueID, item.ID)
			}
			if item.Price <= 0 {
				t.Errorf("%s: %s has no price", venueID, item.ID)
			}
			if item.ImageURL == "" {
				t.Errorf("%s: %s has no image", venueID, item.ID)
			}
			if item.Ingredients.RU == "" || item.Ingredients.EN == "" || item.Ingredients.RO == "" {
				t.Errorf("%s: %s misses ingredients", venueID, item.ID)
			}
			if strings.Contains(strings.ToLower(item.Name.EN+" "+item.Category.EN), "antipast") &&
				strings.Contains(strings.ToLower(item.Ingredients.EN), "hops") {
				t.Errorf("%s: %s got beer ingredients (ipa/antipasti collision)", venueID, item.ID)
			}
			if (item.WeightG > 0) == (item.VolumeML > 0) {
				t.Errorf("%s: %s needs exactly one of weight or volume", venueID, item.ID)
			}
			if item.ContainsAlcohol && !venue.AlcoholLicense {
				t.Errorf("%s: %s is alcoholic but the venue has no licence", venueID, item.ID)
			}
			for _, tag := range item.Tags {
				if tag != tagPopular && tag != tagVegetarian && tag != tagSpicy {
					t.Errorf("%s: %s has unknown tag %q", venueID, item.ID, tag)
				}
			}
			if item.Category.RU != current {
				if closed[item.Category.RU] {
					t.Errorf("%s: category %q is split", venueID, item.Category.RU)
				}
				if current != "" {
					closed[current] = true
				}
				current = item.Category.RU
			}
		}
	}
}

func TestEnsureDemoMenuBackfillsOldSnapshotsOnce(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.json")

	old := NewMemory()
	old.dataFile = path
	stopped := old.menuItems["m1"]
	stopped.Stopped = true
	custom := models.MenuItem{ID: "owner-dish", VenueID: "venue-1", Name: models.LocalizedString{RU: "Своё"}, Price: 10}
	old.menuItems = map[string]models.MenuItem{"m1": stopped, custom.ID: custom}
	old.demoMenuVer = 0
	if err := old.persist(); err != nil {
		t.Fatalf("persist: %v", err)
	}

	loaded, err := NewPersistent(path)
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if got, want := len(loaded.menuItems), len(demoMenu())+1; got != want {
		t.Fatalf("menu items after backfill = %d, want %d", got, want)
	}
	if !loaded.menuItems["m1"].Stopped {
		t.Error("backfill must keep the stop-list flag of a seeded dish")
	}
	if _, ok := loaded.menuItems[custom.ID]; !ok {
		t.Error("backfill must keep dishes added by the owner")
	}

	delete(loaded.menuItems, "m2")
	if err := loaded.persist(); err != nil {
		t.Fatalf("persist: %v", err)
	}
	again, err := NewPersistent(path)
	if err != nil {
		t.Fatalf("reload: %v", err)
	}
	if _, ok := again.menuItems["m2"]; ok {
		t.Error("a dish deleted after the backfill must not come back")
	}
}

func TestOwnerEditKeepsPortionTagsAndPosition(t *testing.T) {
	mem := NewMemory()
	owner, _, venueID := publishTestVenue(t, mem, "menu-edit-owner@example.com")
	weight := 250
	created, err := mem.UpsertMenuItem(owner.ID, venueID, MenuItemInput{
		Name:    models.LocalizedString{RU: "Плацинда"},
		Price:   45,
		WeightG: &weight,
		Tags:    []string{tagPopular},
	})
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	created.Position = 3
	mem.menuItems[created.ID] = created

	edited, err := mem.UpsertMenuItem(owner.ID, venueID, MenuItemInput{
		ID:    created.ID,
		Name:  created.Name,
		Price: 50,
	})
	if err != nil {
		t.Fatalf("edit: %v", err)
	}
	if edited.Price != 50 || edited.WeightG != 250 || edited.Position != 3 || len(edited.Tags) != 1 {
		t.Errorf("edit lost portion, tags or position: %+v", edited)
	}
}
