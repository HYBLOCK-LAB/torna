/** Protocol event wire format. Declarations do not imply these operations exist yet. */
export const tornaEvents = [
  {
    "type": "event",
    "name": "IssuerRegistered",
    "inputs": [
      {
        "name": "issuer",
        "type": "address",
        "indexed": true
      },
      {
        "name": "acquirerHash",
        "type": "bytes32",
        "indexed": false
      },
      {
        "name": "name",
        "type": "string",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "CollateralDeposited",
    "inputs": [
      {
        "name": "issuer",
        "type": "address",
        "indexed": true
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "IssuerMarginCall",
    "inputs": [
      {
        "name": "issuer",
        "type": "address",
        "indexed": true
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "IssuerSuspended",
    "inputs": [
      {
        "name": "issuer",
        "type": "address",
        "indexed": true
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "AdvanceIssued",
    "inputs": [
      {
        "name": "refundKey",
        "type": "bytes32",
        "indexed": true
      },
      {
        "name": "issuer",
        "type": "address",
        "indexed": true
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "maturity",
        "type": "uint64",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "AdvanceRejected",
    "inputs": [
      {
        "name": "refundKey",
        "type": "bytes32",
        "indexed": true
      },
      {
        "name": "reason",
        "type": "uint8",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "AdvanceRepaid",
    "inputs": [
      {
        "name": "refundKey",
        "type": "bytes32",
        "indexed": true
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "MarkedOverdue",
    "inputs": [
      {
        "name": "refundKey",
        "type": "bytes32",
        "indexed": true
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ReviewOpened",
    "inputs": [
      {
        "name": "refundKey",
        "type": "bytes32",
        "indexed": true
      },
      {
        "name": "evidence",
        "type": "string",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "CoveredLossFinalized",
    "inputs": [
      {
        "name": "refundKey",
        "type": "bytes32",
        "indexed": true
      },
      {
        "name": "coverage",
        "type": "uint256",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "CorrelatedExposureFlagged",
    "inputs": [
      {
        "name": "acquirerHash",
        "type": "bytes32",
        "indexed": true
      },
      {
        "name": "principal",
        "type": "uint256",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "LossCapTriggered",
    "inputs": [
      {
        "name": "acquirerHash",
        "type": "bytes32",
        "indexed": true
      },
      {
        "name": "cap",
        "type": "uint256",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RecoveryRecorded",
    "inputs": [
      {
        "name": "refundKey",
        "type": "bytes32",
        "indexed": true
      },
      {
        "name": "recovered",
        "type": "uint256",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "LiquidityDeposited",
    "inputs": [
      {
        "name": "lp",
        "type": "address",
        "indexed": true
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "DepositRejected",
    "inputs": [
      {
        "name": "lp",
        "type": "address",
        "indexed": true
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false
      },
      {
        "name": "reason",
        "type": "uint8",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "WithdrawRequested",
    "inputs": [
      {
        "name": "lp",
        "type": "address",
        "indexed": true
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "WithdrawPaid",
    "inputs": [
      {
        "name": "lp",
        "type": "address",
        "indexed": true
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "WithdrawCompleted",
    "inputs": [
      {
        "name": "lp",
        "type": "address",
        "indexed": true
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "IdleDeployed",
    "inputs": [
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "IdleWithdrawFailed",
    "inputs": [
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "LedgerCreditConfirmed",
    "inputs": [
      {
        "name": "refundKey",
        "type": "bytes32",
        "indexed": true
      }
    ],
    "anonymous": false
  }
] as const;

export type TornaEventName = typeof tornaEvents[number]['name'];
