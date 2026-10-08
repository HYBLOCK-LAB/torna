/**
 * Torna — one live read from the chain the bundle came from.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 * Everything else on screen is a snapshot: a state the chain really was in,
 * captured at a block and replayed here. That is deliberate — the demo must
 * run when the venue's wifi does not, and when a testnet is having a bad day.
 *
 * But a page that never speaks to the chain cannot prove it has one. So we
 * ask the chain exactly one question, once, when the page opens: how far have
 * you got? The answer sits beside the block a snapshot was taken at, and the
 * two numbers together say what no sentence can — this bundle came from a
 * chain that is still running.
 *
 * ── The rules ─────────────────────────────────────────────────────────────
 * · Read-only. `eth_blockNumber` is a question, not a transaction: no wallet,
 *   no gas, nothing written, nothing to approve.
 * · Once per page load. Switching timepoints does not call out again.
 * · Failure is silent. A timeout, a blocked network, an unknown chain — the
 *   field simply does not appear and the rest of the demo is untouched.
 *
 * Owner: A(서진)
 */

const RPCS: Record<number, string> = {
  10143: 'https://testnet-rpc.monad.xyz',
};

export type LiveHead =
  | { state: 'off' }                        // no RPC for this chain
  | { state: 'asking' }
  | { state: 'ok'; block: number }
  | { state: 'failed' };

/** The chain's current head, or null if we cannot ask or cannot reach it. */
export async function fetchHead(chainId: number, timeoutMs = 6000): Promise<number | null> {
  const url = RPCS[chainId];
  if (!url) return null;

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
      signal: abort.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { result?: string };
    if (typeof json.result !== 'string') return null;
    const block = Number.parseInt(json.result, 16);
    return Number.isFinite(block) && block > 0 ? block : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function hasRpc(chainId: number): boolean {
  return Boolean(RPCS[chainId]);
}
