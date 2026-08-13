import { readFile } from 'node:fs/promises';

const ROOT = new URL('../', import.meta.url);

const contracts = [
  {
    path: 'adventure-map-api.js',
    required: [
      'const presentationHooks = {',
      'afterRenderList: []',
      'afterFocusStyles: []',
      'registerPresentationHook(kind, hook)',
      "runPresentationHooks('afterRenderList'",
      "runPresentationHooks('afterFocusStyles'",
      'const runtimeInternal = Object.freeze({',
      'const runtime = Object.freeze({',
      'window.AdventureMapRuntime = runtime',
      'window.AdventureMap = Object.freeze(api)'
    ],
    forbidden: []
  },
  {
    path: 'map-route-detail.js',
    required: [
      'const runtime = window.AdventureMapRuntime',
      'AdventureRoutes.detailIndex()',
      'AdventureRoutes.loadDetailForAdventure',
      "internal.registerPresentationHook('afterFocusStyles'",
      'MAX_DETAIL_FEATURES = 8'
    ],
    forbidden: [
      /\bstate\./,
      /CATEGORY/,
      /window\.adventureMap/,
      /renderPreservingFocus\(/,
      /filteredAdventures\(/,
      /renderRoutes\(/,
      /renderMarkers\(/,
      /renderList\(/
    ]
  },
  {
    path: 'official-results-ui.js',
    required: [
      'const runtime = window.AdventureMapRuntime',
      "internal.registerPresentationHook('popupCard'",
      "internal.registerPresentationHook('itemValue'"
    ],
    forbidden: [
      /popupCard\s*=/,
      /itemValue\s*=/,
      /publicLayerFor\(/,
      /window\.adventureMap/
    ]
  },
  {
    path: 'map-enhancements.js',
    required: [
      'const runtime = window.AdventureMapRuntime',
      'const internal = runtime?.internal'
    ],
    forbidden: [
      /\bstate\./,
      /CATEGORY\[/,
      /publicLayerFor\(/,
      /filteredAdventures\(\)/,
      /(^|[^\w.])renderMarkers\(/m,
      /window\.adventureMap/
    ]
  },
  {
    path: 'map-ui-polish.js',
    required: [
      'const runtime = window.AdventureMapRuntime',
      "internal.registerPresentationHook('popupCard'",
      "internal.registerPresentationHook('afterRenderList'",
      "internal.registerPresentationHook('afterFocusStyles'"
    ],
    forbidden: [
      /\bstate\./,
      /CATEGORY/,
      /publicLayerFor\(/,
      /\bmapped\(/,
      /renderList\s*=/,
      /applyFocusStyles\s*=/,
      /focusAdventure\(/,
      /setRouteEmphasis\(/,
      /popupCard\s*=/,
      /window\.adventureMap/
    ]
  },
  {
    path: 'map-keyboard.js',
    required: ['const runtime = window.AdventureMapRuntime'],
    forbidden: [
      /\bstate\./,
      /applyFocusStyles\s*=/,
      /typeof\s+map/,
      /window\.adventureMap/
    ]
  },
  {
    path: 'map-touch-mode.js',
    required: ['window.AdventureMapRuntime?.leaflet'],
    forbidden: [/window\.adventureMap/]
  },
  {
    path: 'expansion.js',
    required: [
      'const runtime = window.AdventureMapRuntime',
      'internal.mergeRouteCollections(payloads)'
    ],
    forbidden: [
      /\bstate\./,
      /CATEGORY\./,
      /renderPreservingFocus\(\)/,
      /window\.adventureMap/
    ]
  },
  {
    path: 'ski-map.js',
    required: [
      'const runtime = window.AdventureMapRuntime',
      "internal.registerPresentationHook('popupCard'",
      "internal.registerPresentationHook('itemMeta'",
      "internal.registerPresentationHook('itemValue'",
      'internal.mergeRecords('
    ],
    forbidden: [
      /\bstate\./,
      /CATEGORY\./,
      /window\.popupCard/,
      /window\.itemMeta/,
      /window\.itemValue/,
      /renderPreservingFocus\(/,
      /filteredAdventures\(/,
      /window\.adventureMap/
    ]
  }
];

const errors = [];

for (const contract of contracts) {
  const source = await readFile(new URL(contract.path, ROOT), 'utf8');

  for (const required of contract.required) {
    if (!source.includes(required)) {
      errors.push(`${contract.path}: missing required runtime-boundary marker: ${required}`);
    }
  }

  for (const forbidden of contract.forbidden) {
    if (forbidden.test(source)) {
      errors.push(`${contract.path}: forbidden direct core access matched ${forbidden}`);
    }
  }
}

if (errors.length) {
  console.error('Map runtime boundary validation failed:');
  errors.forEach(error => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`Map runtime boundary validation passed for ${contracts.length} files.`);
