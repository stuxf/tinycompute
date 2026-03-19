/**
 * Ownership registry
 * Maps Fly machines/volumes to the wallet address that created them.
 * Persisted to data/ownership.json — survives restarts.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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

// Load once at startup
let data = loadData();

export function setMachineOwner(machineId: string, wallet: string): void {
  data.machines[machineId] = wallet.toLowerCase();
  saveData(data);
}

export function getMachineOwner(machineId: string): string | undefined {
  return data.machines[machineId];
}

export function setVolumeOwner(volumeId: string, wallet: string): void {
  data.volumes[volumeId] = wallet.toLowerCase();
  saveData(data);
}

export function getVolumeOwner(volumeId: string): string | undefined {
  return data.volumes[volumeId];
}

export function setDropletOwner(dropletId: string, wallet: string): void {
  data.droplets[dropletId] = wallet.toLowerCase();
  saveData(data);
}

export function listOwnedDroplets(wallet: string): string[] {
  const w = wallet.toLowerCase();
  return Object.entries(data.droplets)
    .filter(([, owner]) => owner === w)
    .map(([id]) => id);
}

export function removeDroplet(dropletId: string): void {
  delete data.droplets[dropletId];
  saveData(data);
}

export function assertOwnership(
  resourceId: string,
  wallet: string,
  type: "machine" | "volume" | "droplet",
): void {
  const store = type === "machine" ? data.machines : type === "volume" ? data.volumes : data.droplets;
  const owner = store[resourceId];
  if (!owner) {
    throw new Error(`${type} ${resourceId} not found in registry`);
  }
  if (owner !== wallet.toLowerCase()) {
    throw new Error(`Not authorized: you do not own this ${type}`);
  }
}

export function listOwnedMachines(wallet: string): string[] {
  const w = wallet.toLowerCase();
  return Object.entries(data.machines)
    .filter(([, owner]) => owner === w)
    .map(([id]) => id);
}

export function listOwnedVolumes(wallet: string): string[] {
  const w = wallet.toLowerCase();
  return Object.entries(data.volumes)
    .filter(([, owner]) => owner === w)
    .map(([id]) => id);
}

export function removeMachine(machineId: string): void {
  delete data.machines[machineId];
  saveData(data);
}

export function removeVolume(volumeId: string): void {
  delete data.volumes[volumeId];
  saveData(data);
}
