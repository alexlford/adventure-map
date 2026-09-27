# Archive additions

`data/archive-additions.json` tracks when selected public records first entered the Adventures archive. This is intentionally separate from an adventure's event date.

## Semantics

- `recordId` references a canonical ID in `data/public-records.json`.
- `addedAt` is the first known archive-entry date in `YYYY-MM-DD` form.
- `source: "git-history"` means the date was recovered from repository history and requires a full `sourceCommit` SHA.
- `source: "manual"` is reserved for future additions when the archive-entry date is known directly.
- At most one entry may use `featured: true`; the homepage uses that record as the large Recently Added feature.
- Entries stay newest-first. Event chronology remains independent and continues to live in the canonical record data.

Run `npm run validate:archive-additions` after editing the ledger.

The ledger is intentionally persistent rather than generated from the current date during publication. That keeps builds deterministic and prevents an old event imported today from being confused with the latest event chronologically.
