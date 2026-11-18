// Worker de Atarashi: atiende POST /api/subir (subir fotos nuevas a R2) y GET /api/foto (leer una foto de R2 desde el panel).
// Todo lo demas (la tienda) lo sirve Cloudflare directamente como archivos estaticos.
const BASE_PUBLICA = "https://fotos.atarashi-store.com";
const MAX_BYTES = 6 * 1024 * 1024;

function json(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...extra },
  });
}

function cors() {
  // La seguridad es la clave secreta (no hay cookies), asi que se permite desde cualquier pagina (el panel puede abrirse desde varios sitios)
  return { "access-control-allow-origin": "*", "access-control-allow-headers": "x-clave", "access-control-allow-methods": "POST, OPTIONS" };
}

function iguales(a, b) {
  const enc = new TextEncoder();
  const x = enc.encode(a), y = enc.encode(b);
  if (x.length !== y.length) return false;
  let r = 0;
  for (let i = 0; i < x.length; i++) r |= x[i] ^ y[i];
  return r === 0;
}

function idNuevo() {
  const b = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(b, (n) => n.toString(36).padStart(2, "0")).join("").slice(0, 20);
}

export default {
  async fetch(request, env) {
    const h = cors();
    const u = new URL(request.url);
    // GET /api/foto?k=orig/atarashi_contado/xxx.jpg: entrega una foto con permiso (CORS) para que el panel pueda girarla o borrarle manchas
    if (u.pathname === "/api/foto") {
      const k = u.searchParams.get("k") || "";
      if (!/^(orig|w560)\/atarashi_contado\/[A-Za-z0-9_-]+\.jpg$/.test(k)) return new Response("No encontrado", { status: 404, headers: h });
      const o = await env.FOTOS.get(k);
      if (!o) return new Response("No encontrado", { status: 404, headers: h });
      return new Response(o.body, { headers: { "content-type": "image/jpeg", "cache-control": "no-store", "access-control-allow-origin": "*" } });
    }
    if (u.pathname !== "/api/subir") return new Response("No encontrado", { status: 404 });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: h });
    if (request.method !== "POST") return json({ error: "No permitido" }, 405, h);

    const clave = request.headers.get("x-clave") || "";
    if (!env.CLAVE_SUBIDA || !iguales(clave, env.CLAVE_SUBIDA)) return json({ error: "Clave incorrecta" }, 401, h);

    let form;
    try { form = await request.formData(); } catch { return json({ error: "Formulario invalido" }, 400, h); }
    const orig = form.get("orig"), chica = form.get("w560");
    if (!orig || !chica || typeof orig === "string" || typeof chica === "string") return json({ error: "Faltan las dos fotos" }, 400, h);
    if (orig.size > MAX_BYTES || chica.size > MAX_BYTES) return json({ error: "Foto muy pesada" }, 413, h);
    if (orig.type !== "image/jpeg" || chica.type !== "image/jpeg") return json({ error: "Solo JPG" }, 415, h);

    const id = idNuevo();
    const meta = { httpMetadata: { contentType: "image/jpeg", cacheControl: "public, max-age=31536000, immutable" } };
    await env.FOTOS.put(`orig/atarashi_contado/${id}.jpg`, orig.stream(), meta);
    await env.FOTOS.put(`w560/atarashi_contado/${id}.jpg`, chica.stream(), meta);
    return json({ url: `${BASE_PUBLICA}/orig/atarashi_contado/${id}.jpg` }, 200, h);
  },
};
