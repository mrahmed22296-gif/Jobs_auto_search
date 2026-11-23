/**
 * Job listings from connected external sources. Current scope: Kuwait and Egypt only.
 * A source is connected only after its reuse terms and data correctness are
 * verified live. Qualified candidates that still need an owner decision
 * (registration, written permission, or partnership) are tracked outside the
 * code; until one is approved and verified, SOURCES stays empty and the API
 * reports an honest not_connected state. No listing is ever fabricated.
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

// Verified, permitted sources for Kuwait or Egypt are added here. Each adapter
// must only emit rows it can attribute to the requested market, with an
// original listing URL on the source's own domain.
const SOURCES = [];

let cache = null; // { at, payload }
let lastGood = null; // last payload that had at least one healthy source

export function __resetJobsCacheForTests() {
  cache = null;
  lastGood = null;
}
export function __expireJobsCacheForTests() {
  if (cache) cache.at = 0;
}
export const __testInternals = { cleanText, sourceUrl, toIsoDate, REQUESTED_MARKETS };

async function buildPayload() {
  const jobs = [];
  const sources = [];
  for (const source of SOURCES) {
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
  return {
    status,
    jobs,
    sources,
    requestedMarkets: [...REQUESTED_MARKETS],
    connectedMarkets,
    generatedAt: new Date().toISOString(),
    stale: false,
    message:
      "لم يُربط مصدر وظائف خارجي بعد للكويت أو مصر. هذه ليست نتيجة بحث عن الوظائف المتاحة، ولن نعرض إعلانات تجريبية كفرص حقيقية.",
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
