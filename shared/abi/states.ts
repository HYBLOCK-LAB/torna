import type { IssuerState, PositionState } from '../types/snapshot';

/** Array indexes are Solidity enum values. Missing records must be tracked separately. */
export const POSITION_STATES = [
  'Registered', 'Advanced', 'Repaid', 'Overdue',
  'Review', 'CoveredLoss', 'CapHeld', 'RecoveryRecorded',
] as const satisfies readonly PositionState[];

export const ISSUER_STATES = [
  'Active', 'MarginCall', 'Suspended', 'Deregistered',
] as const satisfies readonly IssuerState[];

function decodeState<T extends string>(states: readonly T[], value: number): T {
  if (!Number.isInteger(value) || value < 0 || value >= states.length) {
    throw new RangeError(`Unknown state index: ${value}`);
  }
  return states[value];
}

export const positionStateName = (value: number) => decodeState(POSITION_STATES, value);
export const issuerStateName = (value: number) => decodeState(ISSUER_STATES, value);
