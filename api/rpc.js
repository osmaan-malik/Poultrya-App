// Single serverless endpoint. The Supabase service key never reaches the browser.
const crypto = require("crypto");
const { SUPABASE_SERVICE_KEY: K, APP_PIN, SESSION_SECRET: SEC } = process.env;
const U = (process.env.SUPABASE_URL || "").trim().replace(/\/rest\/v1\/?$/, "").replace(/\/+$/, "");

const sign = (t) => crypto.createHmac("sha256", SEC).update(String(t)).digest("hex");
const enc = encodeURIComponent;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const tries = {}; // best-effort brute-force limiter (per warm instance)

function validCookie(c) {
  const m = /(?:^|; )ma=([^;]+)/.exec(c || "");
  if (!m) return false;
  const [e, s] = m[1].split(".");
  if (!e || !s || Date.now() > +e) return false;
  const a = Buffer.from(sign(e)), b = Buffer.from(s);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function sb(path, opt = {}) {
  const r = await fetch(U + "/rest/v1/" + path, {
    ...opt,
    headers: { apikey: K, Authorization: "Bearer " + K, "Content-Type": "application/json", Prefer: "return=representation", ...(opt.headers || {}) },
  });
  const t = await r.text();
  if (!r.ok) throw new Error(t);
  return t ? JSON.parse(t) : null;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).end();
  if (!U || !K || !APP_PIN || !SEC) return res.status(500).json({ error: "Server env vars missing" });
  const b = req.body || {};
  try {
    if (b.action === "login") {
      const ip = req.headers["x-forwarded-for"] || "x";
      const t = tries[ip] || { n: 0, until: 0 };
      if (Date.now() < t.until) return res.status(429).json({ error: "wait" });
      const ok = crypto.timingSafeEqual(Buffer.from(sign(String(b.pin))), Buffer.from(sign(APP_PIN)));
      if (!ok) {
        t.n++; if (t.n >= 5) { t.until = Date.now() + 60000; t.n = 0; }
        tries[ip] = t;
        await new Promise((r) => setTimeout(r, 600));
        return res.status(401).json({ error: "pin" });
      }
      tries[ip] = { n: 0, until: 0 };
      const exp = Date.now() + 30 * 864e5;
      res.setHeader("Set-Cookie", `ma=${exp}.${sign(exp)}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=2592000`);
      return res.json({ ok: true });
    }
    if (b.action === "logout") {
      res.setHeader("Set-Cookie", "ma=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0");
      return res.json({ ok: true });
    }
    if (!validCookie(req.headers.cookie)) return res.status(401).json({ error: "auth" });

    switch (b.action) {
      case "shops":
        return res.json(await sb("shop_balances?select=*&order=name.asc"));
      case "addShop": {
        if (!String(b.name || "").trim() || !UUID.test(b.id || "")) return res.status(400).json({ error: "invalid" });
        // client-generated id + ignore-duplicates => safe to retry after offline sync
        await sb("shops?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates" }, body: JSON.stringify({ id: b.id, name: b.name.trim(), phone: b.phone || null, opening: +b.opening || 0 }) });
        return res.json({ ok: true });
      }
      case "updateShop":
        await sb("shops?id=eq." + enc(b.id), { method: "PATCH", body: JSON.stringify({ name: String(b.name).trim(), phone: b.phone || null }) });
        return res.json({ ok: true });
      case "delShop":
        await sb("shops?id=eq." + enc(b.id), { method: "DELETE" });
        return res.json({ ok: true });
      case "bills": {
        let q = "bills?select=*&order=no.desc&limit=500";
        if (b.date) q += "&date=eq." + enc(b.date);
        if (b.shop) q += "&shop_id=eq." + enc(b.shop);
        if (b.no) q += "&no=eq." + enc(b.no);
        return res.json(await sb(q));
      }
      case "addBill": {
        const wt = +b.weight || 0, rt = +b.rate || 0, rc = +b.recv || 0, prev = +b.prev || 0;
        if (!UUID.test(b.id || "") || !UUID.test(b.shop_id || "") || !/^MA\d{6}-[A-Z]{2}\d{3,}$/.test(b.no || "") ||
            !/^\d{4}-\d{2}-\d{2}$/.test(b.date || "") || (!wt && !rc) || wt < 0 || rt < 0 || rc < 0)
          return res.status(400).json({ error: "invalid" });
        const amount = wt * rt;
        // bill id + number come from the device (works offline); duplicate ids are ignored so retries are safe
        await sb("bills?on_conflict=id", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates" }, body: JSON.stringify({ id: b.id, no: b.no, date: b.date, shop_id: b.shop_id, weight: wt, rate: rt, amount, prev, recv: rc, balance: prev + amount - rc }) });
        return res.json({ ok: true });
      }
      case "delBill":
        await sb("bills?id=eq." + enc(b.id), { method: "DELETE" });
        return res.json({ ok: true });
      default:
        return res.status(400).json({ error: "action" });
    }
  } catch (e) {
    const m = String(e.message || e);
    const code = m.includes('"23505"') ? 409 : m.includes('"23503"') ? 404 : m.includes('"22P02"') ? 400 : 500;
    return res.status(code).json({ error: m.slice(0, 300) });
  }
};
