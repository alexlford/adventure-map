import { rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const host = '127.0.0.1';
const port = '4173';
const baseUrl = `http://${host}:${port}`;
const requestedTests = process.argv.slice(2);
const failureLogPath = 'browser-failure.log';

rmSync(failureLogPath, { force: true });

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const stripAnsi = value => String(value).replace(/\u001b\[[0-9;]*m/g, '');
const escapeWorkflowCommand = value => stripAnsi(value)
  .replace(/%/g, '%25')
  .replace(/\r/g, '%0D')
  .replace(/\n/g, '%0A');

const run = (command, args, options = {}) => new Promise((resolve, reject) => {
  const { captureFailure = false, ...spawnOptions } = options;
  const child = spawn(command, args, {
    stdio: captureFailure ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    shell: false,
    ...spawnOptions
  });
  let output = '';

  if (captureFailure) {
    const capture = (stream, destination) => stream?.on('data', chunk => {
      destination.write(chunk);
      output = `${output}${chunk}`.slice(-12000);
    });
    capture(child.stdout, process.stdout);
    capture(child.stderr, process.stderr);
  }

  child.on('error', reject);
  child.on('exit', code => {
    if (code === 0) {
      resolve();
      return;
    }
    if (captureFailure && output.trim()) {
      const tail = stripAnsi(output).trim();
      writeFileSync(failureLogPath, `${tail}\n`, 'utf8');
      if (process.env.GITHUB_ACTIONS) {
        console.log(`::error title=Browser regression failure::${escapeWorkflowCommand(tail.slice(-8000))}`);
      }
    }
    reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
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
  if (requestedTests.length) {
    await run('npx', ['playwright', 'test', ...requestedTests, '--project=chromium'], { captureFailure: true });
  } else {
    await run('npx', ['playwright', 'test', '--project=chromium'], { captureFailure: true });
    await run('npx', [
      'playwright',
      'test',
      'tests/mobile-layout.spec.mjs',
      'tests/world-majors-layout.spec.mjs',
      '--project=webkit-mobile'
    ], { captureFailure: true });
  }
} finally {
  stopServer();
}
