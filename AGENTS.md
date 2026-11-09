# Private Strava integration boundary

When working on the Strava API integration, inspect source, schemas, policy files,
and entirely synthetic tests only. Never run `strava:auth`, `strava:reauth`,
`strava:status`, `strava:sync`, or `strava:report` from an AI session. Never read,
upload, summarize, or put real API data or derivatives into an AI context.

The runtime directory `~/Library/Application Support/Adventure Passport Private
Sync` is private and off-limits to AI tools, including Codex. Do not access it,
Keychain credentials, real activity responses, GPS streams, review queues, local
reports, screenshots, or copies of those files. Runtime guards supplement this
boundary; they do not provide an operating-system sandbox against other tools.

Use `npm run test:strava-private` and `npm run validate:strava-private` for this
integration. They use only synthetic fixtures and private-sync source. Full
archive/publication validators may read historical personal activity or GPS data;
leave those checks to an appropriate non-AI environment. Do not weaken them.

Keep API caches separate from historical account-export evidence. Never invoke
public record builders, route materializers, or watermark advancement using API
output. No automatic publication, narrative generation, or permanent API index.
