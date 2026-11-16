import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { webcrypto } from 'node:crypto';

const builderURL = new URL('../scripts/build-offline.mjs', import.meta.url);
const ORIGIN = 'https://knit.example/';
const HTML = '<!doctype html><meta name="knit-studio-app" content="offline-v1"><div id="app"></div><script type="module" src="./app.js"></script>';

async function fixture(t) {
  assert.ok(existsSync(builderURL), 'offline asset generator must be implemented');
  const { buildOffline } = await import(builderURL.href);
  const directory = await mkdtemp(path.join(tmpdir(), 'knit-offline-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const distDir = path.join(directory, 'dist');
  await mkdir(path.join(distDir, 'core'), { recursive: true });
  const bodies = new Map([
    ['index.html', HTML], ['app.js', 'import { value } from "./core/example.js"; console.log(value);'],
    ['core/example.js', 'export const value = "saved locally";'], ['styles.css', 'body { color: #333; }'],
    ['manifest.webmanifest', '{"name":"织间","start_url":"./"}'],
  ]);
  for (const [name, body] of bodies) await writeFile(path.join(distDir, name), body);
  const build = await buildOffline({ distDir });
  return { build, buildOffline, distDir, bodies };
}

function platform(build, bodies) {
  const listeners = new Map();
  const stores = new Map();
  const requests = [];
  let online = true;
  let interceptor;
  let claims = 0;
  let skips = 0;
  const keyOf = request => new URL(typeof request === 'string' ? request : request.url, ORIGIN).href;
  const caches = {
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        async match(request) { return entries.get(keyOf(request))?.clone(); },
        async put(request, response) { entries.set(keyOf(request), response.clone()); },
        async delete(request) { return entries.delete(keyOf(request)); },
        async keys() { return [...entries.keys()].map(url => new Request(url)); },
      };
    },
  };
  const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json' };
  const fetch = async (request, options) => {
    const url = keyOf(request);
    requests.push({ url, options });
    if (!online) throw new TypeError('Network disconnected');
    const override = await interceptor?.(url);
    if (override) return override;
    const name = new URL(url).pathname.slice(1) || 'index.html';
    return new Response(bodies.get(name) ?? 'Missing', { status: bodies.has(name) ? 200 : 404, headers: { 'Content-Type': mime[path.extname(name)] ?? 'application/octet-stream' } });
  };
  const self = {
    location: new URL('sw.js', ORIGIN),
    registration: { scope: ORIGIN },
    clients: { async claim() { claims++; } },
    async skipWaiting() { skips++; },
    addEventListener(type, listener) { listeners.set(type, listener); },
  };
  vm.runInNewContext(build.source, { self, caches, fetch, URL, Request, Response, Headers, crypto: webcrypto, TextEncoder, Uint8Array, console });
  return {
    caches, stores, requests,
    get claims() { return claims; }, get skips() { return skips; },
    setOnline(value) { online = value; },
    setInterceptor(value) { interceptor = value; },
    async lifecycle(type) {
      const jobs = [];
      assert.ok(listeners.has(type), `${type} handler is registered`);
      listeners.get(type)({ waitUntil(job) { jobs.push(job); } });
      assert.ok(jobs.length, `${type} extends its lifetime`);
      await Promise.all(jobs);
    },
    async request(url, options = {}) {
      let result;
      const jobs = [];
      listeners.get('fetch')({ request: new Request(url, options), respondWith(value) { result = Promise.resolve(value); }, waitUntil(job) { jobs.push(job); } });
      const response = result ? await result : undefined;
      await Promise.all(jobs);
      return response;
    },
    async status(type = 'KNIT_OFFLINE_STATUS') {
      const jobs = [], replies = [];
      listeners.get('message')({ data: { type }, ports: [{ postMessage(value) { replies.push(value); } }], waitUntil(job) { jobs.push(job); } });
      await Promise.all(jobs);
      return replies[0];
    },
  };
}

