# Private Strava synchronization on Google Cloud

## Implementation and verification status

The cloud implementation is in `scripts/strava_cloud/`, with Terraform in
`infra/strava-cloud/` and a source-only container/build pipeline in `cloud/strava/`.
It extends the private review model from PRs #304 and #305. It does not rebuild
Adventure Passport, publish API observations, edit canonical records, or advance
the reviewed account-export watermark (August 10, 2026 / 3,371 activities).

Synthetic application and infrastructure checks are separate from deployment
verification. No cloud deployment or cloud Strava grant is established merely
by those tests. Deployment requires an authenticated Google Cloud account,
an existing billing-enabled project, reviewed IAM, and personal cloud OAuth.
The earlier macOS grant is not imported or assumed portable. The Mac is not a
runtime dependency after the cloud resources and schedule are activated.

## Resources and identities

Default region: `us-central1`. Default resource prefix: `strava-private`.

- Cloud Run Jobs: `strava-private-weekly`, `strava-private-recovery`, and
  `strava-private-cleanup`; one task and no automatic execution retry storm.
- Weekly Cloud Scheduler: `0 9 * * 1`, **America/Denver**. Google handles DST.
  Hourly recovery only resumes pending work; hourly cleanup deletes expired
  artifacts. All schedules are paused by default.
- Cloud Run service: `strava-private-review`, protected by native Google IAP
  and an application-level verified IAP JWT plus exact owner-email allowlist.
- Separate worker, web, cleanup, scheduler, build, deploy, and infrastructure
  administration identities; no service-account key files or broad Editor role.
- Secret Manager containers: `strava-private-client` and
  `strava-private-athlete`. Terraform creates containers, never secret payloads.
- The `(default)` Firestore database in this dedicated project uses its free quota. It stores
  content-free checkpoints, quota/retry deadlines, CSRF digests, lease/fence
  state, and numeric Secret Manager/GCS version pointers, without activity IDs.
- Private bucket: `PROJECT-strava-private-48h`; a single atomic cache envelope
  contains activity metadata, candidates, API streams, and GPS review together.
  Soft deletion and object versioning are disabled; expiry does not slide.
- Cloud Monitoring uses existing email channels or the configured email target
  for fixed operational categories. Notifications contain no activity-derived
  names, IDs, counts, locations, GPS, or error bodies.

The Terraform state bucket is provisioned separately and stores infrastructure
metadata only. Use restricted IAM, encryption, and state locking. Do not place
API cache files or secrets in it. Infrastructure administrators can change IAM;
that is a privileged break-glass boundary, not an assertion that an administrator
could never grant themselves access.

## Security and data behavior

Every worker operation acquires a transactional Firestore lease. Heartbeats and
fencing prevent stale workers from committing checkpoints, cache pointers, or
credential pointers. Secret Manager versions are immutable and selected by an
explicit fenced pointer, never `latest`. A marker is committed before token
exchange; an ambiguous exchange or persistence result requires reauthorization.
A definitely local quota refusal is checked before that marker is set.

Normal scans overlap by seven days and use bounded windows of at most 31 days.
A weekly run catches up through bounded windows, with persisted recovery after
quota or temporary failures. Download completion never means editorial review.
The bounded-window download cursor is separate from `last_successful_sync`,
which advances only after the whole weekly catch-up target completes. A failed
later window can retain completed download progress without falsely recording
a successful weekly synchronization.
Late uploads or edits older than the overlap require an intentional backfill;
Strava provides no complete modified-since/deletion cursor. Inaccessible records
are erased from the temporary cache without claiming definite deletion.

Only deterministic race/adventure/outing candidates receive optional API GPS.
A generic Ride remains unresolved cycling; running does not become a public
record merely because it was downloaded. Alpine ski candidates keep their
Slopes reconciliation requirement. Original watch FIT/GPX/TCX, independently
supplied evidence, official courses, and API streams retain distinct provenance.
GPS checks flag gaps, jumps, time discontinuities, obvious coordinate-order
errors, distance disagreement, shortening, and duplicate geometry for review.
They never insert points, bridge missing segments, or promote a route publicly.
Private race evidence records the source race flag/name hints, approximate
distance category, and possible named World Major match. These remain unverified
identity suggestions; distance alone never identifies a race or supplies an
official result. Ambiguous activities remain in the owner-review queue.

