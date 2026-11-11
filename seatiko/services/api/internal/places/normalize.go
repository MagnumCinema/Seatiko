package places

import "strings"

func NormalizePlaceID(id string) string {
	id = strings.TrimSpace(id)
	return strings.TrimPrefix(id, "places/")
}
