import {
  mppx, fly,
  getPayerWallet,
  withErrorHandling, jsonResponse,
} from "@/lib/server-utils";
import { setMachineOwner } from "@/lib/ownership";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — wait for server to boot

const MINECRAFT_PRICE = "0.15"; // slightly more than base setup to cover the larger machine

/**
 * POST /api/minecraft — One-click Minecraft server
 *
 * Creates a 2cpu/4GB machine running itzg/minecraft-server with Paper,
 * waits for it to be ready, and returns the connection address.
 *
 * Optional body params:
 *   name: string (default: "mc-server")
 *   region: string (default: "sjc")
 *   ttl_minutes: number (default: 60, max 1440)
 *   version: string (default: latest — Minecraft version)
 *   type: string (default: "PAPER" — server type: PAPER, VANILLA, FABRIC, FORGE)
 *   memory: string (default: "3G" — JVM heap)
 *   max_players: number (default: 20)
 *   motd: string (default: "TinyCompute Minecraft Server")
 */
export const POST = mppx.charge({ amount: MINECRAFT_PRICE, description: "Minecraft server (2cpu/4GB, includes setup + first hour)" })(
  withErrorHandling(async (req) => {
    const body = await req.json().catch(() => ({}));

    const name = body.name ?? `mc-${Date.now().toString(36)}`;
    const region = body.region ?? "sjc";
    const ttlMinutes = Math.min(body.ttl_minutes ?? 60, 1440);
    const serverType = body.type ?? "PAPER";
    const memory = body.memory ?? "3G";
    const maxPlayers = body.max_players ?? 20;
    const motd = body.motd ?? "TinyCompute Minecraft Server";
    const version = body.version ?? "LATEST";

    // Create machine with Minecraft-optimized config
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
        },
        guest: {
          cpu_kind: "shared",
          cpus: 2,
          memory_mb: 4096,
        },
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

    // Track ownership
    const wallet = getPayerWallet(req);
    if (wallet) await setMachineOwner(machine.id, wallet);

    // Get connection IP
    let connectIp: string | null = null;
    try {
      const rawIps = await fly.apps.listIps(process.env.FLY_APP_NAME!);
      const ipList = Array.isArray(rawIps) ? rawIps : [];
      const dedicated = ipList.find((ip: any) => ip.type === "v4");
      const shared = ipList.find((ip: any) => ip.type === "shared_v4");
      connectIp = (dedicated ?? shared)?.address ?? null;
    } catch { /* ignore */ }

    // Wait for the machine to start
    try {
      await fly.machines.waitForState(machine.id, "started", 60);
    } catch {
      // Machine may already be started or timed out — continue anyway
    }

    // Poll for Minecraft server readiness (mc-health)
    let ready = false;
    let lastStatus = "starting";
    for (let attempt = 0; attempt < 20; attempt++) {
      await new Promise(r => setTimeout(r, 15000)); // 15s between checks
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
      },
      server: {
        type: serverType,
        version,
        maxPlayers,
        motd,
        memory,
      },
      ttl: {
        minutes: ttlMinutes,
        expiresAt: new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString(),
      },
      management: {
        stop: `tempo request -t -X POST https://tinycompute.dev/api/machines/${machine.id}/stop`,
        destroy: `tempo request -t -X DELETE https://tinycompute.dev/api/machines/${machine.id}`,
        exec: `tempo request -t -X POST --json '{"command":["mc-health"]}' https://tinycompute.dev/api/machines/${machine.id}/exec`,
      },
    }, 201);
  }),
);
