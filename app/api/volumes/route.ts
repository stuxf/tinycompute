import {
  mppx, fly, PRICES,
  requireWallet, getPayerWallet,
  withErrorHandling, validationErrorResponse, jsonResponse,
} from "@/lib/server-utils";
import { validateCreateVolume } from "@/lib/validation";
import { setVolumeOwner, listOwnedVolumes } from "@/lib/ownership";

export const dynamic = "force-dynamic";

// --- List volumes ($0.001) ---
export const GET = mppx.charge({ amount: PRICES.AUTH, description: "List volumes" })(
  withErrorHandling(async (req) => {
    const wallet = requireWallet(req);
    const ownedIds = await listOwnedVolumes(wallet);
    if (ownedIds.length === 0) return jsonResponse([]);
    const allVolumes = await fly.volumes.list();
    return jsonResponse(allVolumes.filter((v) => ownedIds.includes(v.id)));
  }),
);

// --- Create volume (charge) ---
export const POST = mppx.charge({ amount: PRICES.VOLUME_SETUP, description: "Volume setup fee" })(
  withErrorHandling(async (req) => {
    const body = await req.json();
    const v = validateCreateVolume(body);
    if (!v.ok) return validationErrorResponse(v.errors);
    const volume = await fly.volumes.create(body);
    const wallet = getPayerWallet(req);
    if (wallet) await setVolumeOwner(volume.id, wallet);
    return jsonResponse(volume, 201);
  }),
);
