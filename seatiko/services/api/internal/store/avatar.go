package store

import (
	"time"

	"github.com/seatiko/api/internal/models"
)

// SetAvatar stores the new avatar URL and key and returns the previous key to delete.
func (s *MemoryStore) SetAvatar(userID, url, key string) (models.User, string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	u, ok := s.users[userID]
	if !ok || u.DeletedAt != nil {
		return models.User{}, "", ErrNotFound
	}
	previous := u.AvatarKey
	u.AvatarURL, u.AvatarKey = url, key
	u.UpdatedAt = time.Now().UTC()
	s.users[userID] = u
	s.persistBestEffortLocked()
	return u, previous, nil
}
