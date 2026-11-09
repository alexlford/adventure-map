This module targets an existing, dedicated Google Cloud project. It creates
metadata resources first; it does not create a project, link billing, authorize
Strava, deploy a placeholder container, or enable scheduled executions. The
owner must complete the controlled steps in
[the deployment guide](../../docs/strava-cloud-deployment-plan.md).

`terraform.tfvars.example` contains nonsecret configuration only. Import existing
resources by their exact IDs rather than applying over an unrelated project.
Resource names use `name_prefix`; the transient bucket also includes the project
ID. Firestore uses the default database in this dedicated project so its free
quota can apply. Named databases incur usage charges without that free quota.

Use a separately bootstrapped private GCS Terraform backend with a unique prefix.
Grant the infrastructure administrator access only to that state bucket, then
initialize with `terraform init -backend-config=bucket=STATE_BUCKET
-backend-config=prefix=strava-private`. State contains resource configuration and
owner email, never client secrets, token payloads, OAuth codes or cache content.
No Secret Manager version resource or data source is used.

The seven service accounts have separate purposes:

| Identity | Access |
| --- | --- |
| worker | One control database, transient cache, app version read/orphan cleanup, athlete version rotation |
| web | Same control database, cache read/delete, owner-authorized app and athlete version rotation |
| cleanup | Cache metadata listing and generation-conditional deletion only |
| scheduler | Invoke the three Cloud Run Jobs only |
| build | Read source-only staging objects, write the dedicated image repository |
| deploy | Submit source builds and update images on the existing private workloads |
| admin | Infrastructure configuration and IAM policies; no direct secret-version or object-content read permissions |

The administrator is privileged because IAM policy editing can delegate access.
Use it only for reviewed infrastructure changes. Bootstrap its custom role with
an existing authorized administrator, grant the owner impersonation on the admin
account if desired, and grant state-bucket object access separately. No project
Owner or Editor role is assigned. Runtime roles are custom and confined to the
specific database, bucket or individual secret container. A deployment identity can
change executable code and must be treated as trusted.

Native Cloud Run IAP protects the default `run.app` URL without a load balancer.
Its audience is `/projects/NUMBER/locations/REGION/services/NAME`. For a project
without an organization, or an owner outside the project's organization, finish
the one-time Google Cloud console consent screen/custom OAuth setup described in
[Google's IAP guide](https://docs.cloud.google.com/run/docs/securing/identity-aware-proxy-cloud-run)
before expecting Terraform to configure owner access successfully. Terraform
manages no IAP OAuth client secret. The application also verifies the signed IAP
JWT and exact owner identity on every route.

Cloud Run request logs and IAP Data Access audit logs are excluded from the
project default sink before any workload is created. IAP access logs can contain
the request URL, including OAuth callback query parameters. Gunicorn access and
error logging are disabled; application events use fixed status codes only.
Before OAuth, keep IAP Data Access logging disabled and inspect project custom
sinks plus organization/folder aggregated sinks: project default-sink exclusions
do not apply to those destinations. Do not open callback URLs or diagnostic
request logs in an AI session. No load balancer, request tracing exporter, custom
request logger or analytics collector is provisioned.

The preflight command prints fixed checks using metadata only. Deployed checks
require `--owner-email OWNER`. It rejects every enabled custom project logging
sink and requires `--ancestor-sinks-reviewed` if the project has a parent. That
flag records the owner's review of ancestor destinations; it is not automatic
proof. The owner must remove/disable unsafe sinks or arrange equivalent URL
exclusions before authorizing Strava.

All Scheduler resources default to paused. Activation requires explicit
`enable_schedulers=true`, `oauth_and_first_sync_verified=true`, and at least one
notification target. A resource lifecycle precondition blocks activation when
verification or the notification target is missing. Verify email delivery,
cloud OAuth, a manually triggered sync, denied nonowner access, and read-time
expiry before activating. The owner also disables competing macOS automation.
Recovery only resumes bounded pending work; cleanup runs hourly. Neither job
performs an unbounded scan.

The 48-hour privacy boundary is enforced by the application at read time, with
hourly physical cleanup and a two-day bucket lifecycle as a fallback. GCS
lifecycle processing is asynchronous, so it is not an exact 48-hour physical
erasure guarantee. Versioning, soft deletion, retention policies and object
holds are not enabled. Firestore stores content-free control/CSRF/lease records;
the durable checkpoint is not expired. Expired OAuth states are rejected and
pruned by the application. PITR and backup schedules are not provisioned.

GitHub federation is optional and disabled until exact repository/immutable
numeric IDs are supplied. Configure the `strava-cloud-production` environment
with owner approval and the permitted deployment branch before using it. The
provider additionally checks repository/owner IDs, branch and environment
subject. The validation workflow has no OIDC permission, cloud secrets, deploy
job, image push, or cloud trigger. After future approved image rollouts, update
the Terraform `container_image` variable to the same immutable digest.

Source/schema checks use `terraform fmt -check -recursive`, `terraform validate`
and `terraform test`. Tests use a mocked provider and synthetic metadata only;
they do not validate live IAM grants, billing, IAP consent or email delivery.
