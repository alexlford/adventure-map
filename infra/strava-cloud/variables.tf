variable "project_id" {
  description = "Existing dedicated Google Cloud project; billing is enabled manually."
  type        = string
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "Use an existing Google Cloud project ID."
  }
}

variable "region" {
  type    = string
  default = "us-central1"
}

variable "name_prefix" {
  type    = string
  default = "strava-private"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,18}$", var.name_prefix))
    error_message = "Use 3–19 lowercase letters, digits and hyphens."
  }
}

variable "owner_email" {
  description = "The one owner Google identity permitted through IAP and the application."
  type        = string
  validation {
    condition     = can(regex("^[^ @]+@[^ @]+\\.[^ @]+$", var.owner_email))
    error_message = "Set the exact owner Google account email."
  }
}

variable "monitoring_email" {
  description = "Optional category-only email target. Prefer existing notification channel IDs."
  type        = string
  default     = null
  nullable    = true
}

variable "monitoring_notification_channel_ids" {
  description = "Existing Google Cloud Monitoring email notification channel resource names."
  type        = list(string)
  default     = []
}

variable "firestore_database" {
  description = "Dedicated project control database; default database qualifies for the free quota."
  type        = string
  default     = "(default)"
}

variable "state_collection" {
  type    = string
  default = "strava-private"
}

variable "deploy_workloads" {
  description = "False bootstraps metadata resources; true requires an already built immutable image."
  type        = bool
  default     = false
}

variable "container_image" {
  description = "Artifact Registry image pinned by sha256 digest. Contains source/dependencies only."
  type        = string
  default     = ""
}

variable "oauth_and_first_sync_verified" {
  description = "Owner attestation: cloud OAuth, first manual sync, expiry/access checks verified."
  type        = bool
  default     = false
}

variable "enable_schedulers" {
  description = "Explicit final activation; all schedules remain paused until both flags are true."
  type        = bool
  default     = false
}

variable "github_repository" {
  description = "Optional exact owner/repo allowed to impersonate deploy identity through GitHub OIDC."
  type        = string
  default     = ""
}

variable "github_repository_id" {
  description = "Immutable numeric GitHub repository ID; required with GitHub WIF."
  type        = string
  default     = ""
}

variable "github_repository_owner_id" {
  description = "Immutable numeric GitHub owner ID; prevents renamed/recreated repo takeover."
  type        = string
  default     = ""
}

variable "github_deploy_branch" {
  type    = string
  default = "main"
}
