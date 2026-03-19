import {
  mppx, upstashClient, PRICES,
  requireWallet, extractParam,
  withErrorHandling, jsonResponse,
} from "@/lib/server-utils";
import { UpstashKVClient } from "@/lib/upstash/kv";

export const dynamic = "force-dynamic";

// --- Get key ($0.001) ---
export const POST = mppx.charge({ amount: PRICES.KV_OP, description: "KV get" })(
  withErrorHandling(async (req) => {
    requireWallet(req);
    const dbId = extractParam(req, "kv");
    const body = await req.json();
    const db = await upstashClient.databases.get(dbId);
    const kv = new UpstashKVClient({ url: `https://${db.endpoint}`, token: db.rest_token });
    const value = await kv.get(body.key);
    return jsonResponse({ key: body.key, value });
  }),
);
