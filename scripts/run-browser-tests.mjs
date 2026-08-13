import { spawn } from 'node:child_process';

const host = '127.0.0.1';
const port = '4173';
const baseUrl = `http://${host}:${port}`;

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const run = (command, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: false,
    ...options
  });
  child.on('error', reject);
  child.on('exit', code => {
    if (code === 0) resolve();
    else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
  });
});

const waitForServer = async () => {
  let lastError;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/index.html`, { cache: 'no-store' });
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await wait(250);
  }
  throw new Error(`Static test server did not become ready at ${baseUrl}: ${lastError?.message || 'unknown error'}`);
};

const server = spawn('python3', ['-m', 'http.server', port, '--bind', host], {
  stdio: ['ignore', 'inherit', 'inherit'],
  shell: false
});

let serverExited = false;
server.on('exit', () => { serverExited = true; });

const stopServer = () => {
  if (!serverExited) server.kill('SIGTERM');
};

process.on('SIGINT', () => {
  stopServer();
  process.exit(130);
});
process.on('SIGTERM', () => {
  stopServer();
  process.exit(143);
});

try {
  await waitForServer();
  await run('npx', ['playwright', 'test', '--project=chromium']);
  await run('npx', [
    'playwright',
    'test',
    'tests/mobile-layout.spec.mjs',
    'tests/world-majors-layout.spec.mjs',
    '--project=webkit-mobile'
  ]);
} finally {
  stopServer();
}
