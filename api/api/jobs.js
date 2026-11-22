/** Readiness contract only. External source integration is intentionally deferred. */
export default function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({error: 'Method not allowed'});
  }
  return res.status(200).json({
    status: 'not_connected', jobs: [], sources: [],
    requestedMarkets: ['KW', 'SA', 'AE', 'QA', 'BH', 'OM'],
    message: 'لم يتم ربط مصادر وظائف خارجية بعد. هذه ليست نتيجة بحث عن الوظائف المتاحة.',
  });
}
