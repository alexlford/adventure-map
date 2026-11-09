# Runtime roles are custom, bound to one resource or one named database. IAM
# configuration rights belong only to the manually bootstrapped administrator.
resource "google_project_iam_custom_role" "state" {
  project = var.project_id
  role_id = "${replace(var.name_prefix, "-", "_")}_control"
  title   = "Private Strava control transactions"
  permissions = [
    "datastore.databases.get", "datastore.entities.get", "datastore.entities.list",
    "datastore.entities.create", "datastore.entities.update", "datastore.entities.delete"
  ]
  depends_on = [google_project_service.required]
}

resource "google_project_iam_member" "state" {
  for_each = toset(["worker", "web"])
  project  = var.project_id
  role     = google_project_iam_custom_role.state.name
  member   = "serviceAccount:${google_service_account.identity[each.value].email}"
  condition {
    title      = "only-private-control-database"
    expression = "resource.name == 'projects/${var.project_id}/databases/${var.firestore_database}'"
  }
}

resource "google_project_iam_custom_role" "cache" {
  for_each = {
    worker  = ["storage.objects.get", "storage.objects.list", "storage.objects.create", "storage.objects.delete"]
    web     = ["storage.objects.get", "storage.objects.list", "storage.objects.delete"]
    cleanup = ["storage.objects.list", "storage.objects.delete"]
  }
  project     = var.project_id
  role_id     = "${replace(var.name_prefix, "-", "_")}_${each.key}_cache"
  title       = "Private Strava ${each.key} transient cache"
  permissions = each.value
  depends_on  = [google_project_service.required]
}

resource "google_storage_bucket_iam_member" "cache" {
  for_each = google_project_iam_custom_role.cache
  bucket   = google_storage_bucket.cache.name
  role     = each.value.name
  member   = "serviceAccount:${google_service_account.identity[each.key].email}"
}

resource "google_project_iam_custom_role" "rotate" {
  project = var.project_id
  role_id = "${replace(var.name_prefix, "-", "_")}_secret_rotation"
  title   = "Private Strava version rotation"
  permissions = [
    "secretmanager.versions.add", "secretmanager.versions.access", "secretmanager.versions.list",
    "secretmanager.versions.disable", "secretmanager.versions.destroy"
  ]
  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret_iam_member" "athlete_rotation" {
  for_each  = toset(["worker", "web"])
  project   = var.project_id
  secret_id = google_secret_manager_secret.athlete.secret_id
  role      = google_project_iam_custom_role.rotate.name
  member    = "serviceAccount:${google_service_account.identity[each.value].email}"
}

resource "google_secret_manager_secret_iam_member" "web_client_setup" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.client.secret_id
  role      = google_project_iam_custom_role.rotate.name
  member    = "serviceAccount:${google_service_account.identity["web"].email}"
}

resource "google_secret_manager_secret_iam_member" "worker_client_read" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.client.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.identity["worker"].email}"
}

resource "google_project_iam_custom_role" "client_cleanup" {
  project     = var.project_id
  role_id     = "${replace(var.name_prefix, "-", "_")}_client_version_cleanup"
  title       = "Private Strava superseded client versions"
  permissions = ["secretmanager.versions.list", "secretmanager.versions.destroy"]
  depends_on  = [google_project_service.required]
}

resource "google_secret_manager_secret_iam_member" "worker_client_cleanup" {
  project   = var.project_id
  secret_id = google_secret_manager_secret.client.secret_id
  role      = google_project_iam_custom_role.client_cleanup.name
  member    = "serviceAccount:${google_service_account.identity["worker"].email}"
}

resource "google_artifact_registry_repository_iam_member" "builder" {
  project    = var.project_id
  location   = var.region
  repository = google_artifact_registry_repository.images.repository_id
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.identity["build"].email}"
}

resource "google_storage_bucket_iam_member" "source_builder" {
  bucket = google_storage_bucket.build_source.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.identity["build"].email}"
}

resource "google_storage_bucket_iam_member" "source_deployer" {
  bucket = google_storage_bucket.build_source.name
  role   = google_project_iam_custom_role.source_upload.name
  member = "serviceAccount:${google_service_account.identity["deploy"].email}"
}