test('offline build includes nested assets and uses content, not old generated worker, as its release identity', async t => {
  const f = await fixture(t);
  const source = await readFile(path.join(f.distDir, 'sw.js'), 'utf8');
  assert.equal(source, f.build.source);
  assert.equal(f.build.assets.length, f.bodies.size);
  assert.ok(f.build.assets.some(asset => asset.path === 'core/example.js'));
  assert.ok(f.build.assets.every(asset => /^[a-f0-9]{64}$/.test(asset.sha256)));
  assert.ok(!f.build.assets.some(asset => asset.path === 'sw.js'));
  await writeFile(path.join(f.distDir, 'sw.js'), 'stale generated file');
  const identical = await f.buildOffline({ distDir: f.distDir });
  assert.equal(identical.version, f.build.version);
  await writeFile(path.join(f.distDir, 'core', 'example.js'), 'export const value = "updated";');
  assert.notEqual((await f.buildOffline({ distDir: f.distDir })).version, f.build.version);
});

test('complete installation supports an offline root, index, stylesheet and nested module without network', async t => {
  const f = await fixture(t), browser = platform(f.build, f.bodies);
  await browser.lifecycle('install');
  const installedRequests = browser.requests.length;
  browser.setOnline(false);
  for (const name of ['', 'index.html', 'styles.css', 'core/example.js']) {
    assert.equal(await (await browser.request(ORIGIN + name)).text(), f.bodies.get(name || 'index.html'));
  }
  assert.equal(browser.requests.length, installedRequests);
  assert.equal(browser.skips, 0, 'updates must wait instead of forcing replacement');
});

test('a missing asset fails installation, removes the incomplete release and preserves a previous complete cache', async t => {
  const f = await fixture(t), browser = platform(f.build, f.bodies);
  const old = await browser.caches.open('knit-studio-shell-old');
  await old.put(ORIGIN + 'index.html', new Response('previous release'));
  browser.setInterceptor(url => url.endsWith('core/example.js') ? new Response('Not found', { status: 404 }) : undefined);
  await assert.rejects(browser.lifecycle('install'));
  assert.deepEqual(await browser.caches.keys(), ['knit-studio-shell-old']);
  assert.equal(await (await old.match(ORIGIN + 'index.html')).text(), 'previous release');
});

test('activation cleans only obsolete shell caches and claims clients after complete installation', async t => {
  const f = await fixture(t), browser = platform(f.build, f.bodies);
  await browser.caches.open('knit-studio-shell-old');
  const unrelated = await browser.caches.open('other-site-cache');
  await unrelated.put(ORIGIN + 'other', new Response('keep this'));
  await browser.lifecycle('install');
  await browser.lifecycle('activate');
  assert.equal(browser.claims, 1);
  assert.equal(browser.skips, 0);
  assert.ok(!(await browser.caches.keys()).includes('knit-studio-shell-old'));
  assert.equal(await (await unrelated.match(ORIGIN + 'other')).text(), 'keep this');
});

test('auth routes, queries, unknown paths, foreign origins and non-GET requests are not intercepted', async t => {
  const f = await fixture(t), browser = platform(f.build, f.bodies);
  await browser.lifecycle('install');
  const before = browser.requests.length;
  for (const [url, options] of [
    [ORIGIN + 'login'], [ORIGIN + '?code=secret'], [ORIGIN + 'app.js?v=1'],
    [ORIGIN + 'api/workspace'], ['https://other.example/app.js'], [ORIGIN + 'app.js', { method: 'POST', body: 'no' }],
  ]) assert.equal(await browser.request(url, options), undefined);
  assert.equal(browser.requests.length, before);
});

test('a redirected login response cannot become an offline page', async t => {
  const f = await fixture(t), browser = platform(f.build, f.bodies);
  browser.setInterceptor(url => {
    if (!url.endsWith('index.html')) return;
    const response = new Response(HTML, { headers: { 'Content-Type': 'text/html' } });
    Object.defineProperty(response, 'redirected', { value: true });
    return response;
  });
  await assert.rejects(browser.lifecycle('install'));
  assert.equal((await browser.caches.keys()).length, 0);
});