The service refuses expired data at read time and removes it. An hourly
metadata-only janitor and a two-day GCS lifecycle rule provide physical cleanup.
Deletion is asynchronous and can be delayed by provider outages; do not describe
that as an exact physical erasure guarantee at the 48-hour instant. Expired
content cannot be served through the application. Owner-made copies and an
already-open browser cannot be remotely erased; the review page also removes
its visible content at expiry.

Revocation deactivates authorization and fences an in-flight worker before
cleanup or remote I/O. The UI distinguishes confirmed remote revocation,
remote-unverified cleanup, and incomplete deletion. No personal activity data
or tokens are written to application logs. Callback request logs and incidental
runtime diagnostics are excluded; application output uses fixed status values.
Review has no external map, analytics, export, AI, or public-publication path.
Before OAuth, review project, custom, and ancestor log sinks: project exclusions
do not prevent an organization/folder sink from retaining callback URLs. Keep
IAP Data Access logging disabled or apply verified exclusions at every sink.
Do not proceed with secret entry or OAuth while that logging boundary is unknown.

## Bootstrap and source-only validation

Use Python 3.12 or later for local cloud tests and the pinned production Python
version in the container. The requirements lock includes all transitive versions
and wheel SHA256 hashes. Never run these steps against real activity fixtures.

```bash
python3.12 -m venv /path/outside/repository/cloud-tools
/path/outside/repository/cloud-tools/bin/pip install --require-hashes -r cloud/strava/requirements.lock
/path/outside/repository/cloud-tools/bin/python -m unittest discover -s scripts/strava_cloud -t . -p 'test_*.py'
/path/outside/repository/cloud-tools/bin/python -m unittest discover -s cloud/strava -p 'test_*.py'
npm run test:strava-private
npm run validate:strava-private
npm run validate:strava-cloud
terraform -chdir=infra/strava-cloud init -backend=false
terraform -chdir=infra/strava-cloud validate
terraform -chdir=infra/strava-cloud test
```

The CI workflow checks out only source/configuration and runs synthetic tests,
including real verification of generated ES256 test signatures and DST cases.
It never receives Strava credentials or accesses real activity data. Legacy
publication validators remain unchanged and belong in their existing non-AI CI.

1. Sign into Google Cloud personally and select an appropriate existing project.
   Verify billing and your permissions; if no project exists, create a dedicated
   project and link billing yourself. A payment/account enrollment is not done by
   this repository or silently on your behalf.
2. Authenticate the Google Cloud CLI and Terraform ADC using Google's browser
   flow (`gcloud auth login`, `gcloud auth application-default login`). Do not
   paste credential files, tokens, passwords, or verification codes into AI tools.
   Before Terraform reads project metadata, enable its bootstrap APIs:

   ```bash
   gcloud services enable cloudresourcemanager.googleapis.com serviceusage.googleapis.com --project PROJECT
   ```

   Enable the Billing Budget API and run the owner-only metadata tool using the
   installed cloud-tools interpreter, before deploying workloads:

   ```bash
   gcloud services enable billingbudgets.googleapis.com --project PROJECT
   /path/outside/repository/cloud-tools/bin/python cloud/strava/configure_budget.py --project PROJECT --project-number PROJECT_NUMBER --billing-account BILLING_ACCOUNT_ID
   ```

   This uses ADC internally, creates a $3 monthly gross Cloud Run cap and a $1
   monthly net project alert, and verifies their saved settings. Existing matching
   budgets are reused; conflicting names/settings are refused without an update
   or deletion. After an interrupted create, rerun it to reconcile the result.
3. Create a private metadata-only Terraform state bucket, or reuse a suitable
   existing restricted state bucket. Initialize the GCS backend with its bucket
   and prefix. Keep `.tfvars`, plans, and state out of Git.
