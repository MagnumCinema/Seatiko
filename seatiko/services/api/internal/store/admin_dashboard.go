package store

import (
	"sort"
	"strings"
	"time"

	"github.com/seatiko/api/internal/models"
)

type AdminOverview struct {
	UsersTotal           int            `json:"users_total"`
	GuestsTotal          int            `json:"guests_total"`
	OwnersTotal          int            `json:"owners_total"`
	StaffTotal           int            `json:"staff_total"`
	VenuesPublished      int            `json:"venues_published"`
	ApplicationsPending  int            `json:"applications_pending"`
	ReservationsActive   int            `json:"reservations_active"`
	ReservationsTotal    int            `json:"reservations_total"`
	OrdersTotal          int            `json:"orders_total"`
	OrdersPaid           int            `json:"orders_paid"`
	RevenuePaidMDL       int            `json:"revenue_paid_mdl"`
	WaiterCallsPending   int            `json:"waiter_calls_pending"`
	ChangeRequestsOpen   int            `json:"change_requests_open"`
	ReservationsByStatus map[string]int `json:"reservations_by_status"`
	OrdersByStatus       map[string]int `json:"orders_by_status"`
}

type AdminPerson struct {
	ID          string    `json:"id"`
	Email       string    `json:"email"`
	Phone       string    `json:"phone,omitempty"`
	FirstName   string    `json:"first_name"`
	LastName    string    `json:"last_name"`
	DisplayName string    `json:"display_name"`
	Role        string    `json:"role"`
	Locale      string    `json:"locale"`
	CreatedAt   time.Time `json:"created_at"`
	CRMObject   string    `json:"crm_object"`
}

type AdminCompany struct {
	ApplicationID string                   `json:"application_id"`
	VenueID       string                   `json:"venue_id,omitempty"`
	Name          models.LocalizedString   `json:"name"`
	Status        models.ApplicationStatus `json:"status"`
	OwnerEmail    string                   `json:"owner_email"`
	OwnerName     string                   `json:"owner_name"`
	Phone         string                   `json:"phone"`
	Email         string                   `json:"email"`
	CityID        string                   `json:"city_id"`
	AverageCheck  int                      `json:"average_check"`
	Cuisine       []string                 `json:"cuisine"`
	UpdatedAt     time.Time                `json:"updated_at"`
	CRMObject     string                   `json:"crm_object"`
}

type AdminReservationRow struct {
	ID                 string                   `json:"id"`
	VenueID            string                   `json:"venue_id"`
	VenueName          models.LocalizedString   `json:"venue_name"`
	TableID            string                   `json:"table_id"`
	TableNumber        int                      `json:"table_number"`
	GuestID            string                   `json:"guest_id"`
	GuestName          string                   `json:"guest_name"`
	GuestEmail         string                   `json:"guest_email"`
	Guests             int                      `json:"guests"`
	ReservedFor        time.Time                `json:"reserved_for"`
	Status             models.ReservationStatus `json:"status"`
	Source             string                   `json:"source"`
	ArrivalConfirmedAt *time.Time               `json:"arrival_confirmed_at,omitempty"`
	CreatedAt          time.Time                `json:"created_at"`
	CRMObject          string                   `json:"crm_object"`
}

type AdminOrderRow struct {
	ID         string                 `json:"id"`
	SessionID  string                 `json:"session_id"`
	UserID     string                 `json:"user_id"`
	GuestName  string                 `json:"guest_name"`
	GuestEmail string                 `json:"guest_email"`
	VenueID    string                 `json:"venue_id"`
	VenueName  models.LocalizedString `json:"venue_name"`
	Items      []models.OrderItem     `json:"items"`
	Status     models.OrderStatus     `json:"status"`
	Total      int                    `json:"total"`
	Paid       bool                   `json:"paid"`
	CreatedAt  time.Time              `json:"created_at"`
	UpdatedAt  time.Time              `json:"updated_at"`
}

