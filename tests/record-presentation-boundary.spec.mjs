import { test, expect } from '@playwright/test';

async function loadPresentation(page) {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  await page.addScriptTag({ url: '/record-presentation.js' });
  await page.waitForFunction(() => Boolean(window.AdventureRecordPresentation));
}

test('record presentation helpers preserve renderer classification and formatting behavior', async ({ page }) => {
  await loadPresentation(page);

  const result = await page.evaluate(() => {
    const P = window.AdventureRecordPresentation;
    const A = window.AdventureSite;
    const race = { kind: 'race', discipline: 'marathon' };
    const event = { kind: 'event', discipline: 'challenge' };
    const story = {
      kind: 'adventure',
      discipline: 'mountain-loop',
      date: '2025-06-05',
      endDate: '2025-06-07',
      elevationGainM: 1234.4,
      distanceMi: 18.2,
      region: 'Colorado'
    };

    return {
      frozen: Object.isFrozen(P),
      provenance: [
        P.provenanceLabel('personal-gps'),
        P.provenanceLabel('historical-course'),
        P.provenanceLabel('privacy-withheld'),
        P.provenanceLabel('location-only'),
        P.provenanceLabel('other')
      ],
      groups: [
        P.groupFor({ kind: 'summit' }),
        P.groupFor({ discipline: 'mountain-bike' }),
        P.groupFor({ discipline: 'nordic' }),
        P.groupFor({ discipline: 'ski-objective' }),
        P.groupFor({ kind: 'race' }),
        P.groupFor({ kind: 'adventure' })
      ],
      labels: {
        summit: P.labelFor({ kind: 'summit' }),
        downhill: P.labelFor({ kind: 'outing', discipline: 'mountain-bike', mtbMode: 'downhill' }),
        nordic: P.labelFor({ kind: 'outing', discipline: 'nordic' }),
        race: P.labelFor(race),
        expectedRace: A.raceType(race),
        event: P.labelFor(event),
        expectedEvent: A.eventType(event)
      },
      dateKey: [P.dateKey({ date: '2024-05-27', year: 2024 }), P.dateKey({ year: 2023 }), P.dateKey({})],
      placement: [P.placementText(42, 1000), P.placementText(42), P.placementText(null, 1000)],
      feet: [P.feet(1000), P.feet(null)],
      days: [P.inclusiveDays('2025-06-05', '2025-06-07'), P.inclusiveDays('', '')],
      uniqueIds: P.uniq([{ id: 'a' }, null, { id: 'a', value: 2 }, { id: 'b' }]).map(item => item.id),
      mediaCount: P.mediaFor({ media: [
        { src: 'one.jpg', alt: 'one' },
        { type: 'image', src: 'two.jpg', alt: 'two' },
        { type: 'video', src: 'clip.mp4', alt: 'clip' },
        { src: 'missing-alt.jpg' }
      ] }).length,
      companionNames: P.companionsFor({ companions: [{ name: 'A' }, {}, null, { name: 'B' }] }).map(item => item.name),
      caption: P.captionFor({ caption: 'Summit', credit: 'Alex' }),
      story: {
        type: P.typeForStory(story),
        expectedType: A.adventureType(story),
        theme: P.storyThemeFor(story),
        span: P.storySpanFor(story),
        expectedSpan: `${A.formatDate(story.date)} – ${A.formatDate(story.endDate)}`,
        headline: P.storyHeadlineFor(story),
        secondary: P.storySecondaryFor(story)
      },
      fmt: [P.fmtValue(12.345, ' m'), P.fmtValue(null, ' m')],
      dayTypes: [P.dayType({ mtbMode: 'downhill' }), P.dayType({ mtbMode: 'mixed' }), P.dayType({ mtbMode: 'trail' })]
    };
  });

  expect(result.frozen).toBeTruthy();
  expect(result.provenance).toEqual(['Personal GPS route', 'Historical course', 'Route withheld for privacy', 'Location only', 'Route']);
  expect(result.groups).toEqual(['summits', 'mountain-biking', 'nordic', 'skiing', 'races', 'adventures']);
  expect(result.labels).toEqual({
    summit: 'Summit',
    downhill: 'Downhill MTB outing',
    nordic: 'Nordic outing',
    race: result.labels.expectedRace,
    expectedRace: result.labels.expectedRace,
    event: result.labels.expectedEvent,
    expectedEvent: result.labels.expectedEvent
  });
  expect(result.dateKey).toEqual(['2024-05-27', '2023', '0000']);
  expect(result.placement).toEqual(['42 of 1,000', '42', '']);
  expect(result.feet).toEqual([3281, null]);
  expect(result.days).toEqual([3, 1]);
  expect(result.uniqueIds).toEqual(['a', 'b']);
  expect(result.mediaCount).toBe(2);
  expect(result.companionNames).toEqual(['A', 'B']);
  expect(result.caption).toBe('Summit · Photo: Alex');
  expect(result.story.type).toBe(result.story.expectedType);
  expect(result.story.theme).toBe('mountain');
  expect(result.story.span).toBe(result.story.expectedSpan);
  expect(result.story.headline).toBe('18.2 mi');
  expect(result.story.secondary).toBe('1,234 m gain');
  expect(result.fmt).toEqual(['12.35 m', '—']);
  expect(result.dayTypes).toEqual(['Downhill MTB', 'MTB + Downhill MTB', 'MTB']);
});

test('record presentation boundary stays free of DOM, map, URL-state, and network behavior', async ({ request }) => {
  const response = await request.get('/record-presentation.js');
  expect(response.ok()).toBeTruthy();
  const source = await response.text();

  for (const forbidden of [
    'document.',
    'location.',
    'history.',
    'fetch(',
    'XMLHttpRequest',
    'MutationObserver',
    'AdventureMap',
    'Leaflet',
    'L.map'
  ]) {
    expect(source).not.toContain(forbidden);
  }
  expect(source).toContain('window.AdventureRecordPresentation = Object.freeze');
});
