/* Emisor de avisos de Padel Scouting.
   Lo llama solo la base (notify_call), con la contraseña de la caja fuerte.
   Tipos: result (resultado apuntado → pareja), load (carga masiva → su competición),
   reminders (cada hora; solo actúa a las 20:00 de España → partidos de mañana), test.
   La primera vez genera las claves de avisos y las guarda cifradas en la base. */
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });

function b64url(bytes: Uint8Array): string {
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

type Secrets = { token?: string; public?: string; private?: string };

async function secrets(): Promise<Secrets> {
  const { data, error } = await sb.rpc("notify_secrets");
  if (error) throw new Error("secrets: " + error.message);
  return (data || {}) as Secrets;
}

async function ensureKeys(sec: Secrets): Promise<Secrets> {
  if (sec.public && sec.private) return sec;
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey));
  const { error } = await sb.rpc("store_vapid", { p_public: b64url(raw), p_private: jwk.d });
  if (error) throw new Error("store_vapid: " + error.message);
  return await secrets();
}

function madridHour(): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", hour: "2-digit", hour12: false }).format(new Date()));
}

type Msg = { targets?: { endpoint: string; p256dh: string; auth: string }[]; title: string; body: string; url?: string };

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    let sec = await secrets();
    if (!sec.token || req.headers.get("x-notify-token") !== sec.token) return json({ error: "no autorizado" }, 401);
    sec = await ensureKeys(sec);
    webpush.setVapidDetails("https://padel-scouting.vercel.app", sec.public!, sec.private!);

    let msgs: Msg[] = [];
    if (body.type === "init") return json({ ok: true, hasKeys: !!sec.public });
    if (body.type === "result") {
      const { data, error } = await sb.rpc("notify_result_messages", { p_fixture: body.fixture_id, p_actor: body.actor });
      if (error) throw error;
      msgs = data ? [data] : [];
    } else if (body.type === "load") {
      const { data, error } = await sb.rpc("notify_load_messages", { p_import: body.import_id });
      if (error) throw error;
      msgs = data || [];
    } else if (body.type === "reminders") {
      const h = madridHour();
      if (h !== 20 && !body.force) return json({ skipped: "son las " + h + " en España; los recordatorios salen a las 20" });
      const { data, error } = await sb.rpc("notify_reminder_messages");
      if (error) throw error;
      msgs = data || [];
    } else if (body.type === "test") {
      const { data, error } = await sb.rpc("notify_test_messages", { p_user: body.user });
      if (error) throw error;
      msgs = data ? [data] : [];
    } else {
      return json({ error: "tipo desconocido" }, 400);
    }

    let sent = 0, failed = 0;
    for (const m of msgs) {
      for (const t of m.targets || []) {
        try {
          await webpush.sendNotification(
            { endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } },
            JSON.stringify({ title: m.title, body: m.body, url: m.url || "./" }),
            { TTL: 60 * 60 * 24 },
          );
          sent++;
          await sb.rpc("push_mark", { p_endpoint: t.endpoint, p_ok: true });
        } catch (e) {
          failed++;
          const code = (e as { statusCode?: number }).statusCode;
          /* 404/410: ese móvil ya no quiere avisos (desinstaló, borró datos…): se olvida. */
          if (code === 404 || code === 410) await sb.rpc("push_mark", { p_endpoint: t.endpoint, p_ok: false });
        }
      }
    }
    return json({ type: body.type, messages: msgs.length, sent, failed });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
