from pathlib import Path
import base64


def replace_once(path, old, new, label):
    file_path = Path(path)
    text = file_path.read_text()
    if old not in text:
        raise SystemExit(f"Could not locate {label} in {path}")
    file_path.write_text(text.replace(old, new, 1))


# Static selected state is accessible before runtime enhancement.
map_path = Path('map.html')
text = map_path.read_text()
buttons = {
    '<button class="filter-button is-active" type="button" data-filter="all">All</button>': '<button class="filter-button is-active" type="button" data-filter="all" aria-pressed="true">All</button>',
    '<button class="filter-button" type="button" data-filter="mtb">MTB</button>': '<button class="filter-button" type="button" data-filter="mtb" aria-pressed="false">MTB</button>',
    '<button class="filter-button" type="button" data-filter="nordic">Nordic skiing</button>': '<button class="filter-button" type="button" data-filter="nordic" aria-pressed="false">Nordic skiing</button>',
    '<button class="filter-button" type="button" data-filter="road-races">Road races</button>': '<button class="filter-button" type="button" data-filter="road-races" aria-pressed="false">Road races</button>',
    '<button class="filter-button" type="button" data-filter="trail-races">Trail races</button>': '<button class="filter-button" type="button" data-filter="trail-races" aria-pressed="false">Trail races</button>',
    '<button class="filter-button" type="button" data-filter="skiing">Alpine skiing</button>': '<button class="filter-button" type="button" data-filter="skiing" aria-pressed="false">Alpine skiing</button>',
    '<button class="filter-button" type="button" data-filter="summits">Summits</button>': '<button class="filter-button" type="button" data-filter="summits" aria-pressed="false">Summits</button>',
    '<button class="filter-button" type="button" data-filter="adventures">Adventures</button>': '<button class="filter-button" type="button" data-filter="adventures" aria-pressed="false">Adventures</button>',
}
for old, new in buttons.items():
    if old not in text:
        raise SystemExit(f"Could not locate map filter markup: {old}")
    text = text.replace(old, new, 1)
map_path.write_text(text)

# One reflector owns visual + accessibility state.
replace_once(
    'app.js',
    "function render(){const pinned=state.pinnedFocusId,items=filteredAdventures();renderRoutes(items);renderMarkers(items);renderList(items);if(pinned&&items.some(a=>a.id===pinned))state.focusId=pinned;else if(pinned)state.pinnedFocusId=null;requestAnimationFrame(()=>applyFocusStyles())}",
    "function reflectFilterControls(){document.querySelectorAll('[data-filter]').forEach(button=>{const active=button.dataset.filter===state.filter;button.classList.toggle('is-active',active);button.setAttribute('aria-pressed',String(active))})}\nfunction render(){reflectFilterControls();const pinned=state.pinnedFocusId,items=filteredAdventures();renderRoutes(items);renderMarkers(items);renderList(items);if(pinned&&items.some(a=>a.id===pinned))state.focusId=pinned;else if(pinned)state.pinnedFocusId=null;requestAnimationFrame(()=>applyFocusStyles())}",
    'map render function',
)
replace_once(
    'app.js',
    "document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{state.filter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('is-active',x===button));applyAndFit()}));",
    "document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{state.filter=button.dataset.filter;reflectFilterControls();applyAndFit()}));",
    'filter click handler',
)
replace_once(
    'app.js',
    "renderArchiveState('loading','Loading map archive','Preparing routes and locations.');resultCount.textContent='Loading';resultsSection?.setAttribute('aria-busy','true');",
    "reflectFilterControls();renderArchiveState('loading','Loading map archive','Preparing routes and locations.');resultCount.textContent='Loading';resultsSection?.setAttribute('aria-busy','true');",
    'initial map state',
)

# Programmatic changes reflect even when renderNow=false.
replace_once(
    'adventure-map-api.js',
    "      if (Object.hasOwn(next, 'yearTo')) state.yearTo = Number.isFinite(next.yearTo) ? next.yearTo : null;\n      if (renderNow && typeof render === 'function') render();",
    "      if (Object.hasOwn(next, 'yearTo')) state.yearTo = Number.isFinite(next.yearTo) ? next.yearTo : null;\n      if (typeof reflectFilterControls === 'function') reflectFilterControls();\n      if (renderNow && typeof render === 'function') render();",
    'setViewState reflection point',
)

