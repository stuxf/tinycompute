import {
  mppx, vercelClient, PRICES,
  requireWallet, extractParam,
  withErrorHandling, jsonResponse,
} from "@/lib/server-utils";

export const dynamic = "force-dynamic";

// --- Get domain info ($0.001) ---
export const GET = mppx.charge({ amount: PRICES.AUTH, description: "Get Vercel domain info" })(
  withErrorHandling(async (req) => {
    requireWallet(req);
    const name = extractParam(req, "domains");
    const domain = await vercelClient.domains.get(name);
    return jsonResponse(domain);
  }),
);

// --- Transfer out / get auth code ($0.001) ---
export const DELETE = mppx.charge({ amount: PRICES.AUTH, description: "Get domain auth code for transfer" })(
  withErrorHandling(async (req) => {
    requireWallet(req);
    const name = extractParam(req, "domains");
    const authCode = await vercelClient.domains.getAuthCode(name);
    return jsonResponse(authCode);
  }),
);
