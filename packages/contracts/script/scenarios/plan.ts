import {TIMEPOINT_ORDER, type TimepointId} from '../../../../shared/types/snapshot';

/**
 * Dependencies, not a claim that the scenario runner or adapters are
 * implemented.
 */
export type Feature =|'initialLiquidity'|'issuerRegistration'|'collateral'|
    'advance'|'reserveSeed'|'repay'|'review'|'coveredLoss'|'recovery'|
    'withdrawal'|'idleDeployment'|'ledgerRetry'|'liquidityDeposit';

export const implementedContractFeatures: ReadonlySet<Feature> = new Set([
  'initialLiquidity',
  'issuerRegistration',
  'collateral',
  'reserveSeed',
  'advance',
  'repay',
  'liquidityDeposit',
]);

export interface ScenarioPlan {
  id: TimepointId;
  description: string;
  requires: readonly Feature[];
}

const definitions: Record<TimepointId, Omit<ScenarioPlan, 'id'>> = {
  t0: {
    description: 'Initial funding and first advance/repayment',
    requires: [
      'initialLiquidity', 'issuerRegistration', 'collateral', 'reserveSeed',
      'advance', 'repay'
    ]
  },
  t1: {
    description: '365 additional advances; 364 repayments and one review',
    requires: ['advance', 'repay', 'review']
  },
  t2: {
    description: 'Finalize the reviewed covered loss',
    requires: ['coveredLoss']
  },
  t3: {
    description: 'Correlated losses and whole-position loss cap',
    requires: ['advance', 'review', 'coveredLoss']
  },
  t3b: {
    description: 'Recovery reconciliation without charging collateral twice',
    requires: ['recovery']
  },
  t4: {
    description: 'New advances and LP-03 withdrawal request; the 800 USDC remainder is pending',
    requires: ['advance', 'withdrawal']
  },
  t4b: {
    description: 'D+5 repayment, payment of the pending 800 USDC and LP-03 exit',
    requires: ['repay', 'withdrawal']
  },
  t5: {
    description: 'Delayed repayment and subsequent scenario state',
    requires: ['repay', 'withdrawal']
  },
  t6: {
    description: 'Idle deployment freeze and failed recall',
    requires: ['idleDeployment']
  },
  t7: {
    description: 'Adapter ledger failure and idempotent retry',
    requires: ['ledgerRetry']
  },
  t8: {
    description: 'Invalid requests against existing run history',
    requires: ['advance']
  },
  t9: {
    description: 'Register three new issuers and issue two advances',
    requires: ['issuerRegistration', 'collateral', 'advance']
  },
  t9b: {
    description: 'Partially accept additional LP liquidity',
    requires: ['liquidityDeposit']
  },
};

export const scenarioPlan: readonly ScenarioPlan[] =
    TIMEPOINT_ORDER.map(id => ({id, ...definitions[id]}));

export function missingFeatures(step: ScenarioPlan): Feature[] {
  return step.requires.filter(
      feature => !implementedContractFeatures.has(feature));
}

export function describePlan(): string {
  return [
    'Torna scenario scaffold — PLAN ONLY; no RPC, wallets, transactions or files.',
    'Only local t0 is wired; all later scenario handlers and bundle output remain unavailable.',
    ...scenarioPlan.map(step => {
      const missing = missingFeatures(step);
      return `${step.id}: ${step.description}\n  Missing features: ${
          missing.join(', ') || 'none; execution handler still missing'}`;
    }),
  ].join('\n');
}
