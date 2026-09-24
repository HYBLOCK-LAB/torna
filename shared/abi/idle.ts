/** External EOA liquidity API. Amounts are six-decimal MockUSDC base units. */
export const idleAbi = [
  {
    type: 'function', name: 'setIdleVault', stateMutability: 'nonpayable',
    inputs: [{name: 'vault', type: 'address'}], outputs: [],
  },
  {
    type: 'function', name: 'deployIdle', stateMutability: 'nonpayable',
    inputs: [{name: 'amount', type: 'uint256'}], outputs: [],
  },
  {
    type: 'function', name: 'recallIdle', stateMutability: 'nonpayable',
    inputs: [{name: 'amount', type: 'uint256'}], outputs: [],
  },
  {
    type: 'function', name: 'netAssetValue', stateMutability: 'view',
    inputs: [], outputs: [{name: '', type: 'uint256'}],
  },
  {
    type: 'function', name: 'poolCapacity', stateMutability: 'view',
    inputs: [], outputs: [{name: '', type: 'uint256'}],
  },
  {
    type: 'function', name: 'idleVault', stateMutability: 'view',
    inputs: [], outputs: [{name: '', type: 'address'}],
  },
  {
    type: 'function', name: 'externalDeployed', stateMutability: 'view',
    inputs: [], outputs: [{name: '', type: 'uint256'}],
  },
  {
    type: 'function', name: 'externalFrozen', stateMutability: 'view',
    inputs: [], outputs: [{name: '', type: 'bool'}],
  },
  {
    type: 'function', name: 'TREASURY_ROLE', stateMutability: 'view',
    inputs: [], outputs: [{name: '', type: 'bytes32'}],
  },
] as const;
