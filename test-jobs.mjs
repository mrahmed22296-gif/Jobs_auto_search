import assert from 'node:assert/strict';
import fs from 'node:fs';
const code = fs.readFileSync(new URL('./api/jobs.js', import.meta.url), 'utf8');
const mod = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const handler = mod.default;
mod.__resetJobsCacheForTests();

// No provider may be contacted while the source registry is empty.
let fetchCalls = 0;
globalThis.fetch = async () => { fetchCalls++; throw new Error('No source is registered; the route must not fetch provider data'); };

const response = () => ({ headers: {}, setHeader(key, value) { this.headers[key] = value; return this; }, status(code) { this.code = code; return this; }, json(data) { this.body = data; return this; } });
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log('PASS', name); };

let r = response();
await handler({ method: 'GET' }, r);
test('route returns explicit not-connected state while no source is verified', () => { assert.equal(r.code, 200); assert.equal(r.body.status, 'not_connected'); });
test('no fabricated jobs or invented sources', () => { assert.deepEqual(r.body.jobs, []); assert.deepEqual(r.body.sources, []); });
test('requested market scope is Kuwait and Egypt only', () => { assert.deepEqual(r.body.requestedMarkets, ['KW', 'EG']); });
test('no coverage is claimed for any market', () => { assert.deepEqual(r.body.connectedMarkets, []); assert.equal(r.body.stale, false); });
test('Arabic message states this is not a search result', () => { assert.match(r.body.message, /لم يُربط مصدر/); assert.match(r.body.message, /ليست نتيجة بحث/); });
test('no provider fetch attempted with an empty registry', () => assert.equal(fetchCalls, 0));
test('not-connected response is not cached as a job result', async () => {
  mod.__resetJobsCacheForTests();
  const a = response(); await handler({ method: 'GET' }, a);
  const b = response(); await handler({ method: 'GET' }, b);
  assert.equal(b.body.status, 'not_connected');
});

r = response();
await handler({ method: 'POST' }, r);
test('mutating method rejected', () => { assert.equal(r.code, 405); assert.equal(r.headers.Allow, 'GET'); });

const { cleanText, sourceUrl, toIsoDate } = mod.__testInternals;
test('cleanText trims, collapses whitespace and caps length', () => { assert.equal(cleanText('  مهندس   مدني \n', 40), 'مهندس مدني'); assert.equal(cleanText('abcdef', 3), 'abc'); assert.equal(cleanText(null, 5), ''); });
test('sourceUrl accepts only plain https on allowed hosts', () => {
  assert.equal(sourceUrl('https://www.myself.ae/jobs/1', ['myself.ae']), 'https://www.myself.ae/jobs/1');
  assert.equal(sourceUrl('http://www.myself.ae/jobs/1', ['myself.ae']), null);
  assert.equal(sourceUrl('https://evil.com/?next=myself.ae', ['myself.ae']), null);
  assert.equal(sourceUrl('https://user:pass@myself.ae/jobs/1', ['myself.ae']), null);
  assert.equal(sourceUrl('https://myself.ae.evil.com/jobs/1', ['myself.ae']), null);
  assert.equal(sourceUrl('not a url', ['myself.ae']), null);
});
test('toIsoDate keeps real dates and rejects garbage', () => { assert.ok(toIsoDate('2026-11-21').startsWith('2026-11-21')); assert.equal(toIsoDate('nonsense'), null); });
console.log('JOBS ROUTE TESTS', passed);
