/**
 * Ownership registry
 * Maps Fly machines/volumes and DO droplets to the wallet address that created them.
 *
 * When UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set, data lives in
 * Upstash Redis.  Otherwise falls back to the local-file approach (data/ownership.json)
 * so local dev works without Redis.
 */

import { Redis } from "@upstash/redis";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Upstash Redis client (lazy, only created when env vars are present)
// ---------------------------------------------------------------------------

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const useRedis = !!(UPSTASH_URL && UPSTASH_TOKEN);

let redis: Redis | undefined;
if (useRedis) {
  redis = new Redis({ url: UPSTASH_URL!, token: UPSTASH_TOKEN! });
}

// ---------------------------------------------------------------------------
// File-based fallback (local dev)
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const DATA_FILE = join(DATA_DIR, "ownership.json");

interface OwnershipData {
  machines: Record<string, string>;
  volumes: Record<string, string>;
  droplets: Record<string, string>;
}

function loadData(): OwnershipData {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!existsSync(DATA_FILE)) {
    return { machines: {}, volumes: {}, droplets: {} };
  }
  try {
    const raw = readFileSync(DATA_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<OwnershipData>;
    return { machines: parsed.machines ?? {}, volumes: parsed.volumes ?? {}, droplets: parsed.droplets ?? {} };
  } catch {
    return { machines: {}, volumes: {}, droplets: {} };
  }
}

function saveData(data: OwnershipData): void {
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

let fileData: OwnershipData | undefined;
function getFileData(): OwnershipData {
  if (!fileData) fileData = loadData();
  return fileData;
}

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------

type ResourceType = "machine" | "volume" | "droplet";

function ownerKey(type: ResourceType, id: string): string {
  return `owner:${type}:${id}`;
}

function ownedSetKey(wallet: string, type: ResourceType): string {
  return `owned:${wallet}:${type}s`;
}

function storeForType(data: OwnershipData, type: ResourceType): Record<string, string> {
  return type === "machine" ? data.machines : type === "volume" ? data.volumes : data.droplets;
}

// ---------------------------------------------------------------------------
// Generic internal helpers
// ---------------------------------------------------------------------------

async function setOwner(type: ResourceType, id: string, wallet: string): Promise<void> {
  const w = wallet.toLowerCase();
  if (useRedis) {
    await redis!.set(ownerKey(type, id), w);
    await redis!.sadd(ownedSetKey(w, type), id);
  } else {
    const data = getFileData();
    storeForType(data, type)[id] = w;
    saveData(data);
  }
}

async function getOwner(type: ResourceType, id: string): Promise<string | undefined> {
  if (useRedis) {
    const val = await redis!.get<string>(ownerKey(type, id));
    return val ?? undefined;
  }
  return storeForType(getFileData(), type)[id];
}

async function removeResource(type: ResourceType, id: string): Promise<void> {
  if (useRedis) {
    const owner = await redis!.get<string>(ownerKey(type, id));
    await redis!.del(ownerKey(type, id));
    if (owner) {
      await redis!.srem(ownedSetKey(owner, type), id);
    }
  } else {
    const data = getFileData();
    delete storeForType(data, type)[id];
    saveData(data);
  }
}

async function listOwned(type: ResourceType, wallet: string): Promise<string[]> {
  const w = wallet.toLowerCase();
  if (useRedis) {
    return (await redis!.smembers(ownedSetKey(w, type))) as string[];
  }
  const store = storeForType(getFileData(), type);
  return Object.entries(store)
    .filter(([, owner]) => owner === w)
    .map(([id]) => id);
}

// ---------------------------------------------------------------------------
// Public API — same signatures as before, but now async
// ---------------------------------------------------------------------------

export async function setMachineOwner(machineId: string, wallet: string): Promise<void> {
  await setOwner("machine", machineId, wallet);
}

export async function getMachineOwner(machineId: string): Promise<string | undefined> {
  return getOwner("machine", machineId);
}

export async function setVolumeOwner(volumeId: string, wallet: string): Promise<void> {
  await setOwner("volume", volumeId, wallet);
}

export async function getVolumeOwner(volumeId: string): Promise<string | undefined> {
  return getOwner("volume", volumeId);
}

export async function setDropletOwner(dropletId: string, wallet: string): Promise<void> {
  await setOwner("droplet", dropletId, wallet);
}

export async function listOwnedDroplets(wallet: string): Promise<string[]> {
  return listOwned("droplet", wallet);
}

export async function removeDroplet(dropletId: string): Promise<void> {
  await removeResource("droplet", dropletId);
}

export async function assertOwnership(
  resourceId: string,
  wallet: string,
  type: ResourceType,
): Promise<void> {
  const owner = await getOwner(type, resourceId);
  if (!owner) {
    throw new Error(`${type} ${resourceId} not found in registry`);
  }
  if (owner !== wallet.toLowerCase()) {
    throw new Error(`Not authorized: you do not own this ${type}`);
  }
}

export async function listOwnedMachines(wallet: string): Promise<string[]> {
  return listOwned("machine", wallet);
}

export async function listOwnedVolumes(wallet: string): Promise<string[]> {
  return listOwned("volume", wallet);
}

export async function removeMachine(machineId: string): Promise<void> {
  await removeResource("machine", machineId);
}

export async function removeVolume(volumeId: string): Promise<void> {
  await removeResource("volume", volumeId);
}