# URL state remains independently defensive.
replace_once(
    'map-url-state.js',
    "    document.querySelectorAll('[data-filter]').forEach(button => {\n      button.classList.toggle('is-active', button.dataset.filter === current || (current === 'all' && button.dataset.filter === 'all'));\n    });",
    "    document.querySelectorAll('[data-filter]').forEach(button => {\n      const active = button.dataset.filter === current || (current === 'all' && button.dataset.filter === 'all');\n      button.classList.toggle('is-active', active);\n      button.setAttribute('aria-pressed', String(active));\n    });",
    'URL layer reflection',
)

# Browser contract: deep-link, click, API change, and static markup.
test_block = '''test('Map layer toggles keep visual and aria-pressed state synchronized', async ({ page }) => {\n  const errors = collectRuntimeErrors(page);\n  await page.goto('/map.html?layer=summits', { waitUntil: 'domcontentloaded' });\n  await expect(page.locator('#resultCount')).toContainText('shown');\n\n  const all = page.locator('[data-filter="all"]');\n  const summits = page.locator('[data-filter="summits"]');\n  const mtb = page.locator('[data-filter="mtb"]');\n  const nordic = page.locator('[data-filter="nordic"]');\n\n  await expect(summits).toHaveClass(/is-active/);\n  await expect(summits).toHaveAttribute('aria-pressed', 'true');\n  await expect(all).not.toHaveClass(/is-active/);\n  await expect(all).toHaveAttribute('aria-pressed', 'false');\n\n  await mtb.click();\n  await expect(mtb).toHaveClass(/is-active/);\n  await expect(mtb).toHaveAttribute('aria-pressed', 'true');\n  await expect(summits).not.toHaveClass(/is-active/);\n  await expect(summits).toHaveAttribute('aria-pressed', 'false');\n  expect(await page.evaluate(() => window.AdventureMap.state().filter)).toBe('mtb');\n\n  await page.evaluate(() => window.AdventureMap.setViewState({ filter: 'nordic' }, { renderNow: false }));\n  await expect(nordic).toHaveClass(/is-active/);\n  await expect(nordic).toHaveAttribute('aria-pressed', 'true');\n  await expect(mtb).not.toHaveClass(/is-active/);\n  await expect(mtb).toHaveAttribute('aria-pressed', 'false');\n  expect(await page.evaluate(() => window.AdventureMap.state().filter)).toBe('nordic');\n\n  expect(await page.locator('[data-filter][aria-pressed="true"]').count()).toBe(1);\n  expect(errors).toEqual([]);\n});\n\ntest('Map static layer markup exposes one selected toggle before runtime enhancement', async ({ page }) => {\n  await page.route('**/app.js', route => route.abort());\n  await page.goto('/map.html', { waitUntil: 'domcontentloaded' });\n  await expect(page.locator('[data-filter="all"]')).toHaveAttribute('aria-pressed', 'true');\n  await expect(page.locator('[data-filter="all"]')).toHaveClass(/is-active/);\n  await expect(page.locator('[data-filter]:not([data-filter="all"])')).toHaveCount(7);\n  expect(await page.locator('[data-filter="all"][aria-pressed="true"]').count()).toBe(1);\n  expect(await page.locator('[data-filter]:not([data-filter="all"])[aria-pressed="false"]').count()).toBe(7);\n});\n\n'''
test_path = Path('tests/map-current-contracts.spec.mjs')
text = test_path.read_text()
anchor = "test('Map presents recovered official race context through AdventureMap', async ({ page }) => {"
if anchor not in text:
    raise SystemExit('Could not locate browser test insertion point')
test_path.write_text(text.replace(anchor, test_block + anchor, 1))

# Make the previously merged mobile interaction test and the new accessibility
# contract real WebKit CI coverage.
replace_once(
    'scripts/run-browser-tests.mjs',
    "    'tests/mobile-layout.spec.mjs',\n    'tests/world-majors-layout.spec.mjs',",
    "    'tests/mobile-layout.spec.mjs',\n    'tests/mobile-map-interaction.spec.mjs',\n    'tests/map-current-contracts.spec.mjs',\n    'tests/world-majors-layout.spec.mjs',",
    'WebKit spec selection',
)

print('Applied map layer accessibility state and expanded permanent WebKit coverage.')
