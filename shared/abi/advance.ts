import { advanceRequestTypes } from './eip712';

const requestInput = {
  name: 'request', type: 'tuple', components: advanceRequestTypes.AdvanceRequest,
} as const;
const signatureInput = { name: 'signature', type: 'bytes' } as const;
const uintOutput = [{ name: '', type: 'uint256' }] as const;

/** Implemented advance subset, checked against the compiled Torna artifact.
 * A successful receipt can contain AdvanceRejected. Require AdvanceIssued from Torna.
 * Sign the fee's token Permit separately; its value is quoteAdvanceFee(amount)[0].
 */
export const advanceAbi = [
  {
    type: 'function', name: 'advance', stateMutability: 'nonpayable',
    inputs: [requestInput, signatureInput], outputs: [{ name: 'issued', type: 'bool' }],
  },
  {
    type: 'function', name: 'advanceWithPermit', stateMutability: 'nonpayable',
    inputs: [requestInput, signatureInput, {
      name: 'permitSignature', type: 'tuple', components: [
        { name: 'deadline', type: 'uint256' }, { name: 'v', type: 'uint8' },
        { name: 'r', type: 'bytes32' }, { name: 's', type: 'bytes32' },
      ],
    }], outputs: [{ name: 'issued', type: 'bool' }],
  },
  {
    type: 'function', name: 'quoteAdvanceFee', stateMutability: 'pure',
    inputs: [{ name: 'amount', type: 'uint256' }], outputs: [
      { name: 'fee', type: 'uint256' }, { name: 'lpFee', type: 'uint256' },
      { name: 'reserveFee', type: 'uint256' }, { name: 'protocolFee', type: 'uint256' },
    ],
  },
  {
    type: 'function', name: 'advanceNonces', stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }], outputs: uintOutput,
  },
  {
    type: 'function', name: 'issuerOutstanding', stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }], outputs: uintOutput,
  },
  {
    type: 'function', name: 'acquirerOutstanding', stateMutability: 'view',
    inputs: [{ name: '', type: 'bytes32' }], outputs: uintOutput,
  },
  {
    type: 'function', name: 'issuerLimit', stateMutability: 'view',
    inputs: [{ name: 'issuer', type: 'address' }], outputs: uintOutput,
  },
  {
    type: 'function', name: 'issuerStateOf', stateMutability: 'view',
    inputs: [{ name: 'issuer', type: 'address' }], outputs: [{ name: '', type: 'uint8' }],
  },
  {
    type: 'function', name: 'positionOf', stateMutability: 'view',
    inputs: [{ name: 'refundKey', type: 'bytes32' }], outputs: [{
      name: '', type: 'tuple', components: [
        { name: 'exists', type: 'bool' }, { name: 'issuer', type: 'address' },
        { name: 'acquirerHash', type: 'bytes32' }, { name: 'amount', type: 'uint256' },
        { name: 'fee', type: 'uint256' }, { name: 'issuerMargin', type: 'uint256' },
        { name: 'poolCoverage', type: 'uint256' }, { name: 'maturity', type: 'uint64' },
        { name: 'termsVersion', type: 'uint32' }, { name: 'state', type: 'uint8' },
      ],
    }],
  },
  ...([
    'poolCapacity', 'poolCash', 'totalOutstanding', 'totalLpFees', 'reserveBalance',
    'protocolFees', 'totalAdvanceCount', 'totalAdvanced', 'registeredIssuerCount',
  ] as const).map(name => ({
    type: 'function', name, stateMutability: 'view', inputs: [], outputs: uintOutput,
  } as const)),
] as const;
