# NYC Marathon 2026: result and course reconstruction

Completed November 1, 2026; Alex Ford, bib 32422. Evidence supplied November 2, 2026.

- Finish: **4:18:33**; average pace: **9:52/mi**.
- First half: **1:56:14**; second half (finish minus halfway): **2:22:19**.
- User explicitly confirmed the **pink start** during this update.
- All 34 cumulative timing checkpoints are transcribed into `data/new-york-city-marathon-2026-official.json`. Published segment paces are retained even where rounded distances/times would produce a different calculated pace.
- App labels 3.1, 6.2, 9.3, 12.4, 15.5, 18.6, 21.7, and 24.9 miles correspond to the official 5K through 40K checkpoints. Exact metric distances and 21.0975 km halfway are used for alignment.
- Start and finish wall-clock readings are 10:21 am and 2:40 pm, America/New_York, at minute precision. No exact start second is inferred.

## Course sources

[NYRR 2026 course page](https://prod.nyrr.org/tcsnycmarathon/the-course) links to the [official interactive map](https://www.google.com/maps/d/embed?mid=1pHIR8TGIl2liF3A2oR52Z1RPPi_una0) and [2026 PDF](https://cms.prod.nyrr.org/api/document-files/file/TCSNYCM26_Map_Course_090226_RD3.pdf). The original interactive-map KML is preserved at `data/sources/new-york-city-marathon-2026-official.kml`.

The official pink branch is joined to the common course at its Brooklyn merge. The 2026 Bronx alignment follows East 135th Street → Alexander Avenue → East 141st Street → Third Avenue → East 138th Street, then Madison Avenue Bridge.

Run `python3 scripts/reconstruct-nyc-2026-course.py` to reproduce the 263-vertex course with 34 timed checkpoint anchors. Original organizer vertices are retained, plus checkpoint projections and the merge. The largest checkpoint-to-line offset is 11.3 m. The generalized map line measures 42.323 km; official race distance remains 42.195 km. It is not a personal GPS recording. Elapsed times between checkpoint anchors are piecewise-linear estimates along the organizer line, not measured running speed.

## Screenshot evidence fingerprints

Screenshots remain outside the public repository; only their result transcription is published.

| Supplied file | SHA-256 |
| --- | --- |
| IMG_3662(1).png | `d2acaeea7bca113696a7a0ebae2dd0685f4836577ad23a9313b3ae2d9a0e4a48` |
| IMG_3663(1).png | `82ca32257decf6c96582c492bc1d162248e6ffa4218aaf9b0a0cdd04a7ff9d09` |
| IMG_3664(1).png | `e36a12f36e64fb37feb341d991b21c63b1d99368f638d70772e8860518e224e4` |
| IMG_3665(1).png | `7058da97adc7dee4fe3b377d030174b77ab41e2b1457ee423e39970afb577e7c` |
| IMG_3666(1).png | `ffddc5f7104bf5e509cc3421706f32a6892a1a37564d9550cb14fe6d0883b86e` |
| IMG_3667(1).png | `6dc831c2d5ec9a85566c1edd6c78f7ad4834dca0c0a45e1d3068b64dc23b1d6c` |
| IMG_3668(1).png | `efa2b66a9ef67591db9caec0390623c87031bce3b803340a358efe69caeaf9aa` |
| IMG_3669(1).png | `4d58075be2c0770e5343e40b3ede8f6b2d90ff09600e635f5834d1d5971a5acc` |
| IMG_3670(1).jpeg | `88d807ad3d68a74b4bfc9a5588be788d3867b239639c1d95e88c7e59a99d017b` |
