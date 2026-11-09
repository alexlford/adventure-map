# Adventure Passport private API sync

This integration is a local tool for the authenticated athlete's private review. It is separate from the public site and the annual account-export workflow. API authorization and live synchronization must be performed personally on your Mac, outside Codex or any other AI session. No live authentication or live activity synchronization was performed during development.

## Privacy and permitted boundaries

The implementation was developed and tested with entirely synthetic activity and GPS fixtures. Never paste, upload, summarize, screenshot, or otherwise transmit API responses, activity details, locations, streams, cached files, review queues, or reports to Codex or any other AI system. This includes derived and anonymized information. AI-assisted changes may inspect source code and synthetic fixtures only.

The integration uses official OAuth and documented API endpoints, authenticates one athlete, requests read-only access, and produces a private review queue. It does not publish API data or routes, modify canonical records, merge API data into Slopes records, advance the reviewed export watermark, or provide an API-backed public feed. Do not place the private cache in this repository, an AI-visible folder, a web-server directory, a synced cloud folder, or a backup that retains expired API data. Local runtime commands require macOS and an interactive terminal and refuse recognized AI/CI environments. These checks are defense in depth, not a sandbox capable of preventing a person or a different local process from reading a file: keep AI tools away from the private directory.

Official policy sources checked on November 8, 2026:

