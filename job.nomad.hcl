job "smingo" {
  type = "service"

  group "smingo" {
    network {
      port "http" { }
    }

    service {
      name     = "smingo"
      port     = "http"
      provider = "nomad"
      tags = [
        "traefik.enable=true",
        "traefik.http.routers.smingo.rule=Host(`smingo.datasektionen.se`)",
        "traefik.http.routers.smingo.tls.certresolver=default",
      ]
    }

    task "smingo" {
      driver = "docker"

      config {
        image = var.image_tag
        ports = ["http"]
      }

      template {
        data        = <<ENV
{{ with nomadVar "nomad/jobs/smingo" }}
COOKIE_SECRET={{ .cookie_secret }}
SSO_CLIENT_ID={{ .sso_client_id }}
SSO_CLIENT_SECRET={{ .sso_client_secret }}
RFINGER_API_KEY={{ .rfinger_api_key }}
{{ end }}
PORT={{ env "NOMAD_PORT_http" }}
WEBSITE_URL=https://smingo.datasektionen.se
ADMIN_KTHIDS=liamt,mathm,kalindbl,viktoe
ENV
        destination = "local/.env"
        env         = true
      }

      resources {
        memory = 100
      }
    }
  }
}

variable "image_tag" {
  type = string
  default = "ghcr.io/datasektionen/smingo:latest"
}
