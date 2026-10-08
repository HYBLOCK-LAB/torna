/**
 * The ONE hashing implementation for off-chain identifiers.
 *
 * Contract rule (shared/abi/README.md, "Identifier encoding"): hash the exact
 * UTF-8 bytes, i.e. Solidity keccak256(bytes(value)), not abi.encode(value).
 * The label dumper and the scenario runner must import this module instead of
 * re-implementing it, otherwise hashes and labels stop matching.
 */
import { keccak256 as viemKeccak256, stringToHex, type Hex } from 'viem';

export class IdentifierError extends Error {}

function assertIdentifier(value: string, what: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new IdentifierError(`${what} must be a non-empty string`);
  }
  // Never trim, re-case or transliterate (e.g. ACQ-α must stay Greek).
  // Reject instead of silently normalising so every consumer hashes the same bytes.
  if (value !== value.trim()) {
    throw new IdentifierError(`${what} has leading or trailing whitespace: ${JSON.stringify(value)}`);
  }
  if (value.normalize('NFC') !== value) {
    throw new IdentifierError(`${what} is not NFC-normalised: ${JSON.stringify(value)}`);
  }
}

/** keccak256 of the exact UTF-8 bytes of an identifier. */
export function hashIdentifier(value: string): Hex {
  assertIdentifier(value, 'identifier');
  return viemKeccak256(stringToHex(value));
}

/** refundKey = keccak256(utf8(refundId)), e.g. "REF-2026-001". */
export function refundKeyOf(refundId: string): Hex {
  assertIdentifier(refundId, 'refundId');
  return viemKeccak256(stringToHex(refundId));
}

/** acquirerHash = keccak256(utf8(acquirerId)), e.g. "ACQ-α". */
export function acquirerHashOf(acquirerId: string): Hex {
  assertIdentifier(acquirerId, 'acquirerId');
  return viemKeccak256(stringToHex(acquirerId));
}

/**
 * Alias kept for the label-dump example in PROJECT_SPEC 13 / shared/labels/README.md:
 *   import { keccak256 } from '@torna/adapter/hash';
 * Takes an identifier STRING, not raw bytes.
 */
export const keccak256 = hashIdentifier;
