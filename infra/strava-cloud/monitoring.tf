resource "google_monitoring_notification_channel" "email" {
  count        = var.monitoring_email == null ? 0 : 1
  project      = var.project_id
  display_name = "Private sync operational categories"
  type         = "email"
  labels       = { email_address = var.monitoring_email }
  depends_on   = [google_project_service.required]
}

resource "google_logging_metric" "attention" {
  project     = var.project_id
  name        = "${var.name_prefix}/attention"
  description = "Fixed operational categories only; no activity, athlete, URL or error labels."
  filter = join(" ", [
    "resource.type=\"cloud_run_job\"",
    "resource.labels.job_name=~\"^${var.name_prefix}-(weekly|recovery|cleanup)$\"",
    "jsonPayload.status=~\"^(reauthorize|failed|rate_limited|retry)$\""
  ])
  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
    labels {
      key         = "status"
      value_type  = "STRING"
      description = "Fixed status category"
    }
  }
  label_extractors = { status = "EXTRACT(jsonPayload.status)" }
  depends_on       = [google_project_service.required]
}

resource "google_monitoring_alert_policy" "attention" {
  project               = var.project_id
  display_name          = "Private sync requires attention"
  combiner              = "OR"
  enabled               = true
  notification_channels = concat(var.monitoring_notification_channel_ids, google_monitoring_notification_channel.email[*].name)
  documentation {
    mime_type = "text/markdown"
    content   = "A private sync reported an operational status requiring attention. Open the owner-only review service. Notifications contain status categories only."
  }
  conditions {
    display_name = "Operational attention category"
    condition_threshold {
      filter          = "resource.type=\"cloud_run_job\" AND metric.type=\"logging.googleapis.com/user/${google_logging_metric.attention.name}\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      duration        = "0s"
      aggregations {
        alignment_period     = "3600s"
        per_series_aligner   = "ALIGN_DELTA"
        cross_series_reducer = "REDUCE_SUM"
        group_by_fields      = ["metric.label.status"]
      }
      trigger { count = 1 }
    }
  }
  alert_strategy {
    auto_close           = "86400s"
    notification_prompts = ["OPENED"]
  }
  depends_on = [google_project_service.required]
}

resource "google_logging_metric" "review_ready" {
  project     = var.project_id
  name        = "${var.name_prefix}/completed"
  description = "Private review ready after weekly sync or bounded recovery; fixed completed category only."
  filter      = "resource.type=\"cloud_run_job\" resource.labels.job_name=~\"^${var.name_prefix}-(weekly|recovery)$\" jsonPayload.status=\"completed\""
  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
  }
  depends_on = [google_project_service.required]
}

resource "google_monitoring_alert_policy" "review_ready" {
  project               = var.project_id
  display_name          = "Private sync completed"
  combiner              = "OR"
  notification_channels = concat(var.monitoring_notification_channel_ids, google_monitoring_notification_channel.email[*].name)
  documentation {
    mime_type = "text/markdown"
    content   = "The weekly private sync completed. Open the owner-only review service within 48 hours. No activity information is included in this notification."
  }
  conditions {
    display_name = "Weekly completed category"
    condition_threshold {
      filter          = "resource.type=\"cloud_run_job\" AND metric.type=\"logging.googleapis.com/user/${google_logging_metric.review_ready.name}\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      duration        = "0s"
      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_DELTA"
        cross_series_reducer = "REDUCE_SUM"
      }
      trigger { count = 1 }
    }
  }
  alert_strategy {
    auto_close           = "1800s"
    notification_prompts = ["OPENED"]
  }
}

# Detect crashes/timeouts even when no application status event was emitted.
resource "google_monitoring_alert_policy" "execution_failure" {
  count                 = var.deploy_workloads ? 1 : 0
  project               = var.project_id
  display_name          = "Private sync execution failed"
  combiner              = "OR"
  notification_channels = concat(var.monitoring_notification_channel_ids, google_monitoring_notification_channel.email[*].name)
  documentation {
    mime_type = "text/markdown"
    content   = "A private sync execution failed or timed out. Check the owner-only operational status."
  }
  conditions {
    display_name = "Cloud Run execution failure"
    condition_threshold {
      filter          = "resource.type=\"cloud_run_job\" AND metric.type=\"run.googleapis.com/job/completed_execution_count\" AND metric.labels.result=\"failed\" AND resource.labels.job_name=monitoring.regex.full_match(\"${var.name_prefix}-(weekly|recovery|cleanup)\")"
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      duration        = "0s"
      aggregations {
        alignment_period     = "3600s"
        per_series_aligner   = "ALIGN_DELTA"
        cross_series_reducer = "REDUCE_SUM"
      }
      trigger { count = 1 }
    }
  }
  alert_strategy {
    auto_close           = "86400s"
    notification_prompts = ["OPENED"]
  }
}
