import {
  mppx, fly, PRICES,
  requireOwnership, extractParam,
  withErrorHandling, validationErrorResponse, jsonResponse,
} from "@/lib/server-utils";
import { validateExtendVolume } from "@/lib/validation";

export const dynamic = "force-dynamic";

export const PUT = mppx.charge({ amount: PRICES.VOLUME_EXTEND, description: "Extend storage volume" })(
  withErrorHandling(async (req) => {
    const body = await req.json();
    const v = validateExtendVolume(body);
    if (!v.ok) return validationErrorResponse(v.errors);
    const id = extractParam(req, "volumes");
    const { resourceId } = await requireOwnership(req, id, "volume");
    return jsonResponse(await fly.volumes.extend(resourceId, v.size_gb));
  }),
);