- [API Agreement](https://www.strava.com/legal/api), effective June 1, 2026.
- [API Policy](https://www.strava.com/legal/api_policy), effective June 1, 2026.
- [OAuth authentication](https://developers.strava.com/docs/authentication/).
- [Rate limits](https://developers.strava.com/docs/rate-limits/).
- [API endpoint reference](https://developers.strava.com/docs/reference/).

The current policy limits display to the authenticated user (§2.3), prohibits AI use including context-window ingestion (§5.3), prohibits analytics and combining customer data for those purposes (§5.4), restricts bulk accumulation and persistent indexes (§5.5), limits transient caching to seven days (§6.2), requires deleted data to stop being displayed within 48 hours (§6.3), and requires deletion on consent withdrawal or account deletion (§7.4). These restrictions cover derived data too. A private application is not exempt from them. This tool must not become an indefinite API activity archive, search corpus, training dataset, or analytics pipeline.

The local review workflow is deliberately narrower than an archival import. Review any proposed expanded retention, permanent activity-ID/fingerprint index, cross-source combination, additional endpoint, or public use with Strava before implementing it. A retained hash is still derived from the source; hashing does not grant different usage rights.

## Setup on your Mac

Use Python 3 and a current Node/npm installation in a normal local Terminal session. Do not run these commands from a Codex terminal, an AI-enabled automation, a remote development agent, or CI. No Strava secret belongs in `.env`, a shell argument, an npm script, or this repository. Read this document and the current linked terms before authorizing the application.

```bash
npm run strava:auth
npm run strava:status
npm run strava:sync
npm run strava:report
```

`strava:auth` installs a local cleanup LaunchAgent, asks for the application's client ID and secret securely in the terminal, starts a callback listener bound only to loopback, and opens the official Strava authorization page in your browser. Personally approve the requested read-only activity scope. The tool verifies the random OAuth state, accepted permissions, and callback before exchanging the code. It stores credentials and tokens in macOS Keychain. The utility never needs your Strava password. Localhost and `127.0.0.1` are explicitly allowed callback hosts in the official authentication documentation. If the browser or Keychain denies access, follow the fixed diagnostic and rerun authorization; never copy a callback URL or code into chat.

`strava:status` reports authentication availability without printing tokens or activity information. A local credential being present does not prove that Strava still accepts it; only your later live operation can verify that.

`strava:sync` uses the existing Keychain authorization, refreshes expiring access tokens when necessary, and writes a private review queue and audit/control files under `~/Library/Application Support/Adventure Passport Private Sync`. It fetches activity metadata by default. No activity names, identifiers, coordinates, API error bodies, or summaries are printed into the terminal. It keeps download progress separate from the reviewed export watermark.

`strava:report` opens the private cache/review report locally in a text editor, after local freshness checks. Examine it there yourself. Do not send its contents, screenshots, counts, or derived summaries back to Codex. Close it after review; an already-open editor or a copied file cannot be withdrawn by the tool. Delete any manually made copies and exclude this directory from cloud synchronization and retained backups.

Other local commands:

```bash
npm run strava:reauth
npm run strava:purge
npm run strava:disconnect
```

`strava:reauth` repeats personal browser authorization, for example after a grant is revoked or required permissions were unchecked. It can replace a malformed stored credential bundle; a locked or denied Keychain still requires local resolution. `strava:purge` deletes the local API cache. `strava:disconnect` revokes API authorization using the official revocation endpoint and removes local credentials and private API state. If the saved bundle is absent or malformed, it removes the local item and explicitly reports that remote revocation was not verified. Check its completion message; a network failure does not prove that remote revocation succeeded. You can also revoke access at [Strava's application settings](https://www.strava.com/settings/apps), then remove local data with the provided cleanup command. Preserve the existing historical account-export archive separately; it is not the API cache.

Explicit historical windows and optional GPS streams:

```bash
npm run strava:sync -- --since 2026-08-10 --until 2026-08-31
npm run strava:sync -- --streams
```

Use date windows of at most 31 days. Dates are UTC boundaries and `--until` is exclusive. The first normal scan begins conservatively before the reviewed export snapshot because that watermark uses local activity time while the API filters use UTC epoch time. Each normal run processes at most 31 days; repeat the command to catch up after a longer gap. Later scans overlap the previous checkpoint by seven days. `--streams` explicitly enables private retrieval of permitted `latlng`, `time`, `altitude`, and `moving` streams; it does not publish or export routes. Avoid fetching streams until you need to inspect a specific private review window.

## Automatic private sync on your Mac

After personally completing `npm run strava:auth` and verifying one successful
`npm run strava:sync`, enable automatic checks **once** in an ordinary Terminal
session (not a Codex terminal):

```bash
npm run strava:auto-enable
npm run strava:auto-status
```

This installs an owner-only macOS LaunchAgent that runs once per week on Monday
at 9:00 AM in the Mac's local timezone, when your Mac is awake and logged in. It uses the existing approved Keychain grant; no
tokens or activity data go into the LaunchAgent definition. The job does not
need an interactive terminal and does not use Codex. A normal Mac sleep or
shutdown delays future checks; it is not a hosted 24/7 service. With the
current 48-hour transient cache lifetime, review candidate data shortly after
the weekly run or it will expire.

A scheduled run fetches new activity metadata and requests GPS streams only for
**candidate** races, cycling/MTB outings, Nordic outings, and likely adventure
stories; ordinary training runs do not have GPS streams fetched automatically.
These are broad candidate classifications, not validated public records.
API quota limits and interruptions may require later scheduled runs to catch up.
The original export GPS files are preserved separately.

Review results privately with `npm run strava:report`. The scheduled job
**does not** upload GPS to GitHub, make data available to ChatGPT/Codex, publish
routes, or advance the reviewed export watermark. Use an independently owned
watch-original FIT/GPX/TCX source for any separate AI-assisted publishing flow.

To stop polling without revoking your Strava authorization:

```bash
npm run strava:auto-disable
```

`npm run strava:disconnect` also disables the scheduled polling agent. If you
move the checkout or change the Python interpreter, disable and re-enable the
agent so its stored paths are updated. Keychain access for a background process
may require local macOS approval; verify a real scheduled run before assuming
it works unattended.

## Storage, refresh, and failure behavior

macOS Keychain holds the client secret, access token, and latest refresh token. Refresh tokens can rotate on every successful refresh, invalidating the previous value immediately. The tool saves the returned credential bundle before continuing. If token persistence or an interrupted token exchange leaves the authorization uncertain, stop and reauthorize; do not keep retrying an old refresh token or assume a grant is usable. Before refresh I/O or an authorization-code exchange, a content-free uncertainty flag is saved in control state. It survives process interruption and blocks subsequent token use until successful reauthorization; it is cleared only after the new bundle is saved. Failed or declined reauthorization preserves an existing flag. Do not run multiple copies against the same private store.

Activity records, IDs, fingerprints, stream evidence, and the review queue share a private atomic cache envelope with a maximum 48-hour lifetime. They are not retained as a permanent deduplication index or archive. A cache entry's expiry must not slide forward just because it was read or because a sync failed. Purging a cache can mean a later backfill surfaces the same candidate for review again; canonical duplicate reconciliation still uses the existing stable archive identities under human review.

Durable control state contains synchronization cursors, pending-window progress, rate scheduling, and fixed operational events, without activity content. A completed API checkpoint means that a bounded download succeeded; it never means the Passport reviewed or published the activities. API review queues carry `stateProposal: null`, so `advance:strava` cannot use them to advance the account-export watermark.

Requests use pagination and deduplicate returned IDs. A stable upper time bound and restarting page one make interrupted windows safe to retry without claiming that page offsets are a source snapshot. Activity-detail rechecks can detect changes to still-cached records and remove inaccessible records. Failures leave the last completed checkpoint intact. A successful download with a changed activity is a new private observation, not an overwrite of original exported GPS.

The transport honors both overall and read-only rate-limit headers. Current documented default read limits are 100 requests per 15 minutes and 1,000 per day, with overall limits of 200/2,000; the application's actual response headers take precedence. Short limits reset at natural quarter-hours; daily limits reset at midnight UTC. Rate-limit responses and temporary failures preserve retryable progress. A local manually rerun job need not wait indefinitely in the terminal.

Authorization requires installation of an hourly, RunAtLoad local cleanup LaunchAgent. It purges expired API cache files without API requests, Keychain access, or an interactive terminal. Every foreground command also checks expiry; reports identify their expiry prominently. Keep the repository and Python installation available at the configured paths so that this agent can run.

A sleeping, logged-out, or powered-off Mac cannot promise physical cleanup at an exact wall-clock deadline; cleanup resumes when the agent can run. The tool refuses expired content through its commands, but it cannot withdraw an already-open report or a copied file. Run cleanup after a pause, on withdrawal of consent, and before granting an AI tool filesystem access. Do not retain stale reports or use expired cached data. This is a bounded operational cache, not an indefinite observation or activity-audit archive.

## Synthetic verification

```bash
npm run test:strava-private
```

The synthetic suite exercises OAuth callbacks and scope/state failures, token refresh and rotation, pagination and duplicate prevention, retries and rate limits, interrupted windows and backfills, missing GPS and source gaps, privacy changes and inaccessible activities, storage isolation, and safe failures. It makes no live Strava requests and requires no credentials or macOS Keychain access.

Full legacy publication builds and data validators intentionally inspect historical activity or route records. They were not run in the AI development session; run them only in an appropriate non-AI environment when needed. Existing validators and publication workflows remain in force. The new private integration is never invoked by publication workflows.

## Relationship to the existing archive

The last fully reviewed account export remains August 10, 2026, with 3,371 activities. `data/ingest-state.json` remains the authority for that reviewed snapshot. The API checkpoint tracks transport progress only: downloaded does not mean reviewed.

The API queue uses the existing maintenance categories and suggested-action vocabulary while remaining outside the public catalog. It is a review aid, not a proposal to advance the annual export watermark. Existing stable record IDs, route ownership, relationships, original exported GPS, route classifications, and publication validations remain authoritative. API data does not replace any of them.

- Running stays `review-only` by default. Race, marathon, organized-event, or challenge hints are requests for evidence and editorial review.
- Cycling stays `bike-review`; a generic `Ride` is not an MTB classification. Riding style is resolved for the individual outing.
- Nordic can suggest `candidate-outing`, with races and named untimed events distinguished manually. Existing day-level identities remain unchanged.
- Alpine skiing suggests `ski-passport` reconciliation. Resort, run, vertical, season, and trip facts remain subject to the existing Ski Passport and Slopes source rules.
- Story candidates require later editorial review. The tool does not generate personal narratives or infer recollections.

Historical account exports and API responses have distinct provenance and potentially distinct usage rights. API authorization does not retrospectively settle publication rights for the existing export-derived archive; nor do existing public records authorize publishing newly API-derived information. The policy's user bulk-export right (§6.6) does not establish identical downstream rights. Keep export provenance separate and obtain appropriate review before changing either boundary.

## GPS and location privacy

Streams returned by Strava are API-provided representations, not the original watch files. They cannot establish complete recording coverage or replace original GPX/FIT/TCX evidence. Preserve the existing exported originals unchanged. Missing streams are valid and must not trigger invented geometry.

`activity:read_all` is needed to read the athlete's Only You activities, and also permits access to privacy-zone data. Returned coordinates must therefore be treated as highly private; visibility in an API response is not permission to publish a hidden map section. The private review queue grants no public route and never invokes either route materializer.

GPS integrity checks are local, deterministic checks with synthetic tests. Gaps, invalid samples, time discontinuities, and implausible jumps must remain visible as review findings. They are not evidence for silently bridging a gap, interpolating points, correcting a route, or claiming complete GPS coverage. Any later correction or reconstruction must use the existing route policy and keep recorded, corrected, and inferred segments distinguishable.

## Limitations requiring review

The activity-list endpoint filters by when an activity occurred, not when it was edited or uploaded. An incremental start-time scan alone cannot discover every historical edit or late upload. Date-window backfills and explicit reconciliation are necessary. There is no documented read endpoint supplying a complete deletion log or modified-since cursor. A missing activity can mean deletion, changed accessibility, or another source-side condition; report it as unavailable rather than claiming a definite deletion.

Manual execution provides no continuous webhook coverage. Freshness and cache expiry must be enforced locally, and stale information must not be treated as current. No successful live authentication, Keychain interaction, or synchronization should be assumed from synthetic tests.

Before live use, review the registered application's current eligibility/subscription requirements and its privacy-policy disclosures. The registered name “Adventure Passport Private Strava Sync” also needs a brand review: API Policy §4.1 restricts use of the Strava mark as part of an application's name. Confirm required Strava/device attribution, including Garmin-sourced data (§4.4), in the private display. Any future publication or extended retention requires separate review; this implementation does not authorize it.

## macOS review follow-up

The follow-up review ran `npm run test:strava-private` on macOS 26.6 with
Python 3.8.2 and Node 25.6.1: all 100 synthetic tests passed. The source-only
`npm run validate:strava-private` and `git diff --check` also passed. The first
Mac run exposed symlinked system temporary paths in the test fixtures; resolving
only those synthetic roots fixes the suite while production symlink rejection
remains intact. Regression coverage also checks interrupted authorization-code
exchanges, malformed credential recovery, and honest local-only disconnect
messages. Synthetic CI includes both Linux and macOS. Hosted results for each
revision are recorded in the draft PR separately from these local results.

Subsequent noninteractive native diagnostics completed a Keychain lookup and
found no saved authorization bundle; launchctl confirmed that the cleanup
LaunchAgent was registered. Credential save/reload and rotation, cleanup
execution/expiry, real OAuth, live sync, report inspection, and revocation still
require separate verification. Diagnostic output contained only fixed
operational results.

For manual verification, use your normal full repository checkout in a separate
ordinary Terminal, with this branch updated and the authoritative
`data/ingest-state.json` available. A source-only review checkout may omit that
file; include the unchanged file before live sync, without creating a replacement
watermark or using an API checkpoint as its substitute. Run auth, status, sync,
then report using the commands above. Confirm
Keychain approval and cleanup installation locally. To check refresh later, wait
until the access token needs refresh (normally about six hours), run sync again,
and inspect locally. Never edit or expose tokens to force a test. Check the
cleanup LaunchAgent locally with:

```bash
launchctl print "gui/$(id -u)/org.adventurepassport.strava-private-cleanup"
```

After private review, close the report. Test disconnect when ready to revoke the
grant; confirm its fixed completion message locally. If desired, authorize again
afterward. You may tell Codex only whether each operational step passed, failed,
or was skipped. Do not send raw terminal output, callback URLs, credentials,
activity counts, API details, GPS, reports, or derived summaries. A step's
operational pass/fail is not a claim about activity completeness or content.
