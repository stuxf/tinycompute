import {
  mppx, upstashClient, PRICES,
  requireWallet, extractParam,
  withErrorHandling, jsonResponse,
} from "@/lib/server-utils";

export const dynamic = "force-dynamic";

// --- Delete database ($0.001) ---
export const DELETE = mppx.charge({ amount: PRICES.KV_OP, description: "Delete KV database" })(
  withErrorHandling(async (req) => {
    requireWallet(req);
    const id = extractParam(req, "databases");
    await upstashClient.databases.delete(id);
    return jsonResponse({ ok: true });
  }),
);
