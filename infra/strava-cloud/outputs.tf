output "review_url" { value = local.review_url }
output "oauth_callback_url" { value = "${local.review_url}/oauth/callback" }
output "iap_audience" { value = local.iap_audience }
output "schedulers_paused" { value = local.paused }
output "artifact_repository" { value = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}" }
output "build_source_bucket" { value = google_storage_bucket.build_source.name }
output "cache_bucket" { value = google_storage_bucket.cache.name }
output "firestore_database" { value = google_firestore_database.control.name }
output "identities" { value = { for key, account in google_service_account.identity : key => account.email } }
output "github_wif_provider" { value = try(google_iam_workload_identity_pool_provider.github[0].name, null) }
