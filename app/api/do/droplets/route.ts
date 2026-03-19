import {
  mppx, doClient, PRICES,
  requireWallet, getPayerWallet, computeDropletRate,
  withErrorHandling, validationErrorResponse, jsonResponse,
} from "@/lib/server-utils";
import { validateCreateDroplet } from "@/lib/validation";
import { setDropletOwner, listOwnedDroplets } from "@/lib/ownership";

export const dynamic = "force-dynamic";

// --- List droplets ($0.001) ---
export const GET = mppx.charge({ amount: PRICES.AUTH, description: "List droplets" })(
  withErrorHandling(async (req) => {
    const wallet = requireWallet(req);
    const ownedIds = await listOwnedDroplets(wallet);
    if (ownedIds.length === 0) return jsonResponse([]);
    const { droplets } = await doClient.droplets.list();
    return jsonResponse(droplets.filter((d) => ownedIds.includes(String(d.id))));
  }),
);

// --- Create droplet (dynamic charge based on size) ---
export async function POST(req: Request) {
  const body = await req.json();
  const v = validateCreateDroplet(body);
  if (!v.ok) return Response.json(
    { error: "Validation failed", code: "VALIDATION_ERROR", details: v.errors },
    { status: 400 },
  );

  const rate = computeDropletRate(body.size);

  const handler = mppx.charge({
    amount: rate.setupFee,
    description: `Droplet setup (${body.size}) — runtime ${rate.ratePretty}`,
  })(
    withErrorHandling(async () => {
      const droplet = await doClient.droplets.create(body);
      const wallet = getPayerWallet(req);
      if (wallet) await setDropletOwner(String(droplet.id), wallet);
      return jsonResponse({
        ...droplet,
        pricing: {
          setupFee: `$${rate.setupFee}`,
          ratePerMin: rate.ratePretty,
        },
      }, 201);
    }),
  );

  return handler(req);
}
