import keccak256 from "@adraffy/keccak/256";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/** EIP-55 mixed-case checksum encoding (Keccak-256). */
function toChecksumAddress(address: string): string {
  const lower = address.slice(2).toLowerCase();
  const hash = Buffer.from(keccak256(new TextEncoder().encode(lower))).toString(
    "hex",
  );
  let out = "0x";
  for (let i = 0; i < 40; i++) {
    out += Number.parseInt(hash[i], 16) >= 8 ? lower[i].toUpperCase() : lower[i];
  }
  return out;
}

export function isEvmAddress(value: string): boolean {
  return ADDRESS_RE.test(value);
}

/** Returns checksummed address or throws if invalid. */
export function parseEvmWalletAddress(input: string): string {
  const trimmed = input.trim();
  if (!isEvmAddress(trimmed)) {
    throw new Error("Invalid EVM wallet address.");
  }
  return toChecksumAddress(trimmed);
}
