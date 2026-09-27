const origin = (process.env.PRODUCTION_ORIGIN || 'https://adventures.alexlford.com').replace(/\/$/, '');
const paths = ['/', '/map', '/timeline'];
const errors = [];

for (const pathname of paths) {
  const url = `${origin}${pathname}`;
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
      headers: { 'user-agent': 'alex-ford-adventures-production-smoke/1.0' }
    });
    const contentType = response.headers.get('content-type') || '';
    const body = await response.text();
    if (!response.ok) errors.push(`${pathname}: HTTP ${response.status}`);
    if (!contentType.includes('text/html')) errors.push(`${pathname}: expected text/html, got ${contentType || '(missing)'}`);
    if (!/<title>[\s\S]*?<\/title>/i.test(body)) errors.push(`${pathname}: response is missing an HTML title`);
    console.log(`${response.ok ? 'OK' : 'FAIL'} ${pathname} -> ${response.status} ${response.url}`);
  } catch (error) {
    errors.push(`${pathname}: ${error.name}: ${error.message}`);
    console.error(`FAIL ${pathname}: ${error.message}`);
  }
}

if (errors.length) {
  console.error('\nProduction smoke check failed:');
  errors.forEach(error => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  console.log(`\nProduction smoke check passed for ${paths.length} routes.`);
}
