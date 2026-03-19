import {
  mppx, fly, PRICES,
  requireWallet, getPayerWallet,
  withErrorHandling, validationErrorResponse, jsonResponse,
} from "@/lib/server-utils";
import { validateCreateMachine } from "@/lib/validation";
import { setMachineOwner, listOwnedMachines } from "@/lib/ownership";

export const dynamic = "force-dynamic";

// --- List machines ($0.001) ---
export const GET = mppx.charge({ amount: PRICES.AUTH, description: "List machines" })(
  withErrorHandling(async (req) => {
    const wallet = requireWallet(req);
    const ownedIds = await listOwnedMachines(wallet);
    if (ownedIds.length === 0) return jsonResponse([]);
    const allMachines = await fly.machines.list();
    return jsonResponse(allMachines.filter((m) => ownedIds.includes(m.id)));
  }),
);

// --- Create machine (charge) ---
export const POST = mppx.charge({ amount: PRICES.MACHINE_SETUP, description: "Machine setup fee" })(
  withErrorHandling(async (req) => {
    const body = await req.json();
    const v = validateCreateMachine(body);
    if (!v.ok) return validationErrorResponse(v.errors);
    const machine = await fly.machines.create(body);
    const wallet = getPayerWallet(req);
    if (wallet) await setMachineOwner(machine.id, wallet);
    // Include connection info: public IPs for the app
    const ips = await fly.apps.listIps(process.env.FLY_APP_NAME!).catch(() => []);
    const services = body.config?.services ?? [];
    const ports = services.flatMap((s: any) => s.ports?.map((p: any) => p.port) ?? []);
    return jsonResponse({
      ...machine,
      connection: {
        ips: Array.isArray(ips) ? ips : [],
        ports,
        hint: ports.length > 0
          ? `Connect to <ip>:${ports[0]}`
          : "No services/ports configured — use exec to interact",
      },
    }, 201);
  }),
);
