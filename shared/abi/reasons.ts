/** Numeric assignments from the interface draft, not a validation-order policy. */
export const ADVANCE_REJECTION = {
  DuplicateRefundKey: 1,
  UnregisteredIssuer: 2,
  InvalidSignature: 3,
  ChainMismatch: 4,
  DeadlineExpired: 5,
  IssuerLimitExceeded: 6,
  AcquirerExposureExceeded: 7,
  IssuerSuspended: 8,
} as const;

export const DEPOSIT_REJECTION = {
  DepositCapExceeded: 1,
  ConcentrationExceeded: 2,
} as const;

export type AdvanceRejectionCode = typeof ADVANCE_REJECTION[keyof typeof ADVANCE_REJECTION];
export type DepositRejectionCode = typeof DEPOSIT_REJECTION[keyof typeof DEPOSIT_REJECTION];

// Code 4 is reserved by the PRD. A signature alone does not tell us which
// incorrect domain was used; no independent ChainMismatch detection is promised.
