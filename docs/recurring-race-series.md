# Recurring race series pages

Recurring race families are modeled with two layers:

- `data/relationships.json` groups the individual race records and points to an `adventureId`.
- `data/notable-adventures.json` provides the dedicated series/story record published at `/record/<series-slug>/`.

The race archive renders these relationships in **Series & challenges**, while each individual race record can link back into the larger recurring series.

Current recurring series pages include Snowman Shuffle, River to River Relay, Illinois Marathon Weekend, RunDenver, BOLDERBoulder, COLDERBolder, and Denver Colfax Marathon Weekend.

## Historical route policy

A recurring event's venue is not sufficient evidence that its course geometry remained unchanged. Historical race records without surviving personal GPS use a published historical course only when the geometry can be tied to the relevant edition or defensibly documented as a shared course. Otherwise the record remains route-pending rather than displaying inferred geometry.
