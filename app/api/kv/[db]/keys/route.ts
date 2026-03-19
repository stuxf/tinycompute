import {
  mppx,  PRICES,
  requireWallet, extractParam,
  withErrorHandling, jsonResponse,
getKVClient, } from "@/lib/server-utils";

export const dynamic = "force-dynamic";

// --- List keys ($0.001) ---
export const POST = mppx.charge({ amount: PRICES.KV_OP, description: "KV keys" })(
  withErrorHandling(async (req) => {
    requireWallet(req);
    const dbId = extractParam(req, "kv");
    const body = await req.json().catch(() => ({}));
    const kv = await getKVClient(dbId);
    const keys = await kv.keys(body.pattern);
    return jsonResponse({ keys });
  }),
);
