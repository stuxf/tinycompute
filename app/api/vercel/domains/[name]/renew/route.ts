import {
  mppx, vercelClient,
  requireWallet, extractParam,
  withErrorHandling, jsonResponse, errorResponse,
} from "@/lib/server-utils";

export const dynamic = "force-dynamic";

// --- Renew domain (dynamic price) ---
export const POST = async (req: Request) => {
  try {
    requireWallet(req);
  } catch {
    return errorResponse(401, "Authorization required", "AUTH_REQUIRED");
  }

  const name = extractParam(req, "domains");

  // Look up the renewal price
  const priceInfo = await vercelClient.domains.getPrice(name);
  const amount = String(Math.ceil(priceInfo.price * 1_000_000));

  const handler = mppx.charge({ amount, description: "Domain renewal" })(
    withErrorHandling(async () => {
      const domain = await vercelClient.domains.renew(name);
      return jsonResponse(domain);
    }),
  );

  return handler(req);
};
