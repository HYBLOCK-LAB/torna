/**
 * Torna — links out to the chain.
 *
 * The strongest claim this demo makes is that none of it is a mockup: every
 * hash on screen is a transaction that exists. That claim is only worth
 * something if a judge can click one and land on a block explorer. So every
 * hash the demo prints is a link, and the link is built from the snapshot's
 * own `chainId` — not from a constant we could forget to change. Point the
 * bundle at a different chain and the links follow it; point it at a chain
 * with no explorer (a local anvil run, chainId 31337) and the hashes render
 * as plain text rather than as links that go nowhere.
 *
 * Owner: A(서진)
 */

const EXPLORERS: Record<number, string> = {
  // Monad Testnet. The other explorer for this chain is
  // https://testnet.monadvision.com — same path shape, swap the string.
  10143: 'https://testnet.monadscan.com',
};

export function explorerBase(chainId: number): string | null {
  return EXPLORERS[chainId] ?? null;
}

export function txUrl(chainId: number, hash: string): string | null {
  const base = explorerBase(chainId);
  return base ? `${base}/tx/${hash}` : null;
}

export function addressUrl(chainId: number, address: string): string | null {
  const base = explorerBase(chainId);
  return base ? `${base}/address/${address}` : null;
}
