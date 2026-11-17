package apidocs

import (
	_ "embed"
	"net/http"

	"github.com/gin-gonic/gin"
	swaggerfiles "github.com/swaggo/files/v2"
)

//go:embed openapi.yaml
var spec []byte

//go:embed index.html
var index []byte

//go:embed swagger.js
var initScript []byte

func Register(r *gin.Engine) {
	r.GET("/api/openapi.yaml", func(c *gin.Context) {
		c.Data(http.StatusOK, "application/yaml; charset=utf-8", spec)
	})
	r.GET("/api/docs", func(c *gin.Context) {
		c.Data(http.StatusOK, "text/html; charset=utf-8", index)
	})
	r.GET("/api/docs/swagger.js", func(c *gin.Context) {
		c.Data(http.StatusOK, "text/javascript; charset=utf-8", initScript)
	})
	r.StaticFS("/api/docs/assets", http.FS(swaggerfiles.FS))
}
