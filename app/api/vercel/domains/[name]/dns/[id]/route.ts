import {
  mppx, vercelClient, PRICES,
  requireWallet, extractParam,
  withErrorHandling, jsonResponse,
} from "@/lib/server-utils";

export const dynamic = "force-dynamic";

// --- Delete DNS record ($0.001) ---
export const DELETE = mppx.charge({ amount: PRICES.AUTH, description: "Delete DNS record" })(
  withErrorHandling(async (req) => {
    requireWallet(req);
    const domain = extractParam(req, "domains");
    const url = new URL(req.url);
    const parts = url.pathname.split("/");
    const recordId = decodeURIComponent(parts[parts.length - 1]);
    await vercelClient.domains.deleteDnsRecord(domain, recordId);
    return jsonResponse({ ok: true });
  }),
);
