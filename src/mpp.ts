/**
 * MPP payment configuration
 * Sets up mppx with Tempo payment method for Hono middleware.
 * Supports both one-time charges and session-based billing.
 */

import { Mppx, tempo } from "mppx/hono";

const USDC = "0x20c000000000000000000000b9537d11c60e8b50" as const;

const RECIPIENT = process.env.MPP_RECIPIENT;
if (!RECIPIENT) {
  console.error("Missing MPP_RECIPIENT env var (your Tempo wallet address)");
  process.exit(1);
}

// @ts-ignore - mppx has complex internal types
export const mppx = Mppx.create({
  methods: [
    tempo({
      currency: USDC,
      recipient: RECIPIENT as `0x${string}`,
    }),
  ],
});
