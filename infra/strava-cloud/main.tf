data "google_project" "target" {
  project_id = var.project_id
}

locals {
  labels       = { application = "private-strava", data_class = "transient-private" }
  review_name  = "${var.name_prefix}-review"
  review_url   = "https://${local.review_name}-${data.google_project.target.number}.${var.region}.run.app"
  iap_audience = "/projects/${data.google_project.target.number}/locations/${var.region}/services/${local.review_name}"
  paused       = !(var.enable_schedulers && var.oauth_and_first_sync_verified)
  modes = {
    weekly   = { schedule = "0 9 * * 1", account = "worker", timeout = "1800s" }
    recovery = { schedule = "17 * * * *", account = "worker", timeout = "1800s" }
    cleanup  = { schedule = "37 * * * *", account = "cleanup", timeout = "300s" }
  }
  apis = toset([
    "artifactregistry.googleapis.com", "cloudbuild.googleapis.com",
    "cloudscheduler.googleapis.com", "cloudresourcemanager.googleapis.com", "firestore.googleapis.com", "iam.googleapis.com",
    "iamcredentials.googleapis.com", "iap.googleapis.com", "logging.googleapis.com",
    "monitoring.googleapis.com", "run.googleapis.com", "secretmanager.googleapis.com",
    "serviceusage.googleapis.com", "sts.googleapis.com", "storage.googleapis.com"
  ])
  common_env = {
    STRAVA_PROJECT_ID              = var.project_id
    STRAVA_FIRESTORE_DATABASE      = google_firestore_database.control.name
    STRAVA_STATE_COLLECTION        = var.state_collection
    STRAVA_CACHE_BUCKET            = google_storage_bucket.cache.name
    STRAVA_CLIENT_SECRET_RESOURCE  = google_secret_manager_secret.client.id
    STRAVA_ATHLETE_SECRET_RESOURCE = google_secret_manager_secret.athlete.id
  }
}

check "activation_requires_owner_verification" {
  assert {
    condition     = !var.enable_schedulers || (var.deploy_workloads && var.oauth_and_first_sync_verified)
    error_message = "Scheduler activation requires deployed workloads and owner-verified OAuth plus first sync."
  }
}

resource "google_project_service" "required" {
  for_each           = local.apis
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

resource "google_service_account" "identity" {
  for_each     = toset(["worker", "web", "cleanup", "scheduler", "build", "deploy", "admin"])
  project      = var.project_id
  account_id   = "${var.name_prefix}-${each.value}"
  display_name = "Private Strava ${each.value}"
  depends_on   = [google_project_service.required]
}

resource "google_storage_bucket" "cache" {
  project                     = var.project_id
  name                        = "${var.project_id}-${var.name_prefix}-48h"
  location                    = var.region
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  labels                      = local.labels
  versioning { enabled = false }
  soft_delete_policy { retention_duration_seconds = 0 }
  lifecycle_rule {
    action { type = "Delete" }
    condition { age = 2 }
  }
  # No retention_policy, object holds, soft deletion, replication, or archive.
  # Runtime refuses reads at 48h; hourly cleanup physically removes expired data.
  depends_on = [google_project_service.required]
}

resource "google_storage_bucket" "build_source" {
  project                     = var.project_id
  name                        = "${var.project_id}-${var.name_prefix}-build-source"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  versioning { enabled = false }
  soft_delete_policy { retention_duration_seconds = 0 }
  lifecycle_rule {
    action { type = "Delete" }
    condition { age = 1 }
  }
  depends_on = [google_project_service.required]
}

resource "google_firestore_database" "control" {
  project                           = var.project_id
  name                              = var.firestore_database
  location_id                       = var.region
  type                              = "FIRESTORE_NATIVE"
  concurrency_mode                  = "PESSIMISTIC"
  app_engine_integration_mode       = "DISABLED"
  point_in_time_recovery_enablement = "POINT_IN_TIME_RECOVERY_DISABLED"
  delete_protection_state           = "DELETE_PROTECTION_ENABLED"
  deletion_policy                   = "ABANDON"
  # No backups/schedules/exports. Content-free control records only.
  depends_on = [google_project_service.required]
}

# CSRF digests expire at read time and are pruned transactionally. Do not add
# TTL to the durable checkpoint document or enable billable TTL deletion.

# Empty secret containers only. The owner-only HTTPS app writes versions, and
# Firestore records an explicit numeric current-version pointer; never 'latest'.
resource "google_secret_manager_secret" "client" {
  project   = var.project_id
  secret_id = "${var.name_prefix}-client"
  labels    = local.labels
  replication {
    auto {}
  }
  deletion_protection = true
  depends_on          = [google_project_service.required]
}

resource "google_secret_manager_secret" "athlete" {
  project   = var.project_id
  secret_id = "${var.name_prefix}-athlete"
  labels    = local.labels
  replication {
    auto {}
  }
  deletion_protection = true
  depends_on          = [google_project_service.required]
}

resource "google_artifact_registry_repository" "images" {
  project       = var.project_id
  location      = var.region
  repository_id = var.name_prefix
  format        = "DOCKER"
  description   = "Private Strava source-only immutable runtime images"
  docker_config { immutable_tags = true }
  cleanup_policy_dry_run = false
  cleanup_policies {
    id     = "keep-five-releases"
    action = "KEEP"
    most_recent_versions { keep_count = 5 }
  }
  cleanup_policies {
    id     = "delete-old-untagged"
    action = "DELETE"
    condition {
      tag_state  = "UNTAGGED"
      older_than = "604800s"
    }
  }
  depends_on = [google_project_service.required]
}
