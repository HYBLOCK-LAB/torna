const uintOutput = [{ name: '', type: 'uint256' }] as const;
/** Implemented LP deposit and NAV-priced withdrawal API. Amounts are six-decimal token units. */
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
  {
    type: 'function', name: 'requestWithdraw', stateMutability: 'nonpayable',
    inputs: [{ name: 'principal', type: 'uint256' }],
    outputs: [{ name: 'immediate', type: 'uint256' }, { name: 'pending', type: 'uint256' }],
  },
  {
    type: 'function', name: 'processWithdrawal', stateMutability: 'nonpayable',
    inputs: [], outputs: [],
  },
] as const;
