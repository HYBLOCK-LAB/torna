/**
 * The only place where card-ledger amounts become on-chain amounts
 * (PROJECT_SPEC 10.5). Do not convert again anywhere else.
 *
 *   DB  "1000.00"  (numeric(14,2), returned as a string)  ->  1000000000n  (6 decimals)
 */
export class AmountError extends Error {}

const DB_AMOUNT = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,2}))?$/;

/** "1000.00" | "1000" | "0.5" -> six-decimal base units. Rejects floats and >2 decimals. */
export function dbAmountToBaseUnits(amount: string): bigint {
  if (typeof amount !== 'string') {
    throw new AmountError(`DB amount must be the decimal string from Postgres, got ${typeof amount}`);
  }
  const match = DB_AMOUNT.exec(amount);
  if (!match) throw new AmountError(`Not a 2-decimal amount: ${JSON.stringify(amount)}`);
  const whole = BigInt(match[1]);
  const cents = BigInt((match[2] ?? '').padEnd(2, '0'));
  const units = whole * 1_000_000n + cents * 10_000n;
  if (units <= 0n) throw new AmountError('Amount must be positive');
  return units;
}

/** Integer cents (100000n) -> base units (1000000000n). Factor is 10^4, not 10^6. */
export function centsToBaseUnits(cents: bigint): bigint {
  if (cents <= 0n) throw new AmountError('Amount must be positive');
  return cents * 10_000n;
}
