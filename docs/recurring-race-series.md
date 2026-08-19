# Recurring race series pages

Recurring race families are modeled with two layers:

- `data/relationships.json` groups the individual race records and points to an `adventureId`.
- `data/notable-adventures.json` provides the dedicated series/story record published at `/record/<series-slug>/`.

The race archive renders these relationships in **Series & challenges**, while each individual race record can link back into the larger recurring series.

Current recurring-series pages include Snowman Shuffle, River to River Relay, Illinois Marathon Weekend, Garmin Marathon in the Land of Oz, Chicago Marathon, Mile High United Way Turkey Trot, RunDenver, BOLDERBoulder, COLDERBolder, and Denver Colfax Marathon Weekend.

## Series metrics

Recurring-series story pages derive their statistics from the member race records rather than maintaining a second set of hand-entered results. The presentation includes:

- appearances and years raced;
- cumulative organizer race distance;
- official-result and route coverage;
- distance history across editions;
- best and average result for the largest comparable same-distance cohort;
- year-over-year charts and PR markers when at least two comparable results exist.

Official organizer/timer results are always preferred. GPS elapsed time is used only when no comparable official-result cohort exists, and the UI labels that distinction explicitly. Mixed-distance series such as Colfax are never averaged as though every race were equivalent.

## Completeness audit

`scripts/build-recurring-race-audit.mjs` builds `data/recurring-race-audit.json` from the published record layer and relationships. The audit records:

- every modeled recurring series and its member coverage;
- missing official results and missing usable routes within those series;
- repeated multi-year race-name families that are not fully represented by a `type: "series"` relationship;
- a research queue for result recovery, route recovery, and series-review candidates.

The audit is generated during `npm run build:publish` and checked by `npm run validate:all`. It is intentionally a review aid: heuristic candidate families are never auto-promoted into public series without evidence.

## Historical route policy

Personal GPS remains the preferred route source. Organizer-issued or edition-specific historical geometry can also be used with explicit provenance. When the user explicitly approves a current or oldest-known course as a historical proxy, that geometry may be attached to earlier editions only when it is clearly labeled as a representative historical-course proxy rather than personal GPS or proof that every turn was identical.
