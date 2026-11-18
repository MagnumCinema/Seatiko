package handlers

import (
	"net/http"
	"net/url"

	"github.com/gin-gonic/gin"
)

func (a *API) AdminOverview(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"overview": a.Store.AdminOverview()})
}

func (a *API) AdminListPeople(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"people": a.Store.AdminListPeople(), "crm_object": "People"})
}

func (a *API) AdminListCompanies(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"companies": a.Store.AdminListCompanies(), "crm_object": "Companies"})
}

func (a *API) AdminListReservations(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"reservations": a.Store.AdminListReservationRows(), "crm_object": "Reservations"})
}

func (a *API) AdminListOrders(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"orders": a.Store.AdminListOrderRows()})
}

func (a *API) AdminCRMStatus(c *gin.Context) {
	crmURL := "/crm"
	if parsed, err := url.Parse(a.CRMPublicURL); err == nil && parsed.Host != "" && (parsed.Scheme == "http" || parsed.Scheme == "https") {
		crmURL = parsed.String()
	}
	if a.CRM == nil {
		c.JSON(http.StatusOK, gin.H{"enabled": false, "healthy": false, "crm_url": crmURL})
		return
	}
	status := a.CRM.Status()
	c.JSON(http.StatusOK, gin.H{
		"enabled": status.Enabled, "healthy": status.Healthy, "running": status.Running,
		"last_success_at": status.LastSuccessAt, "last_error_at": status.LastErrorAt, "last_error": status.LastError,
		"webhook_configured": status.WebhookConfigured, "last_webhook_at": status.LastWebhookAt,
		"crm_url": crmURL, "objects": []string{"People", "Companies", "Reservations"},
	})
}
