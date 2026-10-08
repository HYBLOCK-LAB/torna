/** Adapter acknowledgment after it verifies a ledger_credits row for refundKey. */
export const ledgerCreditAbi = [
  {
    type: 'function',
    name: 'confirmLedgerCredit',
    stateMutability: 'nonpayable',
    inputs: [{name: 'refundKey', type: 'bytes32'}],
    outputs: [],
  },
] as const;
