import {
  mppx,  PRICES,
  requireWallet, extractParam,
  withErrorHandling, jsonResponse,
getKVClient, } from "@/lib/server-utils";

export const dynamic = "force-dynamic";

// --- Set key ($0.001) ---
export const POST = mppx.charge({ amount: PRICES.KV_OP, description: "KV set" })(
  withErrorHandling(async (req) => {
    requireWallet(req);
    const dbId = extractParam(req, "kv");
    const body = await req.json();
    const kv = await getKVClient(dbId);
    const result = await kv.set(body.key, body.value, body.ex);
    return jsonResponse({ ok: result === "OK" });
  }),
);
