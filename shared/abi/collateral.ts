/** Gasless collateral action. Sign with tornaDomain(chainId, tornaAddress) from eip712.ts. */
export const COLLATERAL_DEPOSIT_PRIMARY_TYPE = 'CollateralDepositRequest';
export const COLLATERAL_DEPOSIT_TYPE =
  'CollateralDepositRequest(address issuer,uint256 amount,uint256 nonce,uint256 deadline)';
export const collateralDepositTypes = {
  CollateralDepositRequest: [
    { name: 'issuer', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

export interface CollateralDepositRequest {
  issuer: `0x${string}`;
  amount: bigint;
  /** Read Torna.collateralDepositNonces(issuer), NOT token.nonces(issuer). */
  nonce: bigint;
  deadline: bigint;
}

export interface PermitSignature {
  deadline: bigint;
  v: number;
  r: `0x${string}`;
  s: `0x${string}`;
}

const requestInput = {
  name: 'request', type: 'tuple', components: collateralDepositTypes.CollateralDepositRequest,
} as const;
const signatureInput = { name: 'signature', type: 'bytes' } as const;

/** Implemented deposit subset; tested against the compiled Torna ABI. */
export const collateralAbi = [
  {
    type: 'function', name: 'depositCollateral', stateMutability: 'nonpayable',
    inputs: [requestInput, signatureInput], outputs: [],
  },
  {
    type: 'function', name: 'depositCollateralWithPermit', stateMutability: 'nonpayable',
    inputs: [requestInput, signatureInput, {
      name: 'permitSignature', type: 'tuple', components: [
        { name: 'deadline', type: 'uint256' }, { name: 'v', type: 'uint8' },
        { name: 'r', type: 'bytes32' }, { name: 's', type: 'bytes32' },
      ],
    }], outputs: [],
  },
  {
    type: 'function', name: 'hashCollateralDeposit', stateMutability: 'view',
    inputs: [requestInput], outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function', name: 'collateralOf', stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }], outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function', name: 'collateralDepositNonces', stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }], outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function', name: 'totalCollateral', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }],
  },
] as const;
