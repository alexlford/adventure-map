# Mocked provider plans only. No credentials, state documents or cloud requests.
mock_provider "google" {
  mock_data "google_project" {
    defaults = { number = "123456789012" }
  }
}

variables {
  project_id  = "synthetic-private-project"
  owner_email = "owner@example.com"
}

run "bootstrap_is_inert" {
  command = plan
  assert {
    condition     = output.schedulers_paused && length(google_cloud_run_v2_job.sync) == 0 && length(google_cloud_run_v2_service.review) == 0
    error_message = "Bootstrap must create no executable workloads or active schedule."
  }
  assert {
    condition     = google_storage_bucket.cache.public_access_prevention == "enforced" && google_storage_bucket.cache.uniform_bucket_level_access && !google_storage_bucket.cache.versioning[0].enabled && google_storage_bucket.cache.soft_delete_policy[0].retention_duration_seconds == 0
    error_message = "The transient bucket must be private, unversioned and have soft deletion disabled."
  }
  assert {
    condition     = one(one(google_storage_bucket.cache.lifecycle_rule).action).type == "Delete" && one(one(google_storage_bucket.cache.lifecycle_rule).condition).age == 2 && length(google_storage_bucket.cache.retention_policy) == 0
    error_message = "Cache deletion must be two days without a retention lock."
  }
  assert {
    condition     = google_firestore_database.control.point_in_time_recovery_enablement == "POINT_IN_TIME_RECOVERY_DISABLED"
    error_message = "Control database PITR must be disabled."
  }
  assert {
    condition     = toset(google_project_iam_custom_role.cache["cleanup"].permissions) == toset(["storage.objects.list", "storage.objects.delete"])
    error_message = "Cleanup must not gain object content, state or credential access."
  }
  assert {
    condition     = !contains(google_project_iam_custom_role.client_cleanup.permissions, "secretmanager.versions.add") && contains(google_project_iam_custom_role.rotate.permissions, "secretmanager.versions.destroy") && contains(google_project_iam_custom_role.rotate.permissions, "secretmanager.versions.list")
    error_message = "Athlete version rotation and bounded orphan cleanup must be explicitly authorized."
  }
  assert {
    condition     = !contains(google_project_iam_custom_role.admin.permissions, "secretmanager.versions.access") && !contains(google_project_iam_custom_role.admin.permissions, "storage.objects.get") && !contains(google_project_iam_custom_role.deploy.permissions, "run.jobs.run")
    error_message = "Administration/deployment must not directly read private contents or start syncs."
  }
  assert {
    condition     = length(distinct([for account in google_service_account.identity : account.account_id])) == 7 && alltrue([for role in google_project_iam_member.state : strcontains(role.condition[0].expression, var.firestore_database)])
    error_message = "Identities must be separated and state access confined to the named control database."
  }
}

run "deployed_schedulers_still_paused" {
  command = plan
  variables {
    deploy_workloads = true
    container_image  = "us-central1-docker.pkg.dev/synthetic-private-project/strava-private/runtime@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  }
  assert {
    condition     = alltrue([for schedule in google_cloud_scheduler_job.sync : schedule.paused && schedule.time_zone == "America/Denver" && schedule.retry_config[0].retry_count == 0]) && google_cloud_scheduler_job.sync["weekly"].schedule == "0 9 * * 1"
    error_message = "Monday local time and paused/no-storm scheduler defaults must be preserved."
  }
  assert {
    condition     = google_cloud_scheduler_job.sync["recovery"].schedule == "17 * * * *" && google_cloud_scheduler_job.sync["cleanup"].schedule == "37 * * * *" && alltrue([for schedule in google_cloud_scheduler_job.sync : length(schedule.http_target[0].oauth_token) == 1])
    error_message = "Hourly bounded recovery and cleanup must use authenticated invocation."
  }
  assert {
    condition     = google_cloud_run_v2_service.review[0].iap_enabled && !google_cloud_run_v2_service.review[0].invoker_iam_disabled && toset(google_iap_web_cloud_run_service_iam_binding.owner[0].members) == toset(["user:owner@example.com"]) && output.iap_audience == "/projects/123456789012/locations/us-central1/services/strava-private-review"
    error_message = "Native IAP must authenticate the exact owner with the Cloud Run JWT audience."
  }
  assert {
    condition     = alltrue([for job in google_cloud_run_v2_job.sync : job.template[0].parallelism == 1 && job.template[0].task_count == 1 && job.template[0].template[0].max_retries == 0])
    error_message = "Jobs must use one task with no uncontrolled runtime retries."
  }
  assert {
    condition     = google_cloud_run_v2_service.review[0].template[0].scaling[0].min_instance_count == 0 && google_cloud_run_v2_service.review[0].template[0].scaling[0].max_instance_count == 1
    error_message = "Owner review must scale to zero with a single-instance cap."
  }
}

run "unverified_activation_rejected" {
  command = plan
  variables {
    deploy_workloads  = true
    container_image   = "us-central1-docker.pkg.dev/synthetic-private-project/strava-private/runtime@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    enable_schedulers = true
  }
  expect_failures = [check.activation_requires_owner_verification, google_cloud_scheduler_job.sync]
}

run "verified_activation" {
  command = plan
  variables {
    deploy_workloads              = true
    container_image               = "us-central1-docker.pkg.dev/synthetic-private-project/strava-private/runtime@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    enable_schedulers             = true
    oauth_and_first_sync_verified = true
    monitoring_email              = "owner@example.com"
  }
  assert {
    condition     = !output.schedulers_paused && alltrue([for schedule in google_cloud_scheduler_job.sync : !schedule.paused])
    error_message = "Activation requires explicit final owner attestation."
  }
}

run "activation_without_notification_rejected" {
  command = plan
  variables {
    deploy_workloads              = true
    container_image               = "us-central1-docker.pkg.dev/synthetic-private-project/strava-private/runtime@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
    enable_schedulers             = true
    oauth_and_first_sync_verified = true
  }
  expect_failures = [google_cloud_scheduler_job.sync]
}
