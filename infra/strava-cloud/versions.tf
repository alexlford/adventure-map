terraform {
  required_version = ">= 1.11.0, < 2.0.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "8.10.0"
    }
  }
  # Supply bucket/prefix with -backend-config; provision this metadata-only
  # state bucket separately. No credential payloads enter this configuration.
  backend "gcs" {}
}

provider "google" {
  project = var.project_id
  region  = var.region
}
