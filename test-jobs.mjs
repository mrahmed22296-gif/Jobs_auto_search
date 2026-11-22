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
mod.__resetJobsCacheForTests();
const cacheA = response(); await handler({ method: 'GET' }, cacheA);
const cacheB = response(); await handler({ method: 'GET' }, cacheB);
test('not-connected response is not cached as a job result', () => assert.equal(cacheB.body.status, 'not_connected'));

r = response();
await handler({ method: 'POST' }, r);
test('mutating method rejected', () => { assert.equal(r.code, 405); assert.equal(r.headers.Allow, 'GET'); });

const { cleanText, sourceUrl, toIsoDate, listingUrl, mapJoobleJobs, buildSources } = mod.__testInternals;

// --- Jooble adapter prep (env-gated; no key is configured in tests) ---
test('registry stays empty without approved keys', () => {
  assert.deepEqual(buildSources({}), []);
  assert.deepEqual(buildSources({ JOOBLE_API_KEY_KW: '   ' }), []);
});
test('configured key registers one source per country key', () => {
  const kw = buildSources({ JOOBLE_API_KEY_KW: 'k1' });
  assert.equal(kw.length, 1); assert.equal(kw[0].id, 'jooble-kw'); assert.deepEqual(kw[0].markets, ['KW']);
  assert.equal(kw[0].url, 'https://kw.jooble.org/api/about');
  const both = buildSources({ JOOBLE_API_KEY_KW: 'k1', JOOBLE_API_KEY_EG: 'k2' });
  assert.deepEqual(both.map(s => s.id), ['jooble-kw', 'jooble-eg']);
  assert.deepEqual(both.map(s => s.markets[0]), ['KW', 'EG']);
});
test('listingUrl accepts plain https host links only', () => {
  assert.equal(listingUrl('https://www.bayt.com/en/kuwait/jobs/x-1/'), 'https://www.bayt.com/en/kuwait/jobs/x-1/');
  assert.equal(listingUrl('http://www.bayt.com/jobs/1'), null);
  assert.equal(listingUrl('https://user:pass@bayt.com/jobs/1'), null);
  assert.equal(listingUrl('https://10.0.0.4/internal'), null);
  assert.equal(listingUrl('javascript:alert(1)'), null);
  assert.equal(listingUrl(''), null);
});
test('mapJoobleJobs maps verifiable rows and drops the rest', () => {
  const fixture = { jobs: [
    { title: '  محاسب أول  ', company: 'شركة الكويت', location: 'مدينة الكويت', updated: '2026-11-20', link: 'https://employer.example/jobs/77', snippet: '  خبرة ٥ سنوات  ', salary: '800 KWD' },
    { title: 'بدون رابط', company: 'x', link: '' },
    { title: 'رابط غير آمن', link: 'http://employer.example/jobs/78' },
    { company: 'بدون عنوان', link: 'https://employer.example/jobs/79' },
    { title: 'Civil Engineer', link: 'https://employer.example/jobs/80', updated: 'nonsense' },
  ] };
  const rows = mapJoobleJobs(fixture, 'KW');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].title, 'محاسب أول');
  assert.equal(rows[0].company, 'شركة الكويت');
  assert.equal(rows[0].snippet, 'خبرة ٥ سنوات');
  assert.equal(rows[0].salary, '800 KWD');
  assert.equal(rows[0].source, 'jooble');
  assert.equal(rows[0].market, 'KW');
  assert.ok(rows[0].postedAt.startsWith('2026-11-20'));
  assert.equal(rows[1].postedAt, null);
  assert.equal(rows[1].company, null);
  assert.deepEqual(mapJoobleJobs({}, 'EG'), []);
  assert.deepEqual(mapJoobleJobs(null, 'EG'), []);
});
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

// Full connected path: a configured key plus a stubbed provider response.
process.env.JOOBLE_API_KEY_KW = 'fixture-key';
mod.__resetJobsCacheForTests();
globalThis.fetch = async (url, options) => {
  assert.equal(url, 'https://kw.jooble.org/api/fixture-key');
  assert.equal(options.method, 'POST');
  return { ok: true, json: async () => ({ jobs: [{ title: 'مهندس مدني', company: 'شركة', link: 'https://employer.example/jobs/1', updated: '2026-11-21' }] }) };
};
r = response();
await handler({ method: 'GET' }, r);
test('configured key produces connected payload with real rows', () => {
  assert.equal(r.body.status, 'connected');
  assert.deepEqual(r.body.connectedMarkets, ['KW']);
  assert.deepEqual(r.body.requestedMarkets, ['KW', 'EG']);
  assert.equal(r.body.jobs.length, 1);
  assert.equal(r.body.jobs[0].url, 'https://employer.example/jobs/1');
  assert.equal(r.body.sources[0].id, 'jooble-kw');
  assert.equal(r.body.sources[0].status, 'ok');
  assert.match(r.body.message, /مصادر خارجية مربوطة/);
});
globalThis.fetch = async () => ({ ok: false, status: 403 });
mod.__expireJobsCacheForTests();
const fail = response();
await handler({ method: 'GET' }, fail);
// Stale fallback serves the last verified snapshot, marked stale; nothing new is invented.
test('failing configured source degrades honestly, never fabricates', () => {
  assert.equal(fail.body.stale, true);
  assert.equal(fail.body.jobs.length, 1);
  assert.equal(fail.body.jobs[0].url, 'https://employer.example/jobs/1');
});
delete process.env.JOOBLE_API_KEY_KW;
mod.__resetJobsCacheForTests();
globalThis.fetch = async () => { throw new Error('must not fetch'); };
console.log('JOBS ROUTE TESTS', passed);
