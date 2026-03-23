import { recoverMessageAddress } from "viem";

import {
  DEFAULT_ORACLE_PROOF_AUTH_TTL,
  buildOracleProofAuthorizationDigest
} from "./oracleCriteria.js";

function normalizeUrl(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.replace(/\/$/, "");
}

function normalizeAddress(value) {
  const trimmed = String(value ?? "").trim();
  return /^0x[a-fA-F0-9]{40}$/.test(trimmed) ? trimmed : "";
}

async function signWalletAuthorization({
  badgeRegistryAddress,
  chainId,
  definitionId,
  walletAddress,
  criteriaHash,
  account,
  walletClient
}) {
  const normalizedWallet = normalizeAddress(walletAddress);
  const normalizedAccount = normalizeAddress(account);

  if (!normalizedWallet || normalizedWallet !== normalizedAccount) {
    throw new Error("Oracle proof requests require each authorized wallet to sign for itself.");
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + DEFAULT_ORACLE_PROOF_AUTH_TTL;
  const digest = buildOracleProofAuthorizationDigest({
    badgeRegistryAddress,
    chainId,
    definitionId,
    walletAddress: normalizedWallet,
    criteriaHash,
    issuedAt,
    expiresAt
  });
  const signature = await walletClient.signMessage({
    account,
    message: {
      raw: digest
    }
  });
  const recovered = await recoverMessageAddress({
    message: {
      raw: digest
    },
    signature
  });
  if (normalizeAddress(recovered) !== normalizedWallet) {
    throw new Error("The connected wallet could not sign a valid oracle proof authorization.");
  }

  return {
    walletAddress: normalizedWallet,
    issuedAt,
    expiresAt,
    signature
  };
}

export async function requestOracleCriteriaProof({
  serviceUrl,
  badgeRegistryAddress,
  chainId,
  definitionId,
  agent,
  criteriaHash,
  account,
  walletClient,
  linkedWallets = []
}) {
  const normalizedServiceUrl = normalizeUrl(serviceUrl);
  const normalizedAgent = normalizeAddress(agent);
  const normalizedAccount = normalizeAddress(account);

  if (!normalizedServiceUrl) {
    throw new Error("Add an oracle proof service URL before claiming this badge.");
  }
  if (!normalizedAgent || normalizedAgent !== normalizedAccount) {
    throw new Error("Oracle-backed badges only support the connected wallet claiming for itself.");
  }

  const authorization = await signWalletAuthorization({
    badgeRegistryAddress,
    chainId,
    definitionId,
    walletAddress: normalizedAgent,
    criteriaHash,
    account,
    walletClient
  });

  const linkedAuthorizations = [];
  for (const linkedWallet of Array.isArray(linkedWallets) ? linkedWallets : []) {
    const walletAddress = normalizeAddress(
      linkedWallet?.walletAddress ?? linkedWallet?.account ?? linkedWallet?.address
    );
    if (!walletAddress || walletAddress === normalizedAgent) {
      continue;
    }
    if (!linkedWallet?.walletClient || !linkedWallet?.account) {
      throw new Error(`Connect ${linkedWallet?.label ?? "the linked wallet"} to include it in the proof request.`);
    }

    linkedAuthorizations.push(
      await signWalletAuthorization({
        badgeRegistryAddress,
        chainId,
        definitionId,
        walletAddress,
        criteriaHash,
        account: linkedWallet.account,
        walletClient: linkedWallet.walletClient
      })
    );
  }

  const response = await fetch(normalizedServiceUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      badgeRegistryAddress,
      chainId: Number(chainId),
      definitionId: Number(definitionId),
      agent: normalizedAgent,
      authorization,
      linkedAuthorizations
    })
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(payload?.detail || `Oracle proof request failed with ${response.status}.`);
  }

  if (!payload?.proofPackage || typeof payload.proofPackage !== "object") {
    throw new Error("The oracle proof service did not return a valid 8183 proof package.");
  }

  return payload;
}
