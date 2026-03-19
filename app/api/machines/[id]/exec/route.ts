import {
  mppx, fly, PRICES,
  requireOwnership, extractParam,
  withErrorHandling, validationErrorResponse, jsonResponse,
} from "@/lib/server-utils";
import { validateExecCommand } from "@/lib/validation";

export const dynamic = "force-dynamic";

export const POST = mppx.charge({ amount: PRICES.EXEC_COMMAND, description: "Execute command in machine" })(
  withErrorHandling(async (req) => {
    const body = await req.json();
    const v = validateExecCommand(body);
    if (!v.ok) return validationErrorResponse(v.errors);
    const id = extractParam(req, "machines");
    const { resourceId } = await requireOwnership(req, id, "machine");
    return jsonResponse(await fly.machines.exec(resourceId, v.command, v.timeout));
  }),
);
