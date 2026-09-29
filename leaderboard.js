// Vercel serverless function. Needs a Redis database (Upstash) connected in the Vercel dashboard.
const U = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const T = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const r = async c => {
  const x = await fetch(U, { method: 'POST', headers: { Authorization: 'Bearer ' + T }, body: JSON.stringify(c) });
  return (await x.json()).result;
};
const MAX_SPEED = 13; // units per second, slightly above the game's cap

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!U || !T) return res.status(503).json({ error: 'Redis not configured' });
  try {
    if (req.method === 'POST') {
      const { label, pub, distance, seconds } = req.body || {};
      const d = Math.floor(+distance), s = +seconds;
      // Reject impossible runs: you cannot travel farther than max speed allows.
      if (!pub || !(d > 0) || !(s > 0) || s > 3600 || d > MAX_SPEED * s + 20)
        return res.status(400).json({ error: 'invalid run' });
      await r(['ZADD', 'lb', 'GT', d, String(pub)]);
      await r(['HSET', 'names', String(pub), String(label || '').slice(0, 24)]);
      return res.json({ ok: 1 });
    }
    const z = (await r(['ZREVRANGE', 'lb', 0, 19, 'WITHSCORES'])) || [];
    const rows = [];
    for (let i = 0; i < z.length; i += 2) rows.push({ pub: z[i], distance: +z[i + 1] });
    const names = rows.length ? await r(['HMGET', 'names', ...rows.map(x => x.pub)]) : [];
    res.json(rows.map((x, i) => ({ label: names[i] || x.pub.slice(0, 8), pub: x.pub, distance: x.distance })));
  } catch (e) {
    res.status(500).json({ error: 'failed' });
  }
};
