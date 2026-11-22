/**
 * Job listings from connected external sources. Current scope: Kuwait and Egypt only.
 * A source is connected only after its reuse terms and data correctness are
 * verified live. Qualified candidates that still need an owner decision
 * (registration, written permission, or partnership) are tracked outside the
 * code; until one is approved and verified, no key is configured and the API
 * reports an honest not_connected state. No listing is ever fabricated.
 *
 * Prepared adapter: Jooble (kw.jooble.org / eg.jooble.org REST API). It stays
 * inert until the owner's approved keys are provided as JOOBLE_API_KEY_KW and
 * JOOBLE_API_KEY_EG. Per Jooble's docs each country key is separate, and the
 * free plan allows 100 requests/day/key (30-minute cache keeps Masar well
 * under that). Gated-site republication terms remain an owner decision before
 * any key is used in production.
 */

const REQUESTED_MARKETS = Object.freeze(["KW", "EG"]);
const CACHE_TTL_MS = 30 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;
const MAX_JOBS_PER_SOURCE = 200;

function cleanText(value, max) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function sourceUrl(value, allowedHosts) {
  try {
    const parsed = new URL(String(value || ""));
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
    if (parsed.port && parsed.port !== "443") return null;
    const host = parsed.hostname.toLowerCase();
    if (!allowedHosts.some((allowed) => host === allowed || host.endsWith("." + allowed))) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function toIsoDate(value) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

// Jooble REST API adapter, prepared for the owner-approved keys. One key per
// country per Jooble's docs: https://help.jooble.org/en/support/solutions/articles/60001448238
const JOOBLE_MARKETS = Object.freeze([
  Object.freeze({ market: "KW", envKey: "JOOBLE_API_KEY_KW", host: "kw.jooble.org", location: "Kuwait" }),
  Object.freeze({ market: "EG", envKey: "JOOBLE_API_KEY_EG", host: "eg.jooble.org", location: "Egypt" }),
]);

// Jooble is an aggregator: each row links to the original posting on the
// poster's own domain, so no fixed allowed-hosts list applies. The link is
// still held to plain https on a real hostname, and every row carries its
// source id so attribution is preserved.
function listingUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
    if (parsed.port && parsed.port !== "443") return null;
    if (!parsed.hostname || /^\d{1,3}(\.\d{1,3}){3}$/.test(parsed.hostname)) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function mapJoobleJobs(payload, market) {
  const rows = Array.isArray(payload && payload.jobs) ? payload.jobs : [];
  const out = [];
  for (const raw of rows) {
    const url = listingUrl(raw && raw.link);
    const title = cleanText(raw && raw.title, 140);
    if (!url || !title) continue; // never emit a row without a verifiable original link
    out.push({
      title,
      company: cleanText(raw.company, 120) || null,
      location: cleanText(raw.location, 120) || null,
      postedAt: toIsoDate(raw.updated),
      url,
      snippet: cleanText(raw.snippet, 400) || null,
      salary: cleanText(raw.salary, 80) || null,
      source: "jooble",
      market,
    });
  }
  return out;
}

function joobleSource({ market, envKey, host, location }) {
  return {
    id: `jooble-${market.toLowerCase()}`,
    name: market === "KW" ? "Jooble Kuwait" : "Jooble Egypt",
    url: `https://${host}/api/about`,
    markets: [market],
    async load() {
      const key = String(process.env[envKey] || "").trim();
      if (!key) throw new Error(`${envKey} not configured`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      try {
        // Broad market listing: empty keywords with a country location. If
        // Jooble rejects empty keywords, set a default query per market when
        // the keys are configured.
        const response = await fetch(`https://${host}/api/${encodeURIComponent(key)}`, {
          method: "POST",
          signal: controller.signal,
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ keywords: "", location, page: "1", companysearch: "false" }),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return mapJoobleJobs(await response.json(), market);
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

// Verified, permitted sources for Kuwait or Egypt register here. Each adapter
// must only emit rows it can attribute to the requested market, with an
// original listing link. A source is active only once its approved key is
// configured; with no keys the registry is empty and the API reports
// not_connected.
function buildSources(env) {
  const sources = [];
  for (const config of JOOBLE_MARKETS) {
    if (typeof env[config.envKey] === "string" && env[config.envKey].trim()) sources.push(joobleSource(config));
  }
  return sources;
}

let cache = null; // { at, payload }
let lastGood = null; // last payload that had at least one healthy source

export function __resetJobsCacheForTests() {
  cache = null;
  lastGood = null;
}
export function __expireJobsCacheForTests() {
  if (cache) cache.at = 0;
}
export const __testInternals = { cleanText, sourceUrl, toIsoDate, listingUrl, mapJoobleJobs, buildSources, JOOBLE_MARKETS, REQUESTED_MARKETS };

async function buildPayload() {
  const jobs = [];
  const sources = [];
  for (const source of buildSources(process.env)) {
    try {
      const sourceJobs = (await source.load()).slice(0, MAX_JOBS_PER_SOURCE);
      sources.push({ id: source.id, name: source.name, url: source.url, markets: source.markets, status: "ok", jobCount: sourceJobs.length });
      jobs.push(...sourceJobs);
    } catch {
      sources.push({ id: source.id, name: source.name, url: source.url, markets: source.markets, status: "error", jobCount: 0 });
    }
  }
  const healthy = sources.filter((source) => source.status === "ok");
  const connectedMarkets = [...new Set(healthy.flatMap((source) => source.markets))];
  const status = sources.length === 0 || healthy.length === 0 ? "not_connected" : healthy.length === sources.length ? "connected" : "partial";
  let message;
  if (healthy.length > 0) {
    message = "الإعلانات المعروضة من مصادر خارجية مربوطة؛ كل إعلان يقود إلى نشره الأصلي، وتاريخ النشر كما يورده المصدر.";
  } else if (sources.length > 0) {
    message = "تعذّر جلب الإعلانات من المصادر المربوطة حالياً. هذه ليست نتيجة بحث عن الوظائف المتاحة، ولن نعرض إعلانات تجريبية كفرص حقيقية.";
  } else {
    message = "لم يُربط مصدر وظائف خارجي بعد للكويت أو مصر. هذه ليست نتيجة بحث عن الوظائف المتاحة، ولن نعرض إعلانات تجريبية كفرص حقيقية.";
  }
  return {
    status,
    jobs,
    sources,
    requestedMarkets: [...REQUESTED_MARKETS],
    connectedMarkets,
    generatedAt: new Date().toISOString(),
    stale: false,
    message,
  };
}

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return res.status(200).json(cache.payload);
  const payload = await buildPayload();
  if (payload.status === "not_connected" && lastGood) {
    // Every source failed this round: serve the last verified snapshot, marked stale.
    return res.status(200).json({ ...lastGood, stale: true });
  }
  cache = { at: now, payload };
  if (payload.status !== "not_connected") lastGood = payload;
  return res.status(200).json(payload);
}
