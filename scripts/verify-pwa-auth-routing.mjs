import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { chromium } from '@playwright/test';

// Exercise the generated production worker in a browser, including its precache.
// The test server stands in for Clerk so this check needs no account or OAuth grant.
const directory = resolve(process.argv[2] ?? 'dist');
await readFile(resolve(directory, 'sw.js'));
const contentTypes = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf'
};

const server = createServer(async (request, response) => {
  try {
    const { pathname } = new URL(request.url, 'http://localhost');
    response.setHeader('Cache-Control', 'no-store');
    if (pathname === '/pwa-test-bootstrap') {
      response.setHeader('Content-Type', 'text/html');
      response.end('<!doctype html><title>PWA routing check</title>');
      return;
    }
    if (pathname.startsWith('/__clerk/oauth/')) {
      response.setHeader('Content-Type', 'text/plain');
      response.end('OAuth request reached the server');
      return;
    }
    if (pathname.startsWith('/.well-known/')) {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ discovery: 'server' }));
      return;
    }
    let file = resolve(directory, '.' + decodeURIComponent(pathname));
    if (!file.startsWith(directory + sep)) {
      response.writeHead(403).end();
      return;
    }
    let body;
    try {
      body = await readFile(file);
    } catch {
      file = resolve(directory, 'index.html');
      body = await readFile(file);
    }
    response.setHeader('Content-Type', contentTypes[extname(file)] ?? 'application/octet-stream');
    response.end(body);
  } catch {
    response.writeHead(500).end();
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(origin + '/pwa-test-bootstrap');
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));

  for (const path of [
    '/__clerk/oauth/authorize?response_type=code&state=synthetic',
    '/__clerk/oauth/authorize/continue?state=synthetic'
  ]) {
    const response = await page.goto(origin + path);
    assert.equal(response.fromServiceWorker(), false, `${path} must reach the OAuth server`);
    assert.equal(await response.text(), 'OAuth request reached the server');
    console.log(`PASS: ${path.split('?')[0]} reaches the server`);
  }
  const discovery = await page.goto(origin + '/.well-known/oauth-authorization-server');
  assert.equal(discovery.fromServiceWorker(), false, 'discovery must reach the server');
  assert.deepEqual(await discovery.json(), { discovery: 'server' });
  console.log('PASS: OAuth discovery reaches the server');

  for (const path of ['/auth?redirect_url=synthetic', '/oauth-consent?authorization_request_id=synthetic']) {
    const response = await page.goto(origin + path);
    assert.equal(response.fromServiceWorker(), true, `${path} should retain the app fallback`);
    assert.ok((await response.text()).includes('id="root"'));
    assert.equal(page.url(), origin + path, 'the app must retain the OAuth query');
    console.log(`PASS: ${path.split('?')[0]} retains the app fallback and query`);
  }
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