test('a sign-in page with a successful HTML response cannot pass the app marker check', async t => {
  const f = await fixture(t), browser = platform(f.build, f.bodies);
  browser.setInterceptor(url => url.endsWith('index.html') ? new Response('<!doctype html><h1>Sign in</h1>', { headers: { 'Content-Type': 'text/html' } }) : undefined);
  await assert.rejects(browser.lifecycle('install'));
  assert.equal((await browser.caches.keys()).length, 0);
});

test('incorrect JavaScript MIME is rejected instead of caching a login document', async t => {
  const f = await fixture(t), browser = platform(f.build, f.bodies);
  browser.setInterceptor(url => url.endsWith('app.js') ? new Response(f.bodies.get('app.js'), { headers: { 'Content-Type': 'text/html' } }) : undefined);
  await assert.rejects(browser.lifecycle('install'));
});

test('release content hashes reject stale or mixed JavaScript even when the MIME is correct', async t => {
  const f = await fixture(t), browser = platform(f.build, f.bodies);
  browser.setInterceptor(url => url.endsWith('app.js') ? new Response('console.log("different release")', { headers: { 'Content-Type': 'text/javascript' } }) : undefined);
  await assert.rejects(browser.lifecycle('install'));
});

test('readiness verifies all required entries and reports incomplete storage without throwing', async t => {
  const f = await fixture(t), browser = platform(f.build, f.bodies);
  assert.equal((await browser.status()).ready, false);
  await browser.lifecycle('install');
  const ready = await browser.status();
  assert.equal(ready.type, 'KNIT_OFFLINE_STATUS');
  assert.equal(ready.ready, true);
  assert.equal(ready.version, f.build.version);
  assert.equal(ready.assetCount, f.bodies.size);
  const cacheName = (await browser.caches.keys()).find(name => name.startsWith('knit-studio-shell-'));
  await (await browser.caches.open(cacheName)).delete(ORIGIN + 'core/example.js');
  assert.equal((await browser.status()).ready, false);
  assert.equal(await browser.status('IGNORE_THIS'), undefined);
  browser.caches.open = async () => { throw new Error('Storage unavailable'); };
  assert.equal((await browser.status()).ready, false);
});

test('prepare repairs missing entries and skips network work when the cache is already complete', async t => {
  const f = await fixture(t), browser = platform(f.build, f.bodies);
  await browser.lifecycle('install');
  const cacheName = (await browser.caches.keys()).find(name => name.startsWith('knit-studio-shell-'));
  await (await browser.caches.open(cacheName)).delete(ORIGIN + 'core/example.js');
  const before = browser.requests.length;
  const repaired = await browser.status('KNIT_OFFLINE_PREPARE');
  assert.equal(repaired.type, 'KNIT_OFFLINE_STATUS');
  assert.equal(repaired.ready, true);
  assert.equal(browser.requests.length - before, 1);
  assert.equal(browser.requests.at(-1).url, ORIGIN + 'core/example.js');
  assert.equal((await browser.status('KNIT_OFFLINE_PREPARE')).ready, true);
  assert.equal(browser.requests.length - before, 1);
});

test('failed repair reports not ready while retaining usable current entries and other releases', async t => {
  const f = await fixture(t), browser = platform(f.build, f.bodies);
  await browser.lifecycle('install');
  const cacheName = (await browser.caches.keys()).find(name => name.startsWith('knit-studio-shell-'));
  const current = await browser.caches.open(cacheName);
  await current.delete(ORIGIN + 'core/example.js');
  await browser.caches.open('knit-studio-shell-old');
  browser.setOnline(false);
  assert.equal((await browser.status('KNIT_OFFLINE_PREPARE')).ready, false);
  assert.equal(await (await current.match(ORIGIN + 'index.html')).text(), HTML);
  assert.ok((await browser.caches.keys()).includes('knit-studio-shell-old'));
  assert.ok((await browser.caches.keys()).includes(cacheName));
});
