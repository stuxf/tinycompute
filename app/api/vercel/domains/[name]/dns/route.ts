import {
  mppx, vercelClient, PRICES,
  requireWallet, extractParam,
  withErrorHandling, validationErrorResponse, jsonResponse,
} from "@/lib/server-utils";

export const dynamic = "force-dynamic";

// --- List DNS records ($0.001) ---
export const GET = mppx.charge({ amount: PRICES.AUTH, description: "List DNS records" })(
  withErrorHandling(async (req) => {
    requireWallet(req);
    const domain = extractParam(req, "domains");
    const res = await vercelClient.domains.getDnsRecords(domain);
    return jsonResponse(res.records);
  }),
);

// --- Add DNS record ($0.01) ---
export const POST = mppx.charge({ amount: PRICES.EXEC_COMMAND, description: "Add DNS record" })(
  withErrorHandling(async (req) => {
    requireWallet(req);
    const domain = extractParam(req, "domains");
    const body = await req.json();
    if (!body.type || !body.name || !body.value) {
      return validationErrorResponse([
        { field: "type", message: "DNS record type is required" },
        { field: "name", message: "DNS record name is required" },
        { field: "value", message: "DNS record value is required" },
      ]);
    }
    const record = await vercelClient.domains.addDnsRecord(domain, body);
    return jsonResponse(record, 201);
  }),
);
