import {
  mppx,  PRICES,
  requireWallet, extractParam,
  withErrorHandling, jsonResponse,
getKVClient, } from "@/lib/server-utils";

export const dynamic = "force-dynamic";

// --- Delete key ($0.001) ---
export const POST = mppx.charge({ amount: PRICES.KV_OP, description: "KV del" })(
  withErrorHandling(async (req) => {
    requireWallet(req);
    const dbId = extractParam(req, "kv");
    const body = await req.json();
    const kv = await getKVClient(dbId);
    const deleted = await kv.del(body.key);
    return jsonResponse({ deleted });
  }),
);
