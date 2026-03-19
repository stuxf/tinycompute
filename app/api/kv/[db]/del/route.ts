import {
  mppx, upstashClient, PRICES,
  requireWallet, extractParam,
  withErrorHandling, jsonResponse,
} from "@/lib/server-utils";
import { UpstashKVClient } from "@/lib/upstash/kv";

export const dynamic = "force-dynamic";

// --- Delete key ($0.001) ---
export const POST = mppx.charge({ amount: PRICES.KV_OP, description: "KV del" })(
  withErrorHandling(async (req) => {
    requireWallet(req);
    const dbId = extractParam(req, "kv");
    const body = await req.json();
    const db = await upstashClient.databases.get(dbId);
    const kv = new UpstashKVClient({ url: `https://${db.endpoint}`, token: db.rest_token });
    const deleted = await kv.del(body.key);
    return jsonResponse({ deleted });
  }),
);
