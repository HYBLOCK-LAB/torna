const uintOutput = [{ name: '', type: 'uint256' }] as const;

/** Implemented post-bootstrap LP deposit API. Amounts are six-decimal token units. */
export const liquidityAbi = [
  {
    type: 'function', name: 'depositLiquidity', stateMutability: 'nonpayable',
    inputs: [{ name: 'amount', type: 'uint256' }],
    outputs: [{ name: 'accepted', type: 'uint256' }],
  },
  {
    type: 'function', name: 'liquidityDepositRoom', stateMutability: 'view',
    inputs: [{ name: 'lp', type: 'address' }], outputs: uintOutput,
  },
] as const;
