import {
  mppx, doClient, PRICES,
  requireWallet, getPayerWallet,
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

// --- Create droplet (charge) ---
export const POST = mppx.charge({ amount: PRICES.MACHINE_SETUP, description: "Droplet setup fee" })(
  withErrorHandling(async (req) => {
    const body = await req.json();
    const v = validateCreateDroplet(body);
    if (!v.ok) return validationErrorResponse(v.errors);
    const droplet = await doClient.droplets.create(body);
    const wallet = getPayerWallet(req);
    if (wallet) await setDropletOwner(String(droplet.id), wallet);
    return jsonResponse(droplet, 201);
  }),
);
