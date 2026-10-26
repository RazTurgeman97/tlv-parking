// Cloudflare Worker: live free spaces for Central Park lots in Tel Aviv-Yafo.
// Returns {updated, lots: {<lotId>: {free, price}}} with CORS, cached for 2 minutes.
const SOURCE = "https://centralpark.co.il/he/parking?selectedCity=1386";
const TTL = 120;

function extractLots(html) {
  // The page streams its data in self.__next_f.push([1,"..."]) chunks; join them and find "parkingLots":[...]
  let s = "";
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g)) s += JSON.parse('"' + m[1] + '"');
  const k = s.indexOf('"parkingLots":[');
  if (k < 0) throw new Error("parkingLots not found");
  let i = k + 14, d = 0, j = i, str = false, esc = false;
  for (; j < s.length; j++) {
    const c = s[j];
    if (str) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') str = false; continue; }
    if (c === '"') str = true; else if (c === "[") d++; else if (c === "]") { d--; if (!d) break; }
  }
  return JSON.parse(s.slice(i, j + 1));
}

export default {
  async fetch(req, env, ctx) {
    const cors = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json; charset=utf-8", "Cache-Control": `public, max-age=${TTL}` };
    const cache = caches.default, key = new Request(new URL("/live", req.url));
    const hit = await cache.match(key);
    if (hit) return hit;
    try {
      const r = await fetch(SOURCE, { headers: { "User-Agent": "Mozilla/5.0 (personal parking map)", "Accept-Language": "he" } });
      const lots = extractLots(await r.text());
      const out = { updated: new Date().toISOString(), lots: {} };
      for (const l of lots) if (l.cityDto?.id === 1386) out.lots[l.id] = { free: l.freeParkingNumber, price: l.currentPrice };
      const res = new Response(JSON.stringify(out), { headers: cors });
      ctx.waitUntil(cache.put(key, res.clone()));
      return res;
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), { status: 502, headers: { ...cors, "Cache-Control": "no-store" } });
    }
  }
};
