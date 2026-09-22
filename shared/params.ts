/**
 * Torna — frozen protocol parameters, for DISPLAY ONLY.
 *
 * ⚠ This is a mirror, not the source of truth. The real values live in the
 * contract B(민서) deploys. Nothing in the app may branch on these — they exist
 * so a sentence can say "the single-event cap is 20% of LP deposits" without a
 * magic number in the copy, and so the public view's rule table has one place
 * to read from.
 *
 * If a value here ever disagrees with the contract, the contract is right and
 * this file is a bug. Check against PROJECT_SPEC.md ch.4.
 *
 * Owner: A(서진)
 */

export const PARAMS = {
  /** Issuer collateral as a share of its outstanding advances. */
  issuerCollateralPct: 15,
  /** Issuer's first-loss share of any confirmed loss. */
  issuerLossSharePct: 20,
  /** Fee per advance: 80% LP, 13.3% reserve, 6.7% protocol. */
  feeRatePct: 0.3,
  /** One event can never charge LPs more than this share of their deposits. */
  singleEventCapPct: 20,
  /** Idle funds placed externally, as a share of LP net asset value. */
  idleDeployCapPct: 50,
  /** Outstanding exposure to any one acquirer, as a share of pool capacity. */
  acquirerExposurePct: 50,
  /** Any one issuer's share of capacity — but 1/issuerCount wins when smaller. */
  issuerConcentrationPct: 40,
  /** Target utilisation that sets the LP deposit cap. */
  lpTargetUtilizationPct: 30,
  /** Any single LP's share of deposits. */
  lpSingleCapPct: 25,
  /** New issuers open at a fraction of their limit for this long. */
  rampUpDays: 30,
  rampUpPct: 50,
  /** Reserve at launch, before any fee accrues. */
  reserveSeed: 500,
  /** Average advance term, in days. */
  avgTermDays: 5,
  /** Loss rate at which fee income exactly covers losses. */
  breakEvenPct: 0.35,
} as const;

export type ParamKey = keyof typeof PARAMS;
