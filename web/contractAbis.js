export const badgeAssetRegistryAbi = [
  {
    type: "function",
    name: "getAsset",
    stateMutability: "view",
    inputs: [{ name: "assetId", type: "uint256" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "id", type: "uint256" },
          { name: "videoUri", type: "string" },
          { name: "posterUri", type: "string" },
          { name: "detailUri", type: "string" },
          { name: "videoHash", type: "bytes32" },
          { name: "posterHash", type: "bytes32" },
          { name: "edition", type: "string" },
          { name: "loopSeconds", type: "uint32" },
          { name: "creator", type: "address" },
          { name: "createdAt", type: "uint64" },
          { name: "updatedAt", type: "uint64" },
          { name: "active", type: "bool" }
        ]
      }
    ]
  },
  {
    type: "function",
    name: "registerAsset",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "input",
        type: "tuple",
        components: [
          { name: "videoUri", type: "string" },
          { name: "posterUri", type: "string" },
          { name: "detailUri", type: "string" },
          { name: "videoHash", type: "bytes32" },
          { name: "posterHash", type: "bytes32" },
          { name: "edition", type: "string" },
          { name: "loopSeconds", type: "uint32" }
        ]
      }
    ],
    outputs: [{ name: "assetId", type: "uint256" }]
  },
  {
    type: "function",
    name: "updateAsset",
    stateMutability: "nonpayable",
    inputs: [
      { name: "assetId", type: "uint256" },
      {
        name: "input",
        type: "tuple",
        components: [
          { name: "videoUri", type: "string" },
          { name: "posterUri", type: "string" },
          { name: "detailUri", type: "string" },
          { name: "videoHash", type: "bytes32" },
          { name: "posterHash", type: "bytes32" },
          { name: "edition", type: "string" },
          { name: "loopSeconds", type: "uint32" }
        ]
      }
    ],
    outputs: []
  },
  {
    type: "event",
    name: "AssetRegistered",
    anonymous: false,
    inputs: [
      { name: "assetId", type: "uint256", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "videoUri", type: "string", indexed: false },
      { name: "videoHash", type: "bytes32", indexed: false }
    ]
  }
];

export const agenticBadgeRegistryAbi = [
  {
    type: "function",
    name: "assetRegistry",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  },
  {
    type: "function",
    name: "reputationRegistry",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  },
  {
    type: "function",
    name: "identityRegistry",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  },
  {
    type: "function",
    name: "claimPageBaseUri",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }]
  },
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }]
  },
  {
    type: "function",
    name: "attestors",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "function",
    name: "nextDefinitionId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "function",
    name: "definitions",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "id", type: "uint256" },
      { name: "name", type: "string" },
      { name: "description", type: "string" },
      { name: "assetId", type: "uint256" },
      { name: "badgeType", type: "uint8" },
      { name: "verificationType", type: "uint8" },
      { name: "verificationData", type: "bytes" },
      { name: "creator", type: "address" },
      { name: "maxClaims", type: "uint256" },
      { name: "claimCount", type: "uint256" },
      { name: "expiresAt", type: "uint64" },
      { name: "active", type: "bool" },
      { name: "advancedPolicy", type: "bytes" }
    ]
  },
  {
    type: "function",
    name: "claimURI",
    stateMutability: "view",
    inputs: [
      { name: "agent", type: "address" },
      { name: "defId", type: "uint256" }
    ],
    outputs: [{ name: "", type: "string" }]
  },
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [
      { name: "defId", type: "uint256" },
      { name: "proof", type: "bytes" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "defineBadge",
    stateMutability: "nonpayable",
    inputs: [
      { name: "name", type: "string" },
      { name: "description", type: "string" },
      { name: "assetId", type: "uint256" },
      { name: "badgeType", type: "uint8" },
      { name: "verificationType", type: "uint8" },
      { name: "verificationData", type: "bytes" },
      { name: "maxClaims", type: "uint256" },
      { name: "expiresAt", type: "uint64" },
      { name: "advancedPolicy", type: "bytes" }
    ],
    outputs: [{ name: "defId", type: "uint256" }]
  },
  {
    type: "function",
    name: "updateBadgeVerification",
    stateMutability: "nonpayable",
    inputs: [
      { name: "defId", type: "uint256" },
      { name: "verificationType", type: "uint8" },
      { name: "verificationData", type: "bytes" },
      { name: "advancedPolicy", type: "bytes" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "setAttestor",
    stateMutability: "nonpayable",
    inputs: [
      { name: "attestor", type: "address" },
      { name: "authorized", type: "bool" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "setClaimPageBaseUri",
    stateMutability: "nonpayable",
    inputs: [{ name: "claimPageBaseUriValue", type: "string" }],
    outputs: []
  },
  {
    type: "function",
    name: "attestAndRecord",
    stateMutability: "nonpayable",
    inputs: [
      { name: "defId", type: "uint256" },
      { name: "agent", type: "address" }
    ],
    outputs: []
  },
  {
    type: "event",
    name: "BadgeDefined",
    anonymous: false,
    inputs: [
      { name: "defId", type: "uint256", indexed: true },
      { name: "assetId", type: "uint256", indexed: true },
      { name: "name", type: "string", indexed: false },
      { name: "badgeType", type: "uint8", indexed: false },
      { name: "creator", type: "address", indexed: false }
    ]
  },
  {
    type: "event",
    name: "BadgeVerificationUpdated",
    anonymous: false,
    inputs: [
      { name: "defId", type: "uint256", indexed: true },
      { name: "verificationType", type: "uint8", indexed: false }
    ]
  },
  {
    type: "event",
    name: "BadgeClaimed",
    anonymous: false,
    inputs: [
      { name: "defId", type: "uint256", indexed: true },
      { name: "agent", type: "address", indexed: true },
      { name: "verificationType", type: "uint8", indexed: false },
      { name: "proofHash", type: "bytes32", indexed: false }
    ]
  },
  {
    type: "event",
    name: "AdvancedEvidenceVerified",
    anonymous: false,
    inputs: [
      { name: "defId", type: "uint256", indexed: true },
      { name: "agent", type: "address", indexed: true },
      { name: "proofHash", type: "bytes32", indexed: true },
      { name: "issuer", type: "address", indexed: false },
      { name: "contextId", type: "bytes32", indexed: false },
      { name: "expiresAt", type: "uint64", indexed: false },
      { name: "nonceHash", type: "bytes32", indexed: false }
    ]
  }
];

export const reputationRegistryAbi = [
  {
    type: "function",
    name: "getSummary",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [
      { name: "count", type: "uint256" },
      { name: "summaryValue", type: "uint256" },
      { name: "lastUpdatedAt", type: "uint256" }
    ]
  }
];

export const identityRegistryAbi = [
  {
    type: "function",
    name: "registerSelf",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: []
  },
  {
    type: "function",
    name: "isRegistered",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ name: "", type: "bool" }]
  },
  {
    type: "function",
    name: "getAgentWallet",
    stateMutability: "view",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [{ name: "wallet", type: "address" }]
  }
];
