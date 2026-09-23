/** Wire format from docs/interface-draft.md. No signing or business approval happens here. */
export const MONAD_TESTNET_CHAIN_ID = 10143;
export const EIP712_NAME = 'Torna';
export const EIP712_VERSION = '1';
export const ADVANCE_REQUEST_PRIMARY_TYPE = 'AdvanceRequest';

export const ADVANCE_REQUEST_TYPE =
  'AdvanceRequest(bytes32 refundKey,address issuer,bytes32 acquirerHash,uint256 amount,uint64 maturity,uint256 nonce,uint256 deadline)';

export const advanceRequestTypes = {
  AdvanceRequest: [
    { name: 'refundKey', type: 'bytes32' },
    { name: 'issuer', type: 'address' },
    { name: 'acquirerHash', type: 'bytes32' },
    { name: 'amount', type: 'uint256' },
    { name: 'maturity', type: 'uint64' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

/** Amount in 6-decimal base units; timestamps in Unix seconds. Never JS float amounts. */
export interface AdvanceRequest {
  refundKey: `0x${string}`;
  issuer: `0x${string}`;
  acquirerHash: `0x${string}`;
  amount: bigint;
  maturity: bigint;
  nonce: bigint;
  deadline: bigint;
}

/** Pass the chain ID actually read from the RPC, including a local chain's ID. */
export function tornaDomain(chainId: number, verifyingContract: `0x${string}`) {
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new RangeError('chainId must be a positive safe integer');
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(verifyingContract) || /^0x0{40}$/.test(verifyingContract)) {
    throw new TypeError('verifyingContract must be a nonzero 20-byte address');
  }
  return { name: EIP712_NAME, version: EIP712_VERSION, chainId, verifyingContract } as const;
}