func (s *MemoryStore) AdminOverview() AdminOverview {
	s.mu.RLock()
	defer s.mu.RUnlock()

	out := AdminOverview{
		ReservationsByStatus: map[string]int{},
		OrdersByStatus:       map[string]int{},
	}
	for _, user := range s.users {
		out.UsersTotal++
		switch user.Role {
		case models.RoleGuest:
			out.GuestsTotal++
		case models.RoleRestaurant:
			out.OwnersTotal++
		case models.RoleStaff:
			out.StaffTotal++
		}
	}
	for _, app := range s.applications {
		switch app.Status {
		case models.AppPublished:
			out.VenuesPublished++
		case models.AppSubmitted, models.AppUnderReview, models.AppApproved:
			out.ApplicationsPending++
		}
	}
	for _, reservation := range s.reservations {
		out.ReservationsTotal++
		out.ReservationsByStatus[string(reservation.Status)]++
		if reservation.Status == models.ReservationConfirmed || reservation.Status == models.ReservationCheckedIn {
			out.ReservationsActive++
		}
	}
	for _, order := range s.orders {
		out.OrdersTotal++
		out.OrdersByStatus[string(order.Status)]++
		if order.Status == models.OrderPaid {
			out.OrdersPaid++
			out.RevenuePaidMDL += order.Total
		}
	}
	for _, call := range s.waiterCalls {
		if call.Status == models.WaiterPending {
			out.WaiterCallsPending++
		}
	}
	for _, change := range s.profileChanges {
		if change.Status == models.ProfileChangePending {
			out.ChangeRequestsOpen++
		}
	}
	return out
}

func (s *MemoryStore) AdminListPeople() []AdminPerson {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]AdminPerson, 0, len(s.users))
	for _, user := range s.users {
		out = append(out, AdminPerson{
			ID: user.ID, Email: user.Email, Phone: user.Phone,
			FirstName: user.FirstName, LastName: user.LastName, DisplayName: user.DisplayName,
			Role: user.Role, Locale: user.Locale, CreatedAt: user.CreatedAt, CRMObject: "People",
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	return out
}

func (s *MemoryStore) AdminListCompanies() []AdminCompany {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]AdminCompany, 0, len(s.applications))
	for _, app := range s.applications {
		ownerEmail, ownerName := "", ""
		if owner, ok := s.users[app.OwnerUserID]; ok {
			ownerEmail = owner.Email
			ownerName = owner.DisplayName
			if ownerName == "" {
				ownerName = strings.TrimSpace(owner.FirstName + " " + owner.LastName)
			}
		}
		venueID := ""
		if app.VenueID != nil {
			venueID = *app.VenueID
		}
		out = append(out, AdminCompany{
			ApplicationID: app.ID, VenueID: venueID, Name: app.Name, Status: app.Status,
			OwnerEmail: ownerEmail, OwnerName: ownerName, Phone: app.Phone, Email: app.Email,
			CityID: app.CityID, AverageCheck: app.AverageCheck, Cuisine: append([]string(nil), app.Cuisine...),
			UpdatedAt: app.UpdatedAt, CRMObject: "Companies",
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].UpdatedAt.After(out[j].UpdatedAt) })
	return out
}

func (s *MemoryStore) AdminListReservationRows() []AdminReservationRow {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]AdminReservationRow, 0, len(s.reservations))
	for _, reservation := range s.reservations {
		row := AdminReservationRow{
			ID: reservation.ID, VenueID: reservation.VenueID, TableID: reservation.TableID,
			GuestID: reservation.UserID, Guests: reservation.Guests, ReservedFor: reservation.ReservedFor,
			Status: reservation.Status, Source: reservation.Source,
			ArrivalConfirmedAt: reservation.ArrivalConfirmedAt, CreatedAt: reservation.CreatedAt,
			CRMObject: "Reservations",
		}
		if venue, ok := s.venues[reservation.VenueID]; ok {
			row.VenueName = venue.Name
		}
		if table, ok := s.tables[reservation.TableID]; ok {
			row.TableNumber = table.Number
		}
		if guest, ok := s.users[reservation.UserID]; ok {
			row.GuestEmail = guest.Email
			row.GuestName = guest.DisplayName
			if row.GuestName == "" {
				row.GuestName = strings.TrimSpace(guest.FirstName + " " + guest.LastName)
			}
		}
		out = append(out, row)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ReservedFor.After(out[j].ReservedFor) })
	return out
}

func (s *MemoryStore) AdminListOrderRows() []AdminOrderRow {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]AdminOrderRow, 0, len(s.orders))
	for _, order := range s.orders {
		row := AdminOrderRow{
			ID: order.ID, SessionID: order.SessionID, UserID: order.UserID, VenueID: order.VenueID,
			Items: append([]models.OrderItem(nil), order.Items...), Status: order.Status, Total: order.Total,
			Paid: order.Status == models.OrderPaid, CreatedAt: order.CreatedAt, UpdatedAt: order.UpdatedAt,
		}
		if venue, ok := s.venues[order.VenueID]; ok {
			row.VenueName = venue.Name
		}
		if guest, ok := s.users[order.UserID]; ok {
			row.GuestEmail = guest.Email
			row.GuestName = guest.DisplayName
			if row.GuestName == "" {
				row.GuestName = strings.TrimSpace(guest.FirstName + " " + guest.LastName)
			}
		}
		out = append(out, row)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	return out
}