4. Copy `terraform.tfvars.example` to an ignored local file and set the existing
   project, exact owner Google email, and operational notification destination.
   Initially keep `deploy_workloads=false`, `enable_schedulers=false`, and
   `oauth_and_first_sync_verified=false`. Review and apply the bootstrap plan.
   New log-based metrics can take up to ten minutes to become available to
   Monitoring. If an alert-policy creation reports only a missing new metric,
   let it propagate, then replan and reapply against the saved backend state.
5. Build the reviewed source with the build identity (the packager only reads a
   fixed source allowlist):

   ```bash
   python3 cloud/strava/deploy.py build --project PROJECT --release REVIEWED_COMMIT_SHA
   ```

   Record its immutable Artifact Registry `@sha256:` result. Set that image and
   `deploy_workloads=true` in the ignored variables, review and apply the workload
   plan. Existing pipelines may use the optional protected GitHub environment
   `strava-cloud-production` with short-lived Workload Identity Federation.
6. For a project without a Google organization, first-time native IAP setup may
   require Cloud Run Console's Google-managed OAuth setup. Configure the owner
   and external audience there, then reapply. Never bypass this using a public
   invoker binding or by disabling IAP. Verify both the IAP policy and application
   allowlist before entering any Strava secret.
7. Run the content-free metadata preflight:

   ```bash
   python3 cloud/strava/preflight.py --project PROJECT --phase deployed --owner-email OWNER_GOOGLE_EMAIL
   ```

   It checks resource metadata and paused schedules, not secret versions,
   Firestore documents, object contents, request logs, or review data.

A container image rollout is reproducible with `deploy.py rollout --image DIGEST`;
it updates existing workloads only and does not execute jobs or enable schedules.
Terraform remains the source of truth for the pinned image and infrastructure.

## Personal cloud authorization

1. Open Terraform's `review_url` as the exact owner through Google IAP.
2. Set Strava's registered callback domain to the hostname of Terraform's
   `oauth_callback_url` (HTTPS, ending `/oauth/callback`). A local `localhost`
   callback is not this cloud endpoint.
3. Enter the application client ID and client secret only in the authenticated
   HTTPS setup form. The secret is written directly to Secret Manager and is
   never echoed in the response, repository, image, build argument, or CI variable.
4. Choose **Authorize a new read-only cloud grant** and personally approve
   `activity:read_all` on Strava. The cloud service never handles a Strava password.
   State is cryptographically random, owner-bound, expiring, and consumed once.
5. Verify the clean connected response. Do not inspect callback query URLs,
   Secret Manager payloads, or API contents through Codex.

Reauthorization uses the same owner-controlled browser procedure. A failed or
ambiguous refresh is not retried with an old token. Do not enable both Mac and
cloud polling for the same application grant. Stop the Mac's scheduled sync
using its existing local disable command before cloud authorization, once the
cloud infrastructure is ready. Do not disconnect/revoke the old app grant after
connecting the cloud without considering that it can revoke the cloud grant too.
Keep historical watch files/account exports separate and unchanged.

## Controlled run, activation, and recovery

Execute the first Cloud Run weekly job from the authorized runtime. Use only
Cloud Run execution status and the fixed JSON `status` event to verify it from
AI-assisted tooling. The owner inspects `/review` personally and confirms that
it is accessible only to the owner, shows its expiry, and preserves GPS gaps and
source provenance. No live activity or derivative is copied to AI context.

After cloud OAuth, the controlled run, owner access, cleanup, and notifications
are verified, set `oauth_and_first_sync_verified=true` and
`enable_schedulers=true`, review and apply. Run preflight with `--expect-active`.
Verify Cloud Scheduler's next execution and timezone in Google Cloud. This is the
point at which recurring operation has no Mac dependency; a paused or uncreated
schedule must never be described as deployed automation.

The recovery job resumes only persisted pending work after its quota deadline.
A bounded backfill can be triggered by overriding the weekly Cloud Run Job's
nonsecret `STRAVA_CLOUD_RUN_JSON` with:

```json
{"mode":"backfill","since":"2026-08-10","until":"2026-08-31"}
```

