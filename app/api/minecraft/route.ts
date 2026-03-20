import {
  mppx, fly,
  getPayerWallet,
  withErrorHandling, jsonResponse,
} from "@/lib/server-utils";
import { setMachineOwner } from "@/lib/ownership";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Fixed price: covers setup + up to 1 hour of 4cpu/4GB
// Fly cost: ~$0.03/hr. We charge $0.25 flat.
const PRICE = "0.25";

/**
 * POST /api/minecraft — One-click Minecraft server ($0.25)
 * Includes up to 1 hour of runtime. Auto-stops via TTL.
 */
export const POST = mppx.charge({ amount: PRICE, description: "Minecraft server (4cpu/4GB, up to 1hr)" })(
  withErrorHandling(async (req) => {
    const body = await req.json().catch(() => ({}));

    const name = body.name ?? `mc-${Date.now().toString(36)}`;
    const region = body.region ?? "sjc";
    const ttlMinutes = Math.min(body.ttl_minutes ?? 60, 60); // max 1hr per charge
    const serverType = body.type ?? "PAPER";
    const memory = body.memory ?? "3G";
    const maxPlayers = body.max_players ?? 20;
    const motd = body.motd ?? "TinyCompute Minecraft Server";
    const version = body.version ?? "LATEST";

    const machine = await fly.machines.create({
      name,
      region,
      config: {
        image: "itzg/minecraft-server:latest",
        env: {
          EULA: "TRUE",
          TYPE: serverType,
          MEMORY: memory,
          MAX_PLAYERS: String(maxPlayers),
          MOTD: motd,
          VERSION: version,
          ENABLE_COMMAND_BLOCK: "true",
          SPAWN_PROTECTION: "0",
          VIEW_DISTANCE: "6",
          SIMULATION_DISTANCE: "4",
          ONLINE_MODE: "false",
        },
        guest: { cpu_kind: "shared", cpus: 4, memory_mb: 4096 },
        services: [{
          protocol: "tcp",
          internal_port: 25565,
          ports: [{ port: 25565 }],
        }],
        metadata: {
          ttl_expires_at: String(Date.now() + ttlMinutes * 60 * 1000),
          tinycompute_preset: "minecraft",
        },
      },
    });

    const wallet = getPayerWallet(req);
    if (wallet) await setMachineOwner(machine.id, wallet);

    // Get connection IP
    let connectIp: string | null = null;
    try {
      const rawIps = await fly.apps.listIps(process.env.FLY_APP_NAME!);
      const ipList = Array.isArray(rawIps) ? rawIps : [];
      const dedicated = ipList.find((ip: any) => !ip.shared && ip.ip);
      const shared = ipList.find((ip: any) => ip.shared && ip.ip);
      connectIp = (dedicated ?? shared)?.ip ?? null;
    } catch { /* ignore */ }

    // Wait for start
    try {
      await fly.machines.waitForState(machine.id, "started", 60);
    } catch { /* continue */ }

    // Poll mc-health
    let ready = false;
    let lastStatus = "starting";
    for (let attempt = 0; attempt < 20; attempt++) {
      await new Promise(r => setTimeout(r, 15000));
      try {
        const result = await fly.machines.exec(machine.id, ["mc-health"], 10);
        if (result.exit_code === 0) {
          ready = true;
          lastStatus = result.stdout.trim();
          break;
        }
        lastStatus = result.stderr.trim() || "starting";
      } catch {
        lastStatus = "waiting for server";
      }
    }

    return jsonResponse({
      id: machine.id,
      name,
      region,
      ready,
      status: lastStatus,
      connection: {
        address: connectIp ? `${connectIp}:25565` : null,
        ip: connectIp,
        port: 25565,
        fallback: "If address is null, run: tempo request -t https://tinycompute.dev/api/apps/mpp-compute/ips — use the non-shared IP on port 25565",
      },
      pricing: { total: `$${PRICE}`, includes: `up to ${ttlMinutes} minutes` },
      server: { type: serverType, version, maxPlayers, motd, memory },
      ttl: { minutes: ttlMinutes, expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString() },
      management: {
        stop: `tempo request -t -X POST https://tinycompute.dev/api/machines/${machine.id}/stop`,
        destroy: `tempo request -t -X DELETE https://tinycompute.dev/api/machines/${machine.id}`,
      },
    }, 201);
  }),
);