resource "google_project_iam_custom_role" "source_upload" {
  project     = var.project_id
  role_id     = "${replace(var.name_prefix, "-", "_")}_source_upload"
  title       = "Private Strava source-only upload"
  permissions = ["storage.buckets.get", "storage.objects.create"]
  depends_on  = [google_project_service.required]
}

resource "google_artifact_registry_repository_iam_member" "deployer" {
  project    = var.project_id
  location   = var.region
  repository = google_artifact_registry_repository.images.repository_id
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:${google_service_account.identity["deploy"].email}"
}

resource "google_project_iam_custom_role" "build_submit" {
  project     = var.project_id
  role_id     = "${replace(var.name_prefix, "-", "_")}_build_submit"
  title       = "Private Strava source build submission"
  permissions = ["cloudbuild.builds.create", "cloudbuild.builds.get", "serviceusage.services.use"]
  depends_on  = [google_project_service.required]
}

resource "google_project_iam_member" "build_submit" {
  project = var.project_id
  role    = google_project_iam_custom_role.build_submit.name
  member  = "serviceAccount:${google_service_account.identity["deploy"].email}"
}

resource "google_project_iam_custom_role" "deploy" {
  project = var.project_id
  role_id = "${replace(var.name_prefix, "-", "_")}_image_deploy"
  title   = "Private Strava immutable image updates"
  permissions = [
    "run.services.get", "run.services.update", "run.jobs.get", "run.jobs.update",
    "run.operations.get"
  ]
  depends_on = [google_project_service.required]
}

resource "google_project_iam_member" "deploy" {
  project = var.project_id
  role    = google_project_iam_custom_role.deploy.name
  member  = "serviceAccount:${google_service_account.identity["deploy"].email}"
  condition {
    title = "only-private-strava-workloads"
    expression = join(" || ", concat(
      ["resource.name == 'projects/${var.project_id}/locations/${var.region}/services/${local.review_name}'"],
      [for mode in keys(local.modes) : "resource.name == 'projects/${var.project_id}/locations/${var.region}/jobs/${var.name_prefix}-${mode}'"],
      ["resource.name.startsWith('projects/${var.project_id}/locations/${var.region}/operations/')"]
    ))
  }
}

resource "google_service_account_iam_member" "deployer_act_as" {
  for_each           = toset(["worker", "cleanup", "web", "build"])
  service_account_id = google_service_account.identity[each.value].name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.identity["deploy"].email}"
}

