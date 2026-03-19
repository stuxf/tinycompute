import {
  mppx, upstashClient, PRICES,
  requireWallet, extractParam,
  withErrorHandling, jsonResponse,
} from "@/lib/server-utils";
import { UpstashKVClient } from "@/lib/upstash/kv";

export const dynamic = "force-dynamic";

// --- List keys ($0.001) ---
export const POST = mppx.charge({ amount: PRICES.KV_OP, description: "KV keys" })(
  withErrorHandling(async (req) => {
    requireWallet(req);
    const dbId = extractParam(req, "kv");
    const body = await req.json().catch(() => ({}));
    const db = await upstashClient.databases.get(dbId);
    const kv = new UpstashKVClient({ url: `https://${db.endpoint}`, token: db.rest_token });
    const keys = await kv.keys(body.pattern);
    return jsonResponse({ keys });
  }),
);
