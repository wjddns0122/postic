// Minew G1 gateway -> tag_presence. Auth: ?key=<INGEST_KEY> (G1 can't send custom headers reliably).
// 배포: supabase functions deploy g1-ingest --no-verify-jwt --project-ref hnnsiqgiibqgiyskdxyj
import { createClient } from "npm:@supabase/supabase-js@2";

const KEY = Deno.env.get("INGEST_KEY") ?? "postic";
const PREFIX = "504F53544943"; // "POSTIC"
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// products.mac -> major/minor. iBeacon이 아닌 패킷(Eddystone 등)도 MAC으로 인식한다.
const normMac = (m: unknown) => String(m ?? "").replace(/[^0-9a-f]/gi, "").toUpperCase();
let macMap = new Map<string, { major: number; minor: number }>();
let macAt = 0;
async function loadMacs() {
  if (Date.now() - macAt < 30_000) return macMap;
  const { data } = await sb.from("products").select("mac, major, minor").not("mac", "is", null);
  macMap = new Map((data ?? []).map((p: any) => [normMac(p.mac), { major: p.major, minor: p.minor }]));
  macAt = Date.now();
  return macMap;
}

const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

function pick(o: any, ...names: string[]) {
  for (const n of names) if (o?.[n] !== undefined && o[n] !== null && o[n] !== "") return o[n];
}

// iBeacon inside raw advertising hex: ...4C 00 02 15 <uuid16> <major2> <minor2> <tx1>
function fromRaw(hex: string) {
  const h = String(hex).replace(/[^0-9a-f]/gi, "").toUpperCase();
  const i = h.indexOf("4C000215");
  if (i < 0) return null;
  const b = h.slice(i + 8);
  if (b.length < 40) return null;
  return { uuid: b.slice(0, 32), major: parseInt(b.slice(32, 36), 16), minor: parseInt(b.slice(36, 40), 16) };
}

function items(body: any): any[] {
  if (Array.isArray(body)) return body;
  if (body && typeof body === "object") {
    // G1-E JSON-PREPARSED: {"gw": "...", "adv": [...]}
    for (const k of ["adv", "data", "devices", "items", "list", "beacons"]) if (Array.isArray(body[k])) return body[k];
    return [body];
  }
  return [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  // G1 "Network checking(failover)"가 HEAD/GET으로 연결 확인만 한다 → 기록하지 않고 200
  if (req.method !== "POST") return json({ ok: true });
  const url = new URL(req.url);
  if (url.searchParams.get("key") !== KEY) return json({ error: "forbidden" }, 403);
  const acceptAny = url.searchParams.get("any") === "1";

  const text = await req.text();
  await sb.rpc("log_raw", { p_body: text });

  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ ok: false, error: "not json", received: text.length });
  }

  const list = items(body);
  const macs = await loadMacs();
  let gateway: string | null = body?.gw ? `G1-${String(body.gw).slice(-4).toUpperCase()}` : null;
  const best = new Map<string, any>();

  for (const it of list) {
    const type = String(pick(it, "type", "Type") ?? "");
    if (/gateway/i.test(type)) {
      gateway = pick(it, "mac", "MAC") ?? gateway;
      continue;
    }
    let major: any, minor: any;
    const known = macs.get(normMac(pick(it, "mac", "MAC")));
    if (known) {
      ({ major, minor } = known);
    } else {
      let uuid = pick(it, "ibeaconUuid", "iBeaconUuid", "ibeacon_uuid", "uuid", "UUID");
      major = pick(it, "ibeaconMajor", "iBeaconMajor", "ibeacon_major", "major", "Major");
      minor = pick(it, "ibeaconMinor", "iBeaconMinor", "ibeacon_minor", "minor", "Minor");
      if (uuid === undefined || major === undefined || minor === undefined) {
        const raw = pick(it, "rawData", "rawdata", "raw", "advData", "data");
        const r = typeof raw === "string" ? fromRaw(raw) : null;
        if (!r) continue;
        ({ uuid, major, minor } = r);
      }
      const u = String(uuid).replace(/-/g, "").toUpperCase();
      if (!acceptAny && !u.startsWith(PREFIX)) continue;
    }
    major = Number(major);
    minor = Number(minor);
    if (!Number.isFinite(major) || !Number.isFinite(minor)) continue;
    const rssi = Number(pick(it, "rssi", "RSSI") ?? -100);
    const key = `${major}-${minor}`;
    const prev = best.get(key);
    if (!prev || rssi > prev.rssi) {
      best.set(key, {
        key, major, minor, rssi,
        gateway: pick(it, "gateway") ?? null,
        simulated: it?.simulated === true,
      });
    }
  }

  const now = new Date().toISOString();
  const rows = [...best.values()].map((r) => ({ ...r, gateway: r.gateway ?? gateway ?? "GW-01", last_seen: now }));
  if (rows.length) {
    const { error } = await sb.from("tag_presence").upsert(rows);
    if (error) return json({ ok: false, error: error.message }, 500);
  }
  return json({ ok: true, received: list.length, accepted: rows.length });
});
