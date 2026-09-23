/** ERC-2612 allowance approval for our MockUSDC, separate from Torna AdvanceRequest. */
export const MOCK_USDC_PERMIT_NAME = 'Torna Mock USDC';
export const MOCK_USDC_PERMIT_VERSION = '1';
export const PERMIT_PRIMARY_TYPE = 'Permit';
export const PERMIT_TYPE =
  'Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)';

export const permitTypes = {
  Permit: [
    { name: 'owner', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

/** owner=issuer, spender=Torna contract (NOT relayer), nonce=token.nonces(owner). */
export interface PermitMessage {
  owner: `0x${string}`;
  spender: `0x${string}`;
  value: bigint;
  nonce: bigint;
  deadline: bigint;
}

/** Obtain chainId and tokenAddress from the actual deployment, never from display labels. */
export function mockUsdcPermitDomain(chainId: number, tokenAddress: `0x${string}`) {
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new RangeError('chainId must be a positive safe integer');
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(tokenAddress) || /^0x0{40}$/.test(tokenAddress)) {
    throw new TypeError('tokenAddress must be a nonzero 20-byte address');
  }
  return {
    name: MOCK_USDC_PERMIT_NAME,
    version: MOCK_USDC_PERMIT_VERSION,
    chainId,
    verifyingContract: tokenAddress,
  } as const;
}

/** Narrow token ABI for the adapter; conformance is checked against compiled MockUSDC. */
export const mockUsdcPermitAbi = [
  {
    type: 'function', name: 'permit', stateMutability: 'nonpayable',
    inputs: [
      { name: 'owner', type: 'address' }, { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' }, { name: 'deadline', type: 'uint256' },
      { name: 'v', type: 'uint8' }, { name: 'r', type: 'bytes32' }, { name: 's', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function', name: 'nonces', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }], outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function', name: 'DOMAIN_SEPARATOR', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function', name: 'allowance', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;