# Administrator configures infrastructure, cannot directly read object contents
# or Secret Manager versions. setIamPolicy is privileged; use only for reviewed
# Terraform applies in this dedicated project, never for application execution.
resource "google_project_iam_custom_role" "admin" {
  project = var.project_id
  role_id = "${replace(var.name_prefix, "-", "_")}_infrastructure_admin"
  title   = "Private Strava infrastructure configuration"
  permissions = [
    "resourcemanager.projects.get", "resourcemanager.projects.getIamPolicy", "resourcemanager.projects.setIamPolicy",
    "serviceusage.services.get", "serviceusage.services.list", "serviceusage.services.enable", "serviceusage.services.use", "serviceusage.operations.get",
    "iam.roles.create", "iam.roles.get", "iam.roles.list", "iam.roles.update", "iam.roles.delete", "iam.roles.undelete",
    "iam.serviceAccounts.create", "iam.serviceAccounts.get", "iam.serviceAccounts.list", "iam.serviceAccounts.update", "iam.serviceAccounts.delete", "iam.serviceAccounts.getIamPolicy", "iam.serviceAccounts.setIamPolicy",
    "run.services.create", "run.services.get", "run.services.update", "run.services.delete", "run.services.getIamPolicy", "run.services.setIamPolicy",
    "run.jobs.create", "run.jobs.get", "run.jobs.update", "run.jobs.delete", "run.jobs.getIamPolicy", "run.jobs.setIamPolicy", "run.operations.get",
    "cloudscheduler.jobs.create", "cloudscheduler.jobs.get", "cloudscheduler.jobs.update", "cloudscheduler.jobs.delete", "cloudscheduler.jobs.pause", "cloudscheduler.jobs.enable",
    "storage.buckets.create", "storage.buckets.get", "storage.buckets.update", "storage.buckets.delete", "storage.buckets.getIamPolicy", "storage.buckets.setIamPolicy",
    "secretmanager.secrets.create", "secretmanager.secrets.get", "secretmanager.secrets.update", "secretmanager.secrets.delete", "secretmanager.secrets.getIamPolicy", "secretmanager.secrets.setIamPolicy",
    "datastore.databases.create", "datastore.databases.getMetadata", "datastore.databases.update", "datastore.databases.list", "datastore.operations.get", "datastore.indexes.create", "datastore.indexes.get", "datastore.indexes.update", "datastore.indexes.delete",
    "artifactregistry.repositories.create", "artifactregistry.repositories.get", "artifactregistry.repositories.update", "artifactregistry.repositories.delete", "artifactregistry.repositories.getIamPolicy", "artifactregistry.repositories.setIamPolicy",
    "logging.exclusions.create", "logging.exclusions.get", "logging.exclusions.update", "logging.exclusions.delete", "logging.logMetrics.create", "logging.logMetrics.get", "logging.logMetrics.update", "logging.logMetrics.delete",
    "monitoring.alertPolicies.create", "monitoring.alertPolicies.get", "monitoring.alertPolicies.update", "monitoring.alertPolicies.delete", "monitoring.notificationChannels.create", "monitoring.notificationChannels.get", "monitoring.notificationChannels.update", "monitoring.notificationChannels.delete",
    "iap.webServices.getIamPolicy", "iap.webServices.setIamPolicy",
    "iam.workloadIdentityPools.create", "iam.workloadIdentityPools.get", "iam.workloadIdentityPools.update", "iam.workloadIdentityPools.delete", "iam.workloadIdentityPoolProviders.create", "iam.workloadIdentityPoolProviders.get", "iam.workloadIdentityPoolProviders.update", "iam.workloadIdentityPoolProviders.delete"
  ]
  depends_on = [google_project_service.required]
}

resource "google_project_iam_member" "admin" {
  project = var.project_id
  role    = google_project_iam_custom_role.admin.name
  member  = "serviceAccount:${google_service_account.identity["admin"].email}"
}

resource "google_service_account_iam_member" "admin_act_as" {
  for_each           = toset(["worker", "cleanup", "web", "build", "scheduler"])
  service_account_id = google_service_account.identity[each.value].name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.identity["admin"].email}"
}

resource "google_iam_workload_identity_pool" "github" {
  count                     = var.github_repository == "" ? 0 : 1
  project                   = var.project_id
  workload_identity_pool_id = "${var.name_prefix}-github"
  display_name              = "Private Strava GitHub deploy"
  depends_on                = [google_project_service.required]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  count                              = var.github_repository == "" ? 0 : 1
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github[0].workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  attribute_mapping = {
    "google.subject"                = "assertion.sub"
    "attribute.repository_id"       = "assertion.repository_id"
    "attribute.repository_owner_id" = "assertion.repository_owner_id"
  }
  attribute_condition = "assertion.repository == '${var.github_repository}' && assertion.repository_id == '${var.github_repository_id}' && assertion.repository_owner_id == '${var.github_repository_owner_id}' && assertion.ref == 'refs/heads/${var.github_deploy_branch}' && assertion.sub == 'repo:${var.github_repository}:environment:strava-cloud-production'"
  oidc { issuer_uri = "https://token.actions.githubusercontent.com" }
  lifecycle {
    precondition {
      condition     = can(regex("^[0-9]+$", var.github_repository_id)) && can(regex("^[0-9]+$", var.github_repository_owner_id)) && can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repository))
      error_message = "GitHub federation requires exact repository and immutable numeric repository/owner IDs."
    }
  }
}

resource "google_service_account_iam_member" "github_deployer" {
  count              = var.github_repository == "" ? 0 : 1
  service_account_id = google_service_account.identity["deploy"].name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github[0].name}/attribute.repository_id/${var.github_repository_id}"
}