Dates are UTC and `until` is exclusive; maximum 31 days. Backfill does not move the
normal completed checkpoint or the reviewed-export watermark. Never put activity
IDs, tokens, coordinates, or other API data in command arguments or overrides.
On `reauthorize`, the owner follows the browser procedure. On quota delay, leave
the stored checkpoint intact and let recovery honor the reset deadline. On
cleanup/deletion failure, authorization remains deactivated and the UI must not
claim successful erasure. Preserve operational logs only, never inspect API
payloads to diagnose production through AI.

## Estimated cost and limits

The deployment targets the **free allowances** for this light personal workload:
Cloud Run's shared free CPU/RAM quota, three free Scheduler jobs, six free active
Secret Manager versions, the project's default Firestore free quota, and Cloud
Build's eligible default E2-standard-2 machine. No always-on instance or load
balancer is provisioned. A billing account is still required; this is a usage
estimate, not a guarantee of a zero bill or a spending cap.

The owner-run budget tool uses [Cloud Billing spend caps](https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps)
for Cloud Run only. The $3 threshold measures gross estimated list-price usage
before free allowances and credits; the separate $1 alert includes credits and
covers all project services. Cap enforcement can lag, and overages remain payable.
An enforced cap pauses this project's review service and all Cloud Run jobs,
including recovery and cleanup; the independent two-day GCS lifecycle remains
the asynchronous deletion fallback. Other services keep operating and can incur
costs. The cap resets automatically next month. Notifications go to Project Owner
users and default billing recipients. Creating these single-project budgets
requires `resourcemanager.projects.get`, `billing.resourcebudgets.read`, and
`billing.resourcebudgets.write`; the cap additionally requires
`billing.resourcebudgets.configureSpendCap`. Equivalent billing-account budget
permissions can be used instead. The quota project must have the Budget API
enabled and the caller must have `serviceusage.services.use`. These rights belong
to the owner administration environment; the runtime and build identities do not
receive billing access.

Hourly recovery and cleanup create about 1,488 executions in a 31-day month.
Their 60-second minimum at 1 vCPU / 512 MiB consumes about 89,280 vCPU-seconds and
44,640 GiB-seconds, below Cloud Run's 240,000/450,000 monthly free allowances if
unused by other projects on the same billing account. Weekly ten-minute runs
add about 2,660 vCPU-seconds. Three Scheduler jobs and two enabled secret versions
also fit their free quotas. Default Firestore provides 50,000 reads and 20,000
writes/deletes per day. TTL/PITR/backups are not enabled; selecting a named
Firestore database instead would remove its free quota.

Cloud Build's default E2-standard-2 machine has 2,500 free build minutes per month.
Private object storage, image storage, state storage, operations, notifications,
and egress still depend on actual usage and shared allowances. Target near $0
for routine use, retain an owner-controlled budget alert, and allow for small
charges or future pricing changes. If free quotas are unavailable, the two
hourly jobs alone are about $1.70/month before the remaining services. Existing
GitHub hosting continues separately; it does not supply this private runtime.

Sources checked November 8, 2026: [Cloud Run](https://cloud.google.com/run/pricing),
[Scheduler](https://cloud.google.com/scheduler/pricing),
[Secret Manager](https://cloud.google.com/secret-manager/pricing),
[Firestore](https://cloud.google.com/firestore/pricing),
[Storage](https://cloud.google.com/storage/pricing),
[Artifact Registry](https://cloud.google.com/artifact-registry/pricing), and
[Cloud Build](https://cloud.google.com/build/pricing).

## Policy boundary

Review the current [Strava API Agreement](https://www.strava.com/legal/api),
[API Policy](https://www.strava.com/legal/api_policy),
[OAuth documentation](https://developers.strava.com/docs/authentication/), and
[rate limits](https://developers.strava.com/docs/rate-limits/) before activation.
API observations and derivatives stay private and transient; this system is not
an archive, permanent activity index, AI data source, or public feed. Source and
synthetic fixtures are the only inputs to AI-assisted development. The public
Passport route workflow continues to require independently supplied original GPS
or another permitted source, explicit provenance, and editorial validation.
