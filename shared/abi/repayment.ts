/** Full-principal repayment action signed with the Torna EIP-712 domain. */
export const REPAYMENT_REQUEST_PRIMARY_TYPE = 'RepaymentRequest';
export const REPAYMENT_REQUEST_TYPE =
  'RepaymentRequest(bytes32 refundKey,address issuer,uint256 amount,uint256 nonce,uint256 deadline)';
export const repaymentRequestTypes = {
  RepaymentRequest: [
    { name: 'refundKey', type: 'bytes32' },
    { name: 'issuer', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

export interface RepaymentRequest {
  refundKey: `0x${string}`;
  issuer: `0x${string}`;
  /** Must equal the position's complete principal in six-decimal base units. */
  amount: bigint;
  /** Read Torna.repaymentNonces(issuer), never another action's nonce. */
  nonce: bigint;
  deadline: bigint;
}

const requestInput = {
  name: 'request', type: 'tuple', components: repaymentRequestTypes.RepaymentRequest,
} as const;
const signatureInput = { name: 'signature', type: 'bytes' } as const;
const uintOutput = [{ name: '', type: 'uint256' }] as const;

/** Implemented full-repayment subset, checked against the compiled Torna ABI. */
export const repaymentAbi = [
  {
    type: 'function', name: 'repay', stateMutability: 'nonpayable',
    inputs: [requestInput, signatureInput], outputs: [],
  },
  {
    type: 'function', name: 'repayWithPermit', stateMutability: 'nonpayable',
    inputs: [requestInput, signatureInput, {
      name: 'permitSignature', type: 'tuple', components: [
        { name: 'deadline', type: 'uint256' }, { name: 'v', type: 'uint8' },
        { name: 'r', type: 'bytes32' }, { name: 's', type: 'bytes32' },
      ],
    }], outputs: [],
  },
  {
    type: 'function', name: 'hashRepaymentRequest', stateMutability: 'view',
    inputs: [requestInput], outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function', name: 'repaymentNonces', stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }], outputs: uintOutput,
  },
] as const;
