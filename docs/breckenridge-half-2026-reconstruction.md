# Breckenridge Half Marathon 2026 reconstruction

- Event date: October 11, 2026. The organizer Sunday schedule, Strava activity and official checkpoint epoch timestamps agree. The results-page weekend header says October 10; preserve that as officialArchiveDate rather than changing the activity date.
- Official result: [Laurel, Alex Ford #383](https://results.laurelt.com/bkm/results?pk=9322669), 2:03:54 chip, 2:04:06 gun, 9:27/mi, 60/222 overall, 38/98 male, 12/25 M30–39.
- Strava screenshot: 13.50 mi, 2:03:21 moving, 2:04:05 elapsed, 9:08/mi moving, 9:11/mi elapsed, 390 ft gain, maximum elevation 10,358 ft. These are watch metrics and do not replace official distance or timing.
- Fourteen watch split paces and net elevation changes were transcribed. Rounded split paces do not establish exact cumulative elapsed times; none are synthesized. Health metrics shown in screenshots are not published.

## Organizer geometry

[RunBreck course page](https://www.runbreck.com/Race/BreckenridgeRoadMarathon/Page/Course-Maps) embeds [Strava route 3479586316635225542](https://www.strava.com/routes/3479586316635225542), titled Breckenridge Road Half Marathon. Its public embed contains 1,676 route coordinates with elevation, retained in data/sources/breckenridge-half-2026-organizer-route.json.

Run python3 scripts/reconstruct-breckenridge-half-2026.py to reproduce the GeoJSON. It preserves all vertices and verifies the Boreas Pass start, Kingdom Park finish, Gold Hill turnaround, continuous geometry and plausible half-marathon length. Mapped length is 21.1450 km; nominal race distance remains 21.0975 km (13.1 mi). The shape and high-start/downhill/northward-out-and-back profile agree with the screenshots. This is an organizer-course reconstruction, not personal GPS.

## Provider checkpoint anomalies

The public individual-result HTML exposes checkpoint times and positions. A small diagnostic subset is preserved in data/sources/breckenridge-half-2026-timing-checkpoints.json. Mile 8.25 repeats the Mile 7 position, Mile 9.85 has no timing reading, and the next reported interval pace is implausibly fast. Do not silently repair labels or use these rows to manufacture a personal timed track. Official chip finish and placements are corroborated by the supplied result screenshot.

## Annual export reconciliation

Use screenshots, official results and organizer routes for interim updates. Do not advance the August 2026 reviewed Strava watermark. On the next user-supplied annual export, match this event to its original activity ID and GPS, reconcile all archive omissions/duplicates, and preserve organizer geometry as a separately labeled source.

## Supplied screenshot fingerprints

| File | SHA-256 |
| --- | --- |
| 15F866AA-D103-41B7-A6BF-324FAF745EA0.jpeg | 085f746e199fe08f7de78245becf1873c44436d5cba805017d9e27360b726780 |
| IMG_3670(1).jpeg | 88d807ad3d68a74b4bfc9a5588be788d3867b239639c1d95e88c7e59a99d017b |
| IMG_3671.jpeg | c70068b03c1e9b2893ca7ed57b18b8a697067f6de502bb00c71323da5082a878 |
| IMG_3672.png | 534b403687e3a0aeba65cdeb1bf5a035da91c7f992d04b74659e4deed6cce18a |
| IMG_3673.png | ac67a1ebf7c4a273454057f21323c2160d7e88da56ea4d6bdd085467fd0eca03 |
| IMG_3674.png | dfd1c79271c61e455f3c682bc893021ac285b52d06c8f87fd87174f19f7113b6 |
| IMG_3675.png | 4bb4db523cb4b6b3a5884e4a882bf8606fd89837e916f6d152bc9dd0d1f7e8bb |
| IMG_3676.png | 392b92d9be76e1bbb9e1363556cbc429fcc3cc5f829853caafa3945da7a27c9d |
| IMG_3677.png | b0561ba9f142b0ccc802308b0cb791655d11800e9c9e0d4071af828e4cc31a83 |
| IMG_3678.png | 2ef48b4efbd2aa3b0b71be251965ec055b20395c647c9b1cca0b595dfd7a010f |
| IMG_3679.png | c319d2e669be3e092c70967c6ef9e51ecf34b636680f9c930566ded549483b57 |
| IMG_3680.jpeg | afd3bb5d0afc134e7b1d3c8daa1a0131f193c61318737f7dad096149c4f5e0b3 |
