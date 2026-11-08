resource "google_logging_project_exclusion" "request_urls" {
  project     = var.project_id
  name        = "${var.name_prefix}-no-request-urls"
  description = "Discard request logs before storage: OAuth callback query contains code/state."
  filter      = "resource.type=\"cloud_run_revision\" resource.labels.service_name=\"${local.review_name}\" log_id(\"run.googleapis.com/requests\")"
  disabled    = false
  depends_on  = [google_project_service.required]
}

resource "google_logging_project_exclusion" "iap_request_urls" {
  project     = var.project_id
  name        = "${var.name_prefix}-no-iap-access-urls"
  description = "IAP Data Access audit requestAttributes can contain OAuth callback URLs."
  filter      = "protoPayload.serviceName=\"iap.googleapis.com\" log_id(\"cloudaudit.googleapis.com/data_access\")"
  disabled    = false
  depends_on  = [google_project_service.required]
}

resource "google_logging_project_exclusion" "unstructured_runtime" {
  project     = var.project_id
  name        = "${var.name_prefix}-fixed-status-only"
  description = "Retain only application fixed status events, never exception/HTTP/library diagnostics."
  filter = join(" ", [
    "(resource.type=\"cloud_run_revision\" OR resource.type=\"cloud_run_job\")",
    "(resource.labels.service_name=\"${local.review_name}\" OR resource.labels.job_name=~\"^${var.name_prefix}-(weekly|recovery|cleanup)$\")",
    "(log_id(\"run.googleapis.com/stdout\") OR log_id(\"run.googleapis.com/stderr\"))",
    "NOT jsonPayload.status=~\"^(completed|pending|idle|cleaned|deferred|busy|retry|rate_limited|reauthorize|failed)$\""
  ])
  disabled   = false
  depends_on = [google_project_service.required]
}

resource "google_cloud_run_v2_job" "sync" {
  for_each            = var.deploy_workloads ? local.modes : {}
  project             = var.project_id
  name                = "${var.name_prefix}-${each.key}"
  location            = var.region
  deletion_protection = true
  labels              = local.labels
  template {
    task_count  = 1
    parallelism = 1
    template {
      service_account = google_service_account.identity[each.value.account].email
      max_retries     = 0
      timeout         = each.value.timeout
      containers {
        image   = var.container_image
        command = ["python", "-m", "scripts.strava_cloud.worker"]
        args    = [each.key]
        resources { limits = { cpu = "1", memory = "512Mi" } }
        dynamic "env" {
          for_each = local.common_env
          content {
            name  = env.key
            value = env.value
          }
        }
      }
    }
  }
  lifecycle {
    precondition {
      condition     = can(regex("^${var.region}-docker\\.pkg\\.dev/${var.project_id}/${var.name_prefix}/[a-z0-9/-]+@sha256:[0-9a-f]{64}$", var.container_image))
      error_message = "Use a digest-pinned image from the dedicated Artifact Registry repository."
    }
  }
  depends_on = [google_project_service.required, google_logging_project_exclusion.request_urls, google_logging_project_exclusion.iap_request_urls, google_logging_project_exclusion.unstructured_runtime, google_project_iam_member.state, google_storage_bucket_iam_member.cache, google_secret_manager_secret_iam_member.athlete_rotation]
}

resource "google_cloud_run_v2_service" "review" {
  count                = var.deploy_workloads ? 1 : 0
  project              = var.project_id
  name                 = local.review_name
  location             = var.region
  deletion_protection  = true
  labels               = local.labels
  ingress              = "INGRESS_TRAFFIC_ALL"
  iap_enabled          = true
  invoker_iam_disabled = false
  template {
    service_account                  = google_service_account.identity["web"].email
    timeout                          = "60s"
    max_instance_request_concurrency = 1
    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }
    containers {
      image   = var.container_image
      command = ["gunicorn"]
      args    = ["--config", "cloud/strava/gunicorn.conf.py", "scripts.strava_cloud.web:create_app()"]
      ports { container_port = 8080 }
      resources {
        limits            = { cpu = "1", memory = "512Mi" }
        cpu_idle          = true
        startup_cpu_boost = false
      }
      dynamic "env" {
        for_each = merge(local.common_env, {
          OWNER_EMAIL        = var.owner_email
          IAP_AUDIENCE       = local.iap_audience
          OAUTH_CALLBACK_URL = "${local.review_url}/oauth/callback"
        })
        content {
          name  = env.key
          value = env.value
        }
      }
    }
  }
  lifecycle {
    precondition {
      condition     = can(regex("@sha256:[0-9a-f]{64}$", var.container_image))
      error_message = "A digest-pinned container image is required."
    }
  }
  depends_on = [google_project_service.required, google_logging_project_exclusion.request_urls, google_logging_project_exclusion.iap_request_urls, google_logging_project_exclusion.unstructured_runtime, google_project_iam_member.state, google_storage_bucket_iam_member.cache, google_secret_manager_secret_iam_member.web_client_setup]
}

# Native IAP protects every route, including the default run.app URL. The sole
# invoker is the Google-managed IAP agent; no unauthenticated IAM binding exists.
resource "google_cloud_run_v2_service_iam_binding" "iap_invoker" {
  count    = var.deploy_workloads ? 1 : 0
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.review[0].name
  role     = "roles/run.invoker"
  members  = ["serviceAccount:service-${data.google_project.target.number}@gcp-sa-iap.iam.gserviceaccount.com"]
}

resource "google_iap_web_cloud_run_service_iam_binding" "owner" {
  count                  = var.deploy_workloads ? 1 : 0
  project                = var.project_id
  location               = var.region
  cloud_run_service_name = google_cloud_run_v2_service.review[0].name
  role                   = "roles/iap.httpsResourceAccessor"
  members                = ["user:${var.owner_email}"]
}

resource "google_cloud_run_v2_job_iam_member" "scheduler" {
  for_each = google_cloud_run_v2_job.sync
  project  = var.project_id
  location = var.region
  name     = each.value.name
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.identity["scheduler"].email}"
}

resource "google_cloud_scheduler_job" "sync" {
  for_each         = google_cloud_run_v2_job.sync
  project          = var.project_id
  name             = "${var.name_prefix}-${each.key}"
  region           = var.region
  schedule         = local.modes[each.key].schedule
  time_zone        = "America/Denver"
  paused           = local.paused
  attempt_deadline = "180s"
  retry_config {
    retry_count          = 0
    max_retry_duration   = "0s"
    min_backoff_duration = "60s"
    max_backoff_duration = "60s"
    max_doublings        = 0
  }
  http_target {
    uri         = "https://run.googleapis.com/v2/projects/${var.project_id}/locations/${var.region}/jobs/${each.value.name}:run"
    http_method = "POST"
    body        = base64encode("{}")
    headers     = { "Content-Type" = "application/json" }
    oauth_token {
      service_account_email = google_service_account.identity["scheduler"].email
      scope                 = "https://www.googleapis.com/auth/cloud-platform"
    }
  }
  lifecycle {
    precondition {
      condition     = !var.enable_schedulers || var.oauth_and_first_sync_verified
      error_message = "First verify cloud OAuth, one manual live sync, owner access and expiry."
    }
    precondition {
      condition     = !var.enable_schedulers || (length(var.monitoring_notification_channel_ids) > 0 || var.monitoring_email != null)
      error_message = "Scheduler activation requires an existing email notification channel or monitoring_email. Verify delivery before activation."
    }
  }
  depends_on = [google_cloud_run_v2_job_iam_member.scheduler]
}
