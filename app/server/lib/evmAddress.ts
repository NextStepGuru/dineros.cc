import { getAddress, isAddress } from "viem";

/** Returns checksummed address or throws if invalid. */
export function parseEvmWalletAddress(input: string): string {
  const trimmed = input.trim();
  if (!isAddress(trimmed)) {
    throw new Error("Invalid EVM wallet address.");
  }
  return getAddress(trimmed);
}
