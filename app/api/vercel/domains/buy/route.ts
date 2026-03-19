import {
  mppx, vercelClient, PRICES,
  requireWallet,
  withErrorHandling, validationErrorResponse, errorResponse, jsonResponse,
} from "@/lib/server-utils";

export const dynamic = "force-dynamic";

// --- Buy domain (dynamic charge) ---
// This is more complex because we need to look up the price first.
// With the Next.js mppx pattern, we handle validation before the payment wrapper.
export const POST = async (req: Request) => {
  try {
    requireWallet(req);
  } catch {
    return errorResponse(401, "Authorization required", "AUTH_REQUIRED");
  }

  // Clone the request so we can read the body twice
  const body = await req.json();

  if (!body.name || typeof body.name !== "string") {
    return validationErrorResponse([{ field: "name", message: "Domain name is required" }]);
  }

  // Look up the price before charging
  const availability = await vercelClient.domains.checkAvailability(body.name);
  if (!availability.available) {
    return errorResponse(400, `Domain ${body.name} is not available`, "DOMAIN_UNAVAILABLE");
  }

  const price = availability.price ?? 0;
  // Convert dollar price to USDC string
  const amount = String(Math.ceil(price * 1_000_000));

  // Now create the charge handler dynamically with the looked-up price
  const handler = mppx.charge({ amount, description: "Domain purchase" })(
    withErrorHandling(async () => {
      const domain = await vercelClient.domains.buy(body);
      return jsonResponse(domain, 201);
    }),
  );

  // Create a new request with the body re-attached (since we already consumed it)
  const newReq = new Request(req.url, {
    method: req.method,
    headers: req.headers,
    body: JSON.stringify(body),
  });

  return handler(newReq);
};
