import {
  mppx, fly, PRICES,
  requireWallet, extractParam,
  withErrorHandling, jsonResponse,
} from "@/lib/server-utils";

export const dynamic = "force-dynamic";

export const DELETE = mppx.charge({ amount: PRICES.AUTH, description: "Delete app" })(
  withErrorHandling(async (req) => {
    requireWallet(req);
    const name = extractParam(req, "apps");
    const url = new URL(req.url);
    const force = url.searchParams.get("force") === "true";
    await fly.apps.delete(name, force);
    return jsonResponse({ ok: true });
  }),
);
