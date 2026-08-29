# Adventure Design System Baseline

Status: **baseline documentation only**  
Purpose: preserve the visual system while the site is consolidated through small, independently reversible PRs.

This document records the design language that already exists in production. It is not a redesign specification. Future visual PRs should cite this baseline and state explicitly when they intentionally depart from it.

## 1. Design principles

1. **Editorial archive, not activity dashboard.** The site should feel like a personal record of meaningful days rather than a generic fitness application.
2. **One system, distinct activity identities.** Races, summits, alpine skiing, Nordic skiing, mountain biking, and composite adventures share layout rules while retaining activity-specific accents.
3. **Warm, restrained foundation.** Large typography, warm paper, white panels, subtle borders, and limited shadows carry most of the visual hierarchy.
4. **Data supports the story.** Metrics, routes, official results, badges, and series relationships should clarify the record rather than compete with the title and narrative.
5. **Progressive detail.** Landing and chapter pages stay broad; record pages reveal deeper route, result, media, and chronology information.
6. **Mobile is a first-class layout.** Horizontal overflow, tiny controls, and stacked navigation should be treated as design defects rather than desktop compromises.

## 2. Canonical style sources

The current foundation is distributed across a few production files:

- `adventure-theme.css` — activity color tokens.
- `section.css` — shared paper/ink palette, typography, shell, navigation, cards, metrics, timelines, record detail primitives, and responsive rules.
- `landing.css` — landing-page composition.
- `detail-phase4.css` — richer record-detail presentation.
- `map-*.css` and `chapter-map.css` — map-specific presentation.
- activity/editorial stylesheets such as `race-series.css`, `ski-passport.css`, `world-majors.css`, `story-themes.css`, and `adventures-editorial.css` — specialized motifs layered on top of the shared system.

New global design tokens should be added to a shared source rather than redefined independently in a page-specific stylesheet.

## 3. Core palette

### Shared foundation

The primary shared palette currently comes from `section.css`:

- Ink: `#17202a`
- Muted text: `#68737d`
- Paper: `#f7f4ee`
- Panel: `#ffffff`
- Border: `#ddd7cd`

The overall site should remain warm and low-glare. Activity color is an accent, not a page background.

### Activity accents

Canonical activity tokens live in `adventure-theme.css`:

| Activity | Token | Color |
| --- | --- | --- |
| Mountain biking | `--activity-mtb` | `#2f7d4a` |
| Nordic skiing | `--activity-nordic` | `#1779a8` |
| Road races | `--activity-road-races` | `#d97706` |
| Trail races | `--activity-trail-races` | `#b45309` |
| Alpine skiing | `--activity-skiing` | `#16a6c9` |
| Summits | `--activity-summits` | `#16836d` |
| Adventures | `--activity-adventures` | `#8b5cf6` |
| Mixed / neutral | `--activity-mixed` | `#59636d` |

Do not introduce a second color for an existing activity without an explicit design reason.

## 4. Typography

The shared interface uses an Inter/system sans-serif stack.

Hierarchy rules:

- Hero titles are intentionally very large, tightly tracked, and editorial.
- Eyebrows are small, uppercase, strongly weighted, and use the active accent.
- Section titles use large display sizing but remain clearly subordinate to the page hero.
- Body and explanatory text use muted ink and comfortable line height.
- Metadata should remain readable; do not shrink important information simply to make dense layouts fit.

Large headings are part of the site's identity and should not be normalized into generic dashboard typography.

## 5. Layout and spacing

- Canonical content width: approximately `1180px`.
- Main-page horizontal padding uses responsive `clamp(...)` spacing.
- Sections are separated primarily by whitespace and thin rules rather than heavy containers.
- Cards use modest corner radii and subtle borders.
- Shadows are secondary hover/depth cues, not default decoration.
- Dense grids collapse progressively from multi-column desktop layouts to one-column mobile layouts.

Avoid adding a new card merely to group content that can be expressed through spacing and typography.

## 6. Core components

### Header and navigation

- Sticky warm-paper header.
- `ALEX FORD` parent-site affordance remains visually restrained.
- Primary navigation uses compact pill links.
- Activity navigation may use a secondary layer, but mobile must not require multiple stacked horizontal-scrolling navigation rows.

### Hero

- Eyebrow → oversized title → short explanatory deck → accent rule.
- The hero should communicate identity before statistics or controls.

### Metrics

- Compact panel with one strong value and one quiet label.
- Accent may appear as a narrow edge or small detail.
- Metrics are supporting information, not the page title.

### Cards

- White/light panel, thin border, restrained radius.
- Small kicker, clear title, muted supporting copy, strong terminal value/action.
- Hover may lift slightly and strengthen border/shadow.
- Avoid nested card-on-card compositions unless the information hierarchy genuinely requires them.

### Badges and pills

Use sparingly. A badge should communicate a state or classification that cannot be understood as quickly from normal copy.

Priority order when several signals exist:

1. record/event identity,
2. result or milestone,
3. collection/series/pursuit relationship,
4. verification or provenance metadata.

Do not allow every metadata field to become a badge.

### Maps

- Route geometry is the focal content.
- Map controls should remain visually quieter than the route.
- Activity colors should remain consistent between maps and chapter/detail contexts.
- Mobile maps must preserve useful visible map area and accessible controls.

## 7. Record hierarchy

The archive contains conceptually different record levels. Future consolidation PRs should make these semantics explicit before adding stronger visual differences.

- **Event / activity:** one race, summit, ski day, Nordic day, MTB day, etc.
- **Collection / challenge:** multiple related events completed as one objective or weekend.
- **Series:** recurring editions of the same race/event family across years.
- **Pursuit:** a long-running objective such as the World Marathon Majors.

These levels should share the design system but should not appear conceptually interchangeable.

## 8. Responsive and accessibility baseline

- Preserve visible focus states for keyboard users.
- Interactive controls should target roughly 44px touch areas where practical.
- Do not rely on color alone to communicate state.
- Avoid essential text below a comfortably readable mobile size.
- Prevent horizontal page overflow.
- Long record names must wrap without breaking the layout.
- Navigation, filters, maps, and detail panels must remain usable at narrow phone widths.

## 9. Change protocol

For design-system work:

1. Start from green `main`.
2. One concern per PR.
3. Prefer 1–5 handwritten files changed.
4. Keep data/route/media changes out of visual-system PRs.
5. Validate the changed page plus at least one neighboring page expected to remain unchanged.
6. Run all repository CI before merge.
7. Merge and verify deployment before stacking another visual PR in the same area.
8. Prefer additive/override changes first; refactor shared CSS only after the visible behavior is proven.

## 10. Known consolidation targets

The August 2026 design audit identified these follow-on areas. They are intentionally **not** changed by this baseline PR:

- clarify Event / Collection / Series / Pursuit hierarchy,
- reduce stacked mobile navigation,
- create intentional sparse historical-record states,
- give each activity family one restrained editorial signature,
- reduce overuse of pills/cards/bordered panels,
- consolidate duplicated page-specific styling only after visible behavior stabilizes,
- standardize the thin cross-site Alex Ford identity layer without erasing each sub-site's personality.

This document is the reference point for those PRs.
