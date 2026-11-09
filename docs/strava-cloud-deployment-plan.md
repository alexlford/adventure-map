# Optional cloud deployment: weekly private Strava sync

**Status: architecture proposal only. No cloud resources have been created,
no live Strava credentials have been migrated, and no cloud sync is running.**

The current macOS implementation uses Keychain, an owner-only local cache,
and `launchd`; it cannot be lifted into Linux Cloud Run unchanged.
A cloud implementation requires a new secret store, state backend, user
authorization callback, short-lived content storage, and a review interface.

## Recommended provider and cadence

- **Google Cloud Run Job** for the batch processor (one task, one concurrent
  execution, limited retries, no public endpoint on the batch job).
- **Cloud Scheduler:** `0 9 * * 1`, timezone `America/Denver`
  (Monday 09:00 local time, following weekend races).
- **Secret Manager:** client secret and the current authorized refresh token.
  Keep the app secret and rotating athlete token out of GitHub Actions and
  source control. Rotate the stored refresh token immediately after an OAuth
  refresh; never assume the previous token remains valid.
- **Firestore:** content-free scan checkpoint, bounded-window resume state,
  rate-limit timers, lock lease, and refresh-uncertainty indicator. Use
  transactional locking so overlapping scheduled invocations never reuse a
  rotating refresh token. Strava token refresh and persistence cannot be
  transactionally atomic across services; on ambiguous failure, stop and
  require reauthorization.
- **Private transient object storage:** 48-hour maximum content age, with
  restrictive IAM, at-rest encryption, lifecycle deletion, explicit owner
  access, and no public read permissions. Enforce expiry at read time as well
  as asynchronously cleaning up stored objects. Do not store a permanent
  activity index or GPS archive in the API cache.
- **Private owner review / notification:** report only operational success or
  failure through notifications; keep actual activity and GPS contents in a
  separately authenticated owner-only view. Because the cache expires after
  48 hours, the owner must review within that window or run another scan.

## Phased cloud migration

1. Create a new, dedicated Google Cloud project with billing enabled, least-
   privilege service accounts, Cloud Run, Scheduler, Secret Manager, Firestore,
   and private object storage. Do not deploy secrets via CI or write them into
   GitHub logs.
2. Adapt the current pure `review.py`, `sync.py` and `transport.py` code
   behind a cloud-specific storage/token interface. Preserve current candidate
   selection, ownership checks, gap handling, pagination, privacy behavior,
   and bounded temporal windows. Never import the macOS Keychain or LaunchAgent
   classes into the Cloud Run entrypoint.
3. Implement an authenticated *initial authorization* web flow with a
   registered HTTPS callback hostname and CSRF state verification. The owner
   must personally approve once. Never move raw local Keychain credentials
   by chat, PR, environment file, or unencrypted export. The authenticated
   application must be responsible for writing its tokens to managed storage.
4. Implement recovery from revoked grants, expired authorization, failed
   rate-limited scans, bad GPS streams, service interruptions, and failed
   refresh-token persistence. Prevent retry storms.
5. Test using entirely synthetic activity/stream/credential fixtures before
   running any live service; test rollback/uncertain-token behavior and
   duplication across weekly periods.
6. Enable Cloud Scheduler only after cloud OAuth and a manually triggered
   job have both been verified by the owner. Then disable the macOS
   LaunchAgent to avoid duplicate refreshes from competing runtimes.
7. Use an operator-controlled authenticated notification to alert the owner
   when the private report is ready, or when authorization must be renewed.
   Do not include activity-derived data in notification payloads.

## Scope and policy boundaries

The cloud job may download permitted Strava activity data and available GPS
streams for private owner review only. The app policy restrictions apply in
the cloud as well as locally. Do not send API data or derivatives to AI
systems, GitHub, public pages, or external analytics systems. Never silently
merge temporary API observations into the original watch-file/archive
provenance. Public Passport updates require a separately established,
permitted source and editorial verification.

The existing August 10, 2026 reviewed account-export watermark remains
separate from the cloud API download cursor. A scan checkpoint does not
constitute publication approval. Not every activity receives GPS: the
current candidate rules fetch streams only for race/cycling/Nordic/adventure
review candidates. User-owned watch FIT/GPX/TCX files remain the preferred
independent original source for route publication work.

## Provider documentation

- Google Cloud: [Scheduled Cloud Run jobs](https://docs.cloud.google.com/run/docs/execute/jobs-on-schedule)
- Google Cloud: [Secret Manager for Cloud Run jobs](https://docs.cloud.google.com/run/docs/configuring/jobs/secrets)
- Google Cloud: [Cloud Scheduler cron and timezone](https://docs.cloud.google.com/scheduler/docs/configuring/cron-job-schedules)
- Strava: [OAuth and refresh-token rotation](https://developers.strava.com/docs/authentication/)
