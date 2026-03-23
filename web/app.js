import {
  BADGE_TYPE_OPTIONS,
  VERIFICATION_TYPE_OPTIONS,
  DEFAULT_CREATOR,
  DEFAULT_AGENT,
  SAMPLE_PIN_OPTIONS,
  verificationTypeLabel,
  createEmptyRegistryState,
  clearRegistryState,
  ensureSeedRegistryState,
  saveRegistryState,
  definitionInputDefaults,
  createDefinition as createRegistryDefinition,
  issueClaim as issueRegistryClaim,
  assetDraftFromClaim,
  assetDraftFromVideoSource,
  badgeTypeLabel,
  shortAddress as shortStudioAddress
} from "./tempoClaimStudio.js";
import {
  MODE_OPTIONS,
  connectWallet as connectOnchainWallet,
  connectPaymentWallet,
  authorizeConnectedAttestor,
  defaultOnchainConfig,
  defineBadgeOnchain,
  isOnchainConfigured,
  issueBadgeClaimOnchain,
  loadOnchainConfig,
  readOnchainRegistry,
  registerConnectedIdentity,
  resolvePaymentWalletSession,
  saveOnchainConfig,
  shortErrorMessage,
  syncWagmiConnections
} from "./onchainBadgeClient.js";
import {
  discoverInjectedWallets,
  FARCASTER_MINIAPP_WALLET_ID,
  findWalletById,
  getPreferredWalletId,
  isTempoChainId,
  LOCAL_DEV_WALLET_ID,
  walletOptionLabel
} from "./walletProviders.js";
import { mintClaimViaMpp } from "./mppMintClient.js";
import {
  advancedPolicyDefaults,
  DEFAULT_AGENT_8183_SCHEMA,
  DEFAULT_FARCASTER_8183_SCHEMA,
  DEFAULT_INTERNAL_SERVICE_ACTIVITY_8183_SCHEMA,
  DEFAULT_ORACLE_8183_SCHEMA,
  DEFAULT_PAYMENT_8183_SCHEMA,
  DEFAULT_PORTFOLIO_STATE_8183_SCHEMA,
  DEFAULT_PROTOCOL_ACTIVITY_8183_SCHEMA,
  DEFAULT_WALLET_AGE_8183_SCHEMA,
  DEFAULT_X402_8183_SCHEMA,
  isAgent8183PolicyEnabled,
  isOracle8183PolicyEnabled,
  summarizeAdvancedPolicy
} from "./badgePolicies.js";
import { isReusableOracleAdapter } from "./oracleCriteria.js";
import {
  connectFarcaster,
  describeFarcasterSession,
  getFarcasterSession,
  openFarcasterClaim,
  prepareFarcasterConnect,
  signFarcasterManifest
} from "./farcasterConnect.js";
import {
  formatFarcasterCriteriaRequirement,
  matchesFarcasterCriteria
} from "./farcasterCriteria.js";
import {
  installInteractionFeedback,
  noteInteractionStatus,
  playClaimReadyCue,
  playLookupPositiveCue
} from "./feedback.js";
import {
  LOCAL_DEV_ACCOUNT,
  PAYMENT_HISTORY_IDENTITY_MODE_OPTIONS,
  PAYMENT_HISTORY_METRIC_OPTIONS,
  PAYMENT_HISTORY_RAIL_MODE_OPTIONS,
  UNLOCK_ADAPTER_OPTIONS,
  X402_IDENTITY_MODE_OPTIONS,
  X402_METRIC_OPTIONS,
  buildUnlockAdapterPayload,
  decodeUnlockAdapterConfig,
  parseAgentAttestationProofPackage,
  parseOracleEventProofPackage,
  summarizeUnlockAdapter,
  unlockAdapterDefaults,
  verificationTypeForAdapter
} from "./unlockAdapters.js";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

const SAMPLE_CLAIM_URL = "/claims/trailblazer-loop-claim.json";

const usePin1Button = document.querySelector("#use-pin-1");
const usePin2Button = document.querySelector("#use-pin-2");
const loadClaimButton = document.querySelector("#load-claim");
const useSampleClaimButton = document.querySelector("#use-sample-claim");
const loadVideoButton = document.querySelector("#load-video");
const claimUploadInput = document.querySelector("#claim-upload");
const videoUploadInput = document.querySelector("#video-upload");
const assetStatus = document.querySelector("#asset-status");
const badgeWallStage = document.querySelector("#badge-wall-stage");
const previewTitle = document.querySelector("#preview-title");
const previewMeta = document.querySelector("#preview-meta");
const showBadgeWallButton = document.querySelector("#show-badge-wall");
const pinVideo = document.querySelector("#pin-video");
const pinPoster = document.querySelector("#pin-poster");
const openClaimAssistantButton = document.querySelector("#open-claim-assistant");
const claimAssistantModal = document.querySelector("#claim-assistant-modal");
const claimAssistantBackdrop = document.querySelector("#claim-assistant-backdrop");
const closeClaimAssistantButton = document.querySelector("#close-claim-assistant");
const claimAssistantConnectButton = document.querySelector("#claim-assistant-connect");
const claimAssistantFarcasterButton = document.querySelector("#claim-assistant-farcaster");
const claimAssistantUseConnectedButton = document.querySelector("#claim-assistant-use-connected");
const claimAssistantOpenProfileButton = document.querySelector("#claim-assistant-open-profile");
const claimAssistantForm = document.querySelector("#claim-assistant-form");
const claimAssistantInput = document.querySelector("#claim-assistant-input");
const claimAssistantStatus = document.querySelector("#claim-assistant-status");
const claimAssistantManifestSection = document.querySelector("#claim-assistant-manifest");
const claimAssistantSignManifestButton = document.querySelector("#claim-assistant-sign-manifest");
const claimAssistantCopyManifestCommandButton = document.querySelector(
  "#claim-assistant-copy-manifest-command"
);
const claimAssistantManifestOutput = document.querySelector("#claim-assistant-manifest-output");
const claimAssistantManifestCommand = document.querySelector("#claim-assistant-manifest-command");
const claimAssistantManifestHeader = document.querySelector("#claim-assistant-manifest-header");
const claimAssistantManifestPayload = document.querySelector("#claim-assistant-manifest-payload");
const claimAssistantManifestSignature = document.querySelector("#claim-assistant-manifest-signature");
const claimAssistantManifestDebug = document.querySelector("#claim-assistant-manifest-debug");
const claimAssistantManifestDebugOutput = document.querySelector(
  "#claim-assistant-manifest-debug-output"
);
const claimAssistantSummaryTitle = document.querySelector("#claim-assistant-summary-title");
const claimAssistantSummarySubtitle = document.querySelector("#claim-assistant-summary-subtitle");
const claimAssistantChipList = document.querySelector("#claim-assistant-chip-list");
const claimAssistantOutlook = document.querySelector("#claim-assistant-outlook");
const claimAssistantNext = document.querySelector("#claim-assistant-next");
const profileSurface = document.querySelector(".profile-surface");
const detailSurface = document.querySelector(".detail-surface");
const profileHeading = document.querySelector("#profile-heading");
const profileSummary = document.querySelector("#profile-summary");
const profileChipList = document.querySelector("#profile-chip-list");
const profileOverviewTitle = document.querySelector("#profile-overview-title");
const profileOverviewLines = document.querySelector("#profile-overview-lines");
const profileBadgeTitle = document.querySelector("#profile-badge-title");
const profileBadgeClaims = document.querySelector("#profile-badge-claims");
const profileRecentTitle = document.querySelector("#profile-recent-title");
const profileRecentClaims = document.querySelector("#profile-recent-claims");
const profileNeighborTitle = document.querySelector("#profile-neighbor-title");
const profileNeighborList = document.querySelector("#profile-neighbor-list");
const detailHeading = document.querySelector("#detail-heading");
const detailDescription = document.querySelector("#detail-description");
const detailChipList = document.querySelector("#detail-chip-list");
const detailUnlockTitle = document.querySelector("#detail-unlock-title");
const detailUnlockSummary = document.querySelector("#detail-unlock-summary");
const detailUnlockLines = document.querySelector("#detail-unlock-lines");
const detailRecordTitle = document.querySelector("#detail-record-title");
const detailRecordLines = document.querySelector("#detail-record-lines");
const detailRelatedBadgeTitle = document.querySelector("#detail-related-badge-title");
const detailRelatedBadgeClaims = document.querySelector("#detail-related-badge-claims");
const detailRelatedAgentTitle = document.querySelector("#detail-related-agent-title");
const detailRelatedAgentClaims = document.querySelector("#detail-related-agent-claims");

const definitionCount = document.querySelector("#definition-count");
const claimCount = document.querySelector("#claim-count");
const definitionForm = document.querySelector("#definition-form");
const definitionNameInput = document.querySelector("#definition-name");
const definitionDescriptionInput = document.querySelector("#definition-description");
const definitionCreatorInput = document.querySelector("#definition-creator");
const definitionBadgeTypeSelect = document.querySelector("#definition-badge-type");
const definitionVerificationTypeSelect = document.querySelector("#definition-verification-type");
const definitionUnlockAdapterSelect = document.querySelector("#definition-unlock-adapter");
const definitionUnlockTargetInput = document.querySelector("#definition-unlock-target");
const definitionUnlockThresholdInput = document.querySelector("#definition-unlock-threshold");
const definitionUnlockSignerInput = document.querySelector("#definition-unlock-signer");
const definitionUnlockNoteInput = document.querySelector("#definition-unlock-note");
const definitionOraclePanel = document.querySelector("#definition-oracle-panel");
const definitionOracleCriteriaInput = document.querySelector("#definition-oracle-criteria");
const definitionX402Panel = document.querySelector("#definition-x402-panel");
const definitionX402MetricSelect = document.querySelector("#definition-x402-metric");
const definitionX402RailModeSelect = document.querySelector("#definition-x402-rail-mode");
const definitionX402OriginsInput = document.querySelector("#definition-x402-origins");
const definitionX402WindowDaysInput = document.querySelector("#definition-x402-window-days");
const definitionX402IdentityModeSelect = document.querySelector("#definition-x402-identity-mode");
const definitionAdvancedEnabledInput = document.querySelector("#definition-advanced-enabled");
const definitionAdvancedPanel = document.querySelector("#definition-advanced-panel");
const definitionAdvancedNote = document.querySelector("#definition-advanced-note");
const definitionAdvancedContextInput = document.querySelector("#definition-advanced-context");
const definitionAdvancedSchemaInput = document.querySelector("#definition-advanced-schema");
const definitionAdvancedIssuerInput = document.querySelector("#definition-advanced-issuer");
const definitionAdvancedMaxAgeInput = document.querySelector("#definition-advanced-max-age");
const definitionAdvancedNonceScopeSelect = document.querySelector("#definition-advanced-nonce-scope");
const definitionAdvancedRequireExpiryInput = document.querySelector(
  "#definition-advanced-require-expiry"
);
const definitionMaxClaimsInput = document.querySelector("#definition-max-claims");
const definitionAssetIdInput = document.querySelector("#definition-asset-id");
const definitionVideoUriInput = document.querySelector("#definition-video-uri");
const definitionPosterUriInput = document.querySelector("#definition-poster-uri");
const definitionDetailUriInput = document.querySelector("#definition-detail-uri");
const definitionEditionInput = document.querySelector("#definition-edition");
const definitionLoopSecondsInput = document.querySelector("#definition-loop-seconds");
const definitionVideoHashInput = document.querySelector("#definition-video-hash");
const definitionPosterHashInput = document.querySelector("#definition-poster-hash");
const definitionStatus = document.querySelector("#definition-status");
const definitionList = document.querySelector("#definition-list");
const prefillPin1Button = document.querySelector("#prefill-pin-1");
const prefillPin2Button = document.querySelector("#prefill-pin-2");
const pullCurrentAssetButton = document.querySelector("#pull-current-asset");

const claimForm = document.querySelector("#claim-form");
const claimDefinitionSelect = document.querySelector("#claim-definition");
const claimAgentInput = document.querySelector("#claim-agent");
const claimProofNoteInput = document.querySelector("#claim-proof-note");
const claimIssuedByInput = document.querySelector("#claim-issued-by");
const claimExecutionPathSelect = document.querySelector("#claim-execution-path");
const claimProofPackageInput = document.querySelector("#claim-proof-package");
const claimUseConnectedWalletButton = document.querySelector("#claim-use-connected-wallet");
const loadLocalEventProofButton = document.querySelector("#load-local-event-proof");
const clearProofPackageButton = document.querySelector("#clear-proof-package");
const claimStatus = document.querySelector("#claim-status");
const claimProofStatus = document.querySelector("#claim-proof-status");
const claimUriOutput = document.querySelector("#claim-uri-output");
const claimShareUrlOutput = document.querySelector("#claim-share-url-output");
const claimReputationOutput = document.querySelector("#claim-reputation-output");
const claimEvidenceOutput = document.querySelector("#claim-evidence-output");
const claimJsonOutput = document.querySelector("#claim-json-output");
const copyClaimUriButton = document.querySelector("#copy-claim-uri");
const copyShareLinkButton = document.querySelector("#copy-share-link");
const copyProfileLinkButton = document.querySelector("#copy-profile-link");
const openSharePageButton = document.querySelector("#open-share-page");
const openProfilePageButton = document.querySelector("#open-profile-page");
const downloadClaimJsonButton = document.querySelector("#download-claim-json");
const openLatestClaimButton = document.querySelector("#open-latest-claim");
const resultOperationOutput = document.querySelector("#result-operation-output");
const resultSummaryOutput = document.querySelector("#result-summary-output");
const resultPrimaryTxOutput = document.querySelector("#result-primary-tx-output");
const resultSecondaryTxOutput = document.querySelector("#result-secondary-tx-output");
const resultAssetIdOutput = document.querySelector("#result-asset-id-output");
const resultDefinitionIdOutput = document.querySelector("#result-definition-id-output");
const resultShareUrlOutput = document.querySelector("#result-share-url-output");
const resultClaimUriOutput = document.querySelector("#result-claim-uri-output");
const copyResultPrimaryTxButton = document.querySelector("#copy-result-primary-tx");
const copyResultSecondaryTxButton = document.querySelector("#copy-result-secondary-tx");
const copyResultShareLinkButton = document.querySelector("#copy-result-share-link");
const openResultShareLinkButton = document.querySelector("#open-result-share-link");
const clearResultOutputButton = document.querySelector("#clear-result-output");
const galleryFilterInput = document.querySelector("#gallery-filter");
const galleryScopeSelect = document.querySelector("#gallery-scope");
const gallerySortSelect = document.querySelector("#gallery-sort");
const galleryVisibleCount = document.querySelector("#gallery-visible-count");
const galleryAgentCount = document.querySelector("#gallery-agent-count");
const clearGalleryFiltersButton = document.querySelector("#clear-gallery-filters");
const clearAgentFilterButton = document.querySelector("#clear-agent-filter");
const badgeGridStatus = document.querySelector("#badge-grid-status");
const badgeGrid = document.querySelector("#badge-grid");
const agentShelf = document.querySelector("#agent-shelf");
const galleryStatus = document.querySelector("#gallery-status");
const claimGallery = document.querySelector("#claim-gallery");
const resetRegistryButton = document.querySelector("#reset-registry");

const connectionModeSelect = document.querySelector("#connection-mode");
const connectionChainIdInput = document.querySelector("#connection-chain-id");
const connectionRpcUrlInput = document.querySelector("#connection-rpc-url");
const connectionDeploymentInput = document.querySelector("#connection-deployment-url");
const connectionBadgeRegistryInput = document.querySelector("#connection-badge-registry");
const connectionWalletProviderSelect = document.querySelector("#connection-wallet-provider");
const connectionAssetRegistryInput = document.querySelector("#connection-asset-registry");
const connectionIdentityRegistryInput = document.querySelector("#connection-identity-registry");
const connectionBalanceTokenInput = document.querySelector("#connection-balance-token");
const connectionWalletInput = document.querySelector("#connection-wallet");
const connectionOwnerInput = document.querySelector("#connection-owner");
const connectionWalletRoleInput = document.querySelector("#connection-wallet-role");
const connectionAttestorInput = document.querySelector("#connection-attestor");
const connectionIdentityStatusInput = document.querySelector("#connection-identity-status");
const connectionMppWalletProviderSelect = document.querySelector("#connection-mpp-wallet-provider");
const connectionMppWalletInput = document.querySelector("#connection-mpp-wallet");
const connectionMppServiceInput = document.querySelector("#connection-mpp-service");
const connectionOracleServiceInput = document.querySelector("#connection-oracle-service");
const connectionX402ServiceInput = document.querySelector("#connection-x402-service");
const connectionFarcasterServiceInput = document.querySelector("#connection-farcaster-service");
const connectionMppPriceInput = document.querySelector("#connection-mpp-price");
const connectionStatus = document.querySelector("#connection-status");
const walletDiagnosticsSummary = document.querySelector("#wallet-diagnostics-summary");
const walletDiagnosticsDetected = document.querySelector("#wallet-diagnostics-detected");
const walletDiagnosticsSession = document.querySelector("#wallet-diagnostics-session");
const saveConnectionButton = document.querySelector("#save-connection");
const loadDeploymentButton = document.querySelector("#load-deployment");
const useLocalDeploymentButton = document.querySelector("#use-local-deployment");
const refreshWalletsButton = document.querySelector("#refresh-wallets");
const connectWalletButton = document.querySelector("#connect-wallet");
const connectMppWalletButton = document.querySelector("#connect-mpp-wallet");
const refreshChainButton = document.querySelector("#refresh-chain");
const registerIdentityButton = document.querySelector("#register-identity");
const authorizeAttestorButton = document.querySelector("#authorize-attestor");
const mintViaMppButton = document.querySelector("#mint-via-mpp");
const operatorStatus = document.querySelector("#operator-status");
const operatorHealthList = document.querySelector("#operator-health-list");
const operatorDecisionList = document.querySelector("#operator-decision-list");
const refreshOperatorButton = document.querySelector("#refresh-operator");

let registryState = createEmptyRegistryState();
let latestClaimEntry = null;
let latestOperationResult = null;
let selectedGalleryClaimId = 0;
let onchainConfig = defaultOnchainConfig();
let availableWallets = [];
let currentSource = null;
let currentObjectUrl = "";
let selectedShelfAgent = "";
let selectedProfileAgent = "";
let detailModeActive = false;
let galleryUiState = {
  loading: false,
  errorMessage: ""
};
let x402OperatorState = {
  loading: false,
  health: null,
  decisions: [],
  errorMessage: ""
};
let claimAssistantState = {
  isOpen: false,
  loading: false,
  resolvedAgent: "",
  resolvedLabel: "",
  selfConnected: false,
  snapshot: null
};
let farcasterManifestState = {
  loading: false,
  command: "",
  header: "",
  payload: "",
  signature: "",
  debug: ""
};
const BADGE_GRID_MIN_SLOTS = 16;
const SAMPLE_PIN_LOOKUP = new Map(SAMPLE_PIN_OPTIONS.map((entry) => [entry.id, entry]));
const RANDOMIZED_BADGE_PIN_ORDER = createShuffledPinOrder(
  SAMPLE_PIN_OPTIONS.map((entry) => entry.id)
);
const RANDOMIZED_BADGE_PIN_INDEX = new Map(
  RANDOMIZED_BADGE_PIN_ORDER.map((pinId, index) => [pinId, index])
);
const DEFAULT_LIVE_DEPLOYMENT_URL = "/networks/tempo-moderato.json";
const ensPublicClient = createPublicClient({
  chain: mainnet,
  transport: http("https://eth.llamarpc.com")
});
let previewSourceVersion = 0;
let cardVideoObserver = null;

installInteractionFeedback();

function createShuffledPinOrder(pinIds = []) {
  const shuffled = [...pinIds];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

function basename(value) {
  try {
    const url = new URL(value, window.location.href);
    const path = url.pathname.split("/").filter(Boolean).pop();
    return path || "pin.mp4";
  } catch {
    return value.split("/").filter(Boolean).pop() || "pin.mp4";
  }
}

function normalizeBaseUrl(baseUrl) {
  try {
    return new URL(baseUrl, window.location.href).toString();
  } catch {
    return window.location.href;
  }
}

function resolveAssetUri(baseUrl, value) {
  if (!value) {
    return "";
  }

  return new URL(value, normalizeBaseUrl(baseUrl)).toString();
}

function normalizeSamplePinId(value) {
  const normalized = value?.trim?.() ?? "";
  return SAMPLE_PIN_LOOKUP.has(normalized) ? normalized : SAMPLE_PIN_OPTIONS[0]?.id || "pin1";
}

function getSamplePinOption(pinId) {
  return SAMPLE_PIN_LOOKUP.get(normalizeSamplePinId(pinId)) ?? SAMPLE_PIN_OPTIONS[0] ?? null;
}

function findSamplePinOption(pinId) {
  const normalized = String(pinId ?? "").trim();
  return normalized ? SAMPLE_PIN_LOOKUP.get(normalized) ?? null : null;
}

function getCatalogEntryForDefinition(definition = {}) {
  const directMatch = findSamplePinOption(definition.samplePinId);
  if (directMatch?.catalog) {
    return directMatch.catalog;
  }

  const asset = definition.asset ?? {};
  return (
    SAMPLE_PIN_OPTIONS.find((option) =>
      assetMatchesPin(
        {
          posterUri: asset.posterUri ?? "",
          videoUri: asset.videoUri ?? ""
        },
        option
      )
    )?.catalog ?? null
  );
}

function assetMatchesPin({ posterUri = "", videoUri = "" } = {}, pinOption) {
  if (!pinOption?.asset) {
    return false;
  }

  const pinPoster = basename(pinOption.asset.posterUri || "");
  const pinVideo = basename(pinOption.asset.videoUri || "");
  const matchesPoster = posterUri ? basename(posterUri) === pinPoster : false;
  const matchesVideo = videoUri && pinVideo ? basename(videoUri) === pinVideo : false;
  return matchesPoster || matchesVideo;
}

function decodeDataUriText(value) {
  const [, payload = ""] = value.split(",", 2);
  return new TextDecoder().decode(
    Uint8Array.from(window.atob(payload.replace(/ /g, "+")), (character) => character.charCodeAt(0))
  );
}

function encodeDataUriText(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return `data:application/json;base64,${window.btoa(binary)}`;
}

function parseJsonDocument(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Could not parse ${label}: ${error instanceof Error ? error.message : "invalid JSON"}`);
  }
}

function parseClaimDocument(text, label) {
  const trimmed = text.trim();
  const jsonText = trimmed.startsWith("data:") ? decodeDataUriText(trimmed) : trimmed;
  return parseJsonDocument(jsonText, label);
}

function setSupportStatus(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("is-error", isError);
  noteInteractionStatus(message, { isError });
}

function setAssetStatus(message, isError = false) {
  assetStatus.textContent = message;
  assetStatus.classList.toggle("is-error", isError);
  noteInteractionStatus(message, { isError });
}

function setDetailMode(isActive) {
  detailModeActive = Boolean(isActive);
  badgeWallStage?.classList.toggle("is-hidden", detailModeActive);
  if (showBadgeWallButton) {
    showBadgeWallButton.hidden = !detailModeActive;
  }
}

function scrollDetailViewToTop() {
  if (typeof window === "undefined") {
    return;
  }

  const scroll = () => {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "auto"
    });
  };

  scroll();
  requestAnimationFrame(scroll);
}

function enterDetailView(isActive = true, { scrollToTop = isActive } = {}) {
  setDetailMode(isActive);
  if (isActive && scrollToTop) {
    scrollDetailViewToTop();
  }
}

function shortAddress(value) {
  return shortStudioAddress(value);
}

function populateSelect(select, options) {
  select.innerHTML = options
    .map((option) => `<option value="${option.value}">${option.label}</option>`)
    .join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatDateTime(timestampSeconds) {
  if (!timestampSeconds) {
    return "Pending";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(timestampSeconds * 1000);
}

function toDownloadName(value) {
  const safe = String(value || "claim")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return safe || "claim";
}

function downloadBlob(blob, fileName) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(link.href);
  }, 0);
}

function parseMppPrice(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const amount = Number(trimmed);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Enter a valid positive MPP price.");
  }

  return amount;
}

function describeMppReceipt(receipt) {
  if (!receipt) {
    return "";
  }

  const amount =
    receipt.amount ??
    receipt.totalAmount ??
    receipt.paymentAmount ??
    receipt.value ??
    receipt.payment?.amount;
  const currency =
    receipt.currency ??
    receipt.asset ??
    receipt.paymentCurrency ??
    receipt.payment?.currency ??
    "PathUSD";

  return amount ? ` Paid ${amount} ${currency}.` : " Payment receipt captured.";
}

function resultValue(value) {
  return value === undefined || value === null ? "" : String(value);
}

function getLatestOperationShareUrl(result = latestOperationResult) {
  return result?.shareUrl ?? "";
}

function getLatestOperationPrimaryTx(result = latestOperationResult) {
  return result?.primaryTxHash ?? "";
}

function getLatestOperationSecondaryTx(result = latestOperationResult) {
  return result?.secondaryTxHash ?? "";
}

function resolveResultReceiptTxHash(receipt) {
  return (
    receipt?.txHash ??
    receipt?.transactionHash ??
    receipt?.payment?.txHash ??
    receipt?.payment?.transactionHash ??
    ""
  );
}

function resolveClaimShareUrl(claim) {
  return claim?.external_url ?? claim?.externalUrl ?? "";
}

function findClaimEntryByAgentAndDefinition(agent, definitionId) {
  const normalizedAgent = normalizeAgentValue(agent);
  const normalizedDefinitionId = Number(definitionId);
  return (
    registryState.claims.find(
      (entry) =>
        normalizeAgentValue(entry.agent) === normalizedAgent &&
        Number(entry.definitionId) === normalizedDefinitionId
    ) ?? null
  );
}

function setLatestOperationResult(result = null) {
  latestOperationResult = result
    ? {
        operation: resultValue(result.operation),
        summary: resultValue(result.summary),
        primaryTxHash: resultValue(result.primaryTxHash),
        secondaryTxHash: resultValue(result.secondaryTxHash),
        assetId: resultValue(result.assetId),
        definitionId: resultValue(result.definitionId),
        shareUrl: resultValue(result.shareUrl),
        claimUri: resultValue(result.claimUri)
      }
    : null;

  if (!resultOperationOutput) {
    return;
  }

  resultOperationOutput.value = latestOperationResult?.operation ?? "";
  resultSummaryOutput.value = latestOperationResult?.summary ?? "";
  resultPrimaryTxOutput.value = latestOperationResult?.primaryTxHash ?? "";
  resultSecondaryTxOutput.value = latestOperationResult?.secondaryTxHash ?? "";
  resultAssetIdOutput.value = latestOperationResult?.assetId ?? "";
  resultDefinitionIdOutput.value = latestOperationResult?.definitionId ?? "";
  resultShareUrlOutput.value = latestOperationResult?.shareUrl ?? "";
  resultClaimUriOutput.value = latestOperationResult?.claimUri ?? "";

  copyResultPrimaryTxButton.disabled = !getLatestOperationPrimaryTx();
  copyResultSecondaryTxButton.disabled = !getLatestOperationSecondaryTx();
  copyResultShareLinkButton.disabled = !getLatestOperationShareUrl();
  openResultShareLinkButton.disabled = !getLatestOperationShareUrl();
  clearResultOutputButton.disabled = !latestOperationResult;
}

function getDefinitionById(definitionId) {
  return registryState.definitions.find((entry) => entry.id === Number(definitionId)) ?? null;
}

function getClaimById(claimId) {
  return registryState.claims.find((entry) => entry.id === Number(claimId)) ?? null;
}

function getClaimByAgentAndDefinition(agent, definitionId) {
  const normalizedAgent = agent?.trim?.().toLowerCase?.() ?? "";
  const normalizedDefinitionId = Number(definitionId);

  return (
    registryState.claims.find(
      (entry) =>
        entry.definitionId === normalizedDefinitionId &&
        entry.agent.toLowerCase() === normalizedAgent
    ) ?? null
  );
}

function buildClaimPageUrl(baseUrl, agent, definitionId) {
  if (!baseUrl || !agent || !Number.isFinite(Number(definitionId))) {
    return "";
  }

  try {
    const url = new URL(baseUrl, window.location.href);
    url.searchParams.set("claimAgent", agent);
    url.searchParams.set("claimDef", String(Number(definitionId)));
    return url.toString();
  } catch {
    return "";
  }
}

function getCanonicalDeploymentParam() {
  if (typeof window === "undefined") {
    return onchainConfig?.deploymentProfileUrl?.trim?.() ?? "";
  }

  try {
    const current = new URL(window.location.href);
    return (
      current.searchParams.get("deployment") ??
      onchainConfig?.deploymentProfileUrl?.trim?.() ??
      ""
    );
  } catch {
    return onchainConfig?.deploymentProfileUrl?.trim?.() ?? "";
  }
}

function createCanonicalAppUrl(pathname = "/") {
  const url = new URL(typeof window === "undefined" ? "https://txs.quest" : window.location.origin);
  url.pathname = pathname;
  const deploymentParam = getCanonicalDeploymentParam();
  if (deploymentParam) {
    url.searchParams.set("deployment", deploymentParam);
  }
  return url;
}

function getCanonicalAppBaseUrl() {
  try {
    return createCanonicalAppUrl("/").toString();
  } catch {
    return typeof window === "undefined" ? "https://txs.quest/" : window.location.href;
  }
}

function buildProfilePageUrl(baseUrl, agent) {
  const normalizedAgent = agent?.trim?.() ?? "";
  if (!baseUrl || !/^0x[a-fA-F0-9]{40}$/.test(normalizedAgent)) {
    return "";
  }

  try {
    const url = new URL(baseUrl, window.location.href);
    url.searchParams.set("profileAgent", normalizedAgent);
    url.searchParams.delete("claim");
    url.searchParams.delete("localClaim");
    url.searchParams.delete("claimAgent");
    url.searchParams.delete("claimDef");
    url.searchParams.delete("samplePin");
    return url.toString();
  } catch {
    return "";
  }
}

function buildDirectClaimShareUrl(claimUrl) {
  if (!claimUrl) {
    return "";
  }

  try {
    const url = createCanonicalAppUrl("/");
    url.searchParams.set("claim", claimUrl);
    url.searchParams.delete("localClaim");
    url.searchParams.delete("claimAgent");
    url.searchParams.delete("claimDef");
    url.searchParams.delete("profileAgent");
    url.searchParams.delete("deployment");
    url.searchParams.delete("samplePin");
    return url.toString();
  } catch {
    return "";
  }
}

function getClaimShareUrl(claimEntry) {
  const explicitShareUrl =
    claimEntry?.claim?.external_url?.trim?.() ?? claimEntry?.claim?.externalUrl?.trim?.() ?? "";
  if (explicitShareUrl) {
    return resolveAssetUri(window.location.href, explicitShareUrl);
  }

  if (onchainConfig.claimPageBaseUri && claimEntry?.agent) {
    const onchainShareUrl = buildClaimPageUrl(
      onchainConfig.claimPageBaseUri,
      claimEntry.agent,
      claimEntry.definitionId
    );
    if (onchainShareUrl) {
      return onchainShareUrl;
    }
  }

  if (!claimEntry?.id) {
    return "";
  }

  const url = createCanonicalAppUrl("/");
  url.searchParams.set("localClaim", String(claimEntry.id));
  url.searchParams.delete("claim");
  url.searchParams.delete("claimAgent");
  url.searchParams.delete("claimDef");
  url.searchParams.delete("profileAgent");
  url.searchParams.delete("deployment");
  url.searchParams.delete("samplePin");
  return url.toString();
}

function getCurrentProfileAgent() {
  return selectedProfileAgent || latestClaimEntry?.agent || "";
}

function getProfileShareUrl(agent = getCurrentProfileAgent()) {
  return buildProfilePageUrl(getCanonicalAppBaseUrl(), agent);
}

function getClaimReputationSummary(claimEntry) {
  if (!claimEntry) {
    return null;
  }

  if (claimEntry.reputationSummary) {
    return claimEntry.reputationSummary;
  }

  const badgeCount = registryState.claims.filter(
    (entry) => entry.agent.toLowerCase() === claimEntry.agent.toLowerCase()
  ).length;

  return {
    count: badgeCount,
    summaryValue: badgeCount,
    lastUpdatedAt: claimEntry.claimedAt
  };
}

function formatReputationSummary(summary) {
  if (!summary) {
    return "Reputation unavailable";
  }

  const count = Number(summary.count ?? 0);
  const summaryValue = Number(summary.summaryValue ?? 0);
  const parts = [
    `${summaryValue} rep`,
    `${count} write${count === 1 ? "" : "s"}`
  ];

  if (summary.lastUpdatedAt) {
    parts.push(`updated ${formatDateTime(summary.lastUpdatedAt)}`);
  }

  return parts.join(" · ");
}

function readAdvancedPolicyFormValues() {
  const adapterType = definitionUnlockAdapterSelect.value || "ORACLE_EVENT";
  const ruleKind = adapterType === "AGENT_REP" ? "AGENT_8183" : "ORACLE_8183";
  const defaultSchema =
    adapterType === "AGENT_REP"
      ? DEFAULT_AGENT_8183_SCHEMA
      : adapterType === "PAYMENT_HISTORY"
        ? DEFAULT_PAYMENT_8183_SCHEMA
      : adapterType === "X402_HISTORY"
        ? DEFAULT_X402_8183_SCHEMA
        : DEFAULT_ORACLE_8183_SCHEMA;
  const defaults = advancedPolicyDefaults({
    requiredIssuer: definitionUnlockSignerInput.value.trim(),
    ruleKind,
    schemaInput: defaultSchema
  });

  return {
    ...defaults,
    enabled: Boolean(definitionAdvancedEnabledInput?.checked),
    ruleKind,
    contextInput: definitionAdvancedContextInput?.value ?? "",
    schemaInput: definitionAdvancedSchemaInput?.value ?? defaults.schemaInput,
    requiredIssuer:
      definitionAdvancedIssuerInput?.value?.trim?.() ??
      defaults.requiredIssuer,
    maxAge: definitionAdvancedMaxAgeInput?.value ?? defaults.maxAge,
    requireExpiry: Boolean(definitionAdvancedRequireExpiryInput?.checked),
    nonceScope: definitionAdvancedNonceScopeSelect?.value ?? defaults.nonceScope
  };
}

function getClaimEvidenceSummary(claimEntry, definition = getDefinitionById(claimEntry?.definitionId)) {
  if (!claimEntry) {
    return null;
  }

  if (claimEntry.evidenceSummary) {
    return {
      ...claimEntry.evidenceSummary,
      proofHash: claimEntry.evidenceSummary.proofHash || claimEntry.proofHash || ""
    };
  }

  if (!definition?.advancedPolicyConfig?.enabled) {
    return null;
  }

  return {
    issuer: definition.advancedPolicyConfig.requiredIssuer || "",
    contextId: definition.advancedPolicyConfig.contextId || "",
    expiresAt: 0,
    nonceHash: "",
    proofHash: claimEntry.proofHash || ""
  };
}

function buildClaimEvidenceLines(claimEntry, definition = getDefinitionById(claimEntry?.definitionId)) {
  const summary = getClaimEvidenceSummary(claimEntry, definition);
  if (!summary) {
    return [];
  }

  const lines = [];
  if (summary.issuer) {
    lines.push({
      label: "Issuer",
      value: summary.issuer
    });
  }
  if (summary.contextId) {
    lines.push({
      label: "Context",
      value: summary.contextId
    });
  }
  lines.push({
    label: "Expires",
    value: summary.expiresAt ? formatDateTime(summary.expiresAt) : "No explicit expiry recorded"
  });
  if (summary.nonceHash) {
    lines.push({
      label: "Nonce Hash",
      value: summary.nonceHash
    });
  }
  lines.push({
    label: "Proof Hash",
    value: summary.proofHash || claimEntry?.proofHash || "Unavailable"
  });
  return lines;
}

function buildClaimEvidenceText(claimEntry, definition = getDefinitionById(claimEntry?.definitionId)) {
  const lines = buildClaimEvidenceLines(claimEntry, definition);
  if (lines.length === 0) {
    return "No optional 8183 evidence is attached to this claim.";
  }

  return lines.map((line) => `${line.label}: ${line.value}`).join("\n");
}

function renderDetailList(container, items, emptyMessage) {
  if (!container) {
    return;
  }

  if (!items || items.length === 0) {
    container.innerHTML = `<p class="empty-state">${escapeHtml(emptyMessage)}</p>`;
    return;
  }

  container.innerHTML = items
    .map(
      (item) => `
        <div class="detail-line">
          <strong>${escapeHtml(item.label)}</strong>
          <span>${escapeHtml(item.value)}</span>
        </div>
      `
    )
    .join("");
}

function renderRelatedClaimList(container, claims, emptyMessage) {
  if (!container) {
    return;
  }

  if (!claims || claims.length === 0) {
    container.innerHTML = `<p class="empty-state">${escapeHtml(emptyMessage)}</p>`;
    return;
  }

  container.innerHTML = claims
    .map(
      (claimEntry) => `
        <button type="button" class="detail-claim-link" data-view-claim="${claimEntry.id}">
          <strong>${escapeHtml(
            getDefinitionById(claimEntry.definitionId)?.name ?? claimEntry.claim?.name ?? `Badge #${claimEntry.definitionId}`
          )}</strong>
          <span>${escapeHtml(
            `${shortAddress(claimEntry.agent)} · ${formatDateTime(claimEntry.claimedAt)}`
          )}</span>
        </button>
      `
    )
    .join("");
}

function renderProfileAgentList(container, agents, emptyMessage) {
  if (!container) {
    return;
  }

  if (!agents || agents.length === 0) {
    container.innerHTML = `<p class="empty-state">${escapeHtml(emptyMessage)}</p>`;
    return;
  }

  container.innerHTML = agents
    .map(
      (entry) => `
        <button type="button" class="profile-agent-link" data-view-profile="${entry.agent}">
          <strong>${escapeHtml(shortAddress(entry.agent))}</strong>
          <span>${escapeHtml(
            `${entry.sharedBadgeCount} shared badge${entry.sharedBadgeCount === 1 ? "" : "s"} · ${formatReputationSummary(entry.reputationSummary)}`
          )}</span>
        </button>
      `
    )
    .join("");
}

function renderProfileSurface(profileAgent = getCurrentProfileAgent()) {
  const normalizedAgent = normalizeAgentValue(profileAgent);
  const profileUrl = getProfileShareUrl(profileAgent);
  const hidePreviewPanels = !normalizedAgent && !latestClaimEntry?.claim && Boolean(currentSource?.assetDraft);
  if (profileSurface) {
    profileSurface.hidden = hidePreviewPanels;
  }
  if (hidePreviewPanels) {
    return;
  }
  copyProfileLinkButton.disabled = !profileUrl;
  openProfilePageButton.disabled = !profileUrl;

  if (!normalizedAgent) {
    profileHeading.textContent = "Profile shelves";
    profileSummary.textContent =
      "Open an agent shelf slice to inspect a dedicated profile route with badge shelves, recent activity, and shareable profile state.";
    profileChipList.innerHTML = "";
    profileOverviewTitle.textContent = "No agent selected";
    renderDetailList(profileOverviewLines, [], "Agent-level metrics will appear here.");
    profileBadgeTitle.textContent = "Unlocked badges";
    renderRelatedClaimList(profileBadgeClaims, [], "Unlocked badges will appear here.");
    profileRecentTitle.textContent = "Recent claim activity";
    renderRelatedClaimList(profileRecentClaims, [], "Recent claim activity will appear here.");
    profileNeighborTitle.textContent = "Shared badge neighbors";
    renderProfileAgentList(profileNeighborList, [], "Shared badge neighbors will appear here.");
    return;
  }

  const agentClaims = getClaimsForAgent(normalizedAgent);
  const displayAgent = agentClaims[0]?.agent ?? profileAgent.trim();
  const latestAgentClaim = agentClaims[0] ?? null;
  const firstAgentClaim = agentClaims[agentClaims.length - 1] ?? null;
  const uniqueBadgeCount = new Set(agentClaims.map((claimEntry) => claimEntry.definitionId)).size;
  const reputationSummary =
    agentClaims
      .map((claimEntry) => getClaimReputationSummary(claimEntry))
      .filter(Boolean)
      .sort(
        (first, second) =>
          Number(second?.summaryValue ?? 0) - Number(first?.summaryValue ?? 0) ||
          Number(second?.count ?? 0) - Number(first?.count ?? 0)
      )[0] ?? null;
  const badgeClaims = [...agentClaims.reduce((claimsByBadge, claimEntry) => {
    if (!claimsByBadge.has(claimEntry.definitionId)) {
      claimsByBadge.set(claimEntry.definitionId, claimEntry);
    }
    return claimsByBadge;
  }, new Map()).values()];
  const neighborEntries = [...agentClaims.reduce((neighbors, claimEntry) => {
    registryState.claims.forEach((peerClaim) => {
      if (
        peerClaim.definitionId !== claimEntry.definitionId ||
        normalizeAgentValue(peerClaim.agent) === normalizedAgent
      ) {
        return;
      }

      const key = normalizeAgentValue(peerClaim.agent);
      const existing = neighbors.get(key) ?? {
        agent: peerClaim.agent,
        latestClaimedAt: 0,
        reputationSummary: getClaimReputationSummary(peerClaim),
        sharedBadgeIds: new Set()
      };
      existing.latestClaimedAt = Math.max(existing.latestClaimedAt, peerClaim.claimedAt);
      existing.sharedBadgeIds.add(peerClaim.definitionId);
      if (
        Number(getClaimReputationSummary(peerClaim)?.summaryValue ?? 0) >
        Number(existing.reputationSummary?.summaryValue ?? 0)
      ) {
        existing.reputationSummary = getClaimReputationSummary(peerClaim);
      }
      neighbors.set(key, existing);
    });
    return neighbors;
  }, new Map()).values()]
    .map((entry) => ({
      agent: entry.agent,
      latestClaimedAt: entry.latestClaimedAt,
      reputationSummary: entry.reputationSummary,
      sharedBadgeCount: entry.sharedBadgeIds.size
    }))
    .sort((first, second) => {
      const badgeDelta = second.sharedBadgeCount - first.sharedBadgeCount;
      if (badgeDelta !== 0) {
        return badgeDelta;
      }
      return second.latestClaimedAt - first.latestClaimedAt;
    })
    .slice(0, 6);

  profileHeading.textContent = `Agent ${shortAddress(displayAgent)}`;
  profileSummary.textContent = agentClaims.length
    ? `${shortAddress(displayAgent)} has ${agentClaims.length} claim${
        agentClaims.length === 1 ? "" : "s"
      } across ${uniqueBadgeCount} badge${uniqueBadgeCount === 1 ? "" : "s"}.`
    : `${shortAddress(displayAgent)} does not have any visible claims yet.`;
  profileChipList.innerHTML = [
    formatReputationSummary(reputationSummary),
    `${uniqueBadgeCount} badge${uniqueBadgeCount === 1 ? "" : "s"}`,
    `${agentClaims.length} claim${agentClaims.length === 1 ? "" : "s"}`,
    latestAgentClaim ? `Last active ${formatDateTime(latestAgentClaim.claimedAt)}` : "No recent activity"
  ]
    .map((value) => `<span class="chip">${escapeHtml(value)}</span>`)
    .join("");

  profileOverviewTitle.textContent = shortAddress(displayAgent);
  renderDetailList(
    profileOverviewLines,
    [
      {
        label: "Address",
        value: displayAgent
      },
      {
        label: "Reputation",
        value: formatReputationSummary(reputationSummary)
      },
      {
        label: "Badge Shelf",
        value: `${uniqueBadgeCount} unlocked badge${uniqueBadgeCount === 1 ? "" : "s"}`
      },
      {
        label: "First Claim",
        value: firstAgentClaim ? formatDateTime(firstAgentClaim.claimedAt) : "Not claimed yet"
      },
      {
        label: "Profile URL",
        value: profileUrl || "Profile URL unavailable"
      }
    ],
    "Agent-level metrics will appear here."
  );

  profileBadgeTitle.textContent = `${uniqueBadgeCount} unlocked badge${uniqueBadgeCount === 1 ? "" : "s"}`;
  renderRelatedClaimList(
    profileBadgeClaims,
    badgeClaims,
    "This agent has not unlocked any badges yet."
  );
  profileRecentTitle.textContent = "Recent claim activity";
  renderRelatedClaimList(
    profileRecentClaims,
    agentClaims.slice(0, 6),
    "Recent claim activity will appear here."
  );
  profileNeighborTitle.textContent = "Shared badge neighbors";
  renderProfileAgentList(
    profileNeighborList,
    neighborEntries,
    "No other agents share this badge shelf yet."
  );
}

function getCurrentPinPreviewDetail() {
  if (!currentSource?.assetDraft) {
    return null;
  }

  const pinId = normalizeSamplePinId(currentSource.pinId ?? "");
  const badgeEntry = getBadgeGridEntries().find((entry) => entry.pinId === pinId) ?? null;
  const definition =
    badgeEntry?.latestClaim ? getDefinitionById(badgeEntry.latestClaim.definitionId) : null;
  const catalogEntry = definition ? getCatalogEntryForDefinition(definition) : badgeEntry?.catalogEntry ?? null;
  const claimCondition = definition?.claimCondition ?? catalogEntry?.claimCondition ?? "";
  const catalogBadgeTypeLabel = definition?.catalogBadgeTypeLabel ?? catalogEntry?.badgeType ?? "";
  const unlockSummary = definition
    ? summarizeUnlockAdapter(definition)
    : claimCondition
      ? {
          title: "Claim condition",
          summary: claimCondition,
          detailLines: [],
          executionHint: "Open Claim to compare this badge against live eligibility."
        }
      : {
          title: "Badge preview",
          summary: "This badge is ready to preview. Open the claim flow to see whether your agent can unlock it.",
          detailLines: [],
          executionHint: "Open Claim to check live eligibility."
        };
  const advancedPolicySummary = definition ? summarizeAdvancedPolicy(definition) : null;
  const sameBadgeClaims =
    badgeEntry?.latestClaim
      ? registryState.claims
          .filter((entry) => entry.definitionId === badgeEntry.latestClaim.definitionId)
          .slice(0, 4)
      : [];

  return {
    title: badgeEntry?.title ?? currentSource.name ?? "Badge detail",
    description:
      definition?.description ??
      badgeEntry?.description ??
      "Looping badge preview with live badge availability and claim-path context.",
    chipValues: [
      definition?.badgeType ? badgeTypeLabel(definition.badgeType) : catalogBadgeTypeLabel,
      definition?.verificationType ? verificationTypeLabel(definition.verificationType) : "",
      badgeEntry?.claimCount ? `${badgeEntry.claimCount} claimed` : "No live claims yet",
      advancedPolicySummary ? advancedPolicySummary.title : ""
    ].filter(Boolean),
    unlockSummary,
    unlockLines: [
      ...(!definition && catalogBadgeTypeLabel
        ? [
            {
              label: "Type",
              value: catalogBadgeTypeLabel
            }
          ]
        : []),
      ...(claimCondition && definition
        ? [
            {
              label: "Catalog condition",
              value: claimCondition
            }
          ]
        : []),
      ...unlockSummary.detailLines.map((value, index) => ({
        label: index === 0 ? "Config" : "Detail",
        value
      })),
      ...(advancedPolicySummary?.detailLines ?? []).map((value) => ({
        label: "Policy",
        value
      })),
      {
        label: "Claim Path",
        value: unlockSummary.executionHint
      }
    ],
    recordLines: [
      {
        label: "Status",
        value:
          badgeEntry?.claimCount && badgeEntry.claimCount > 0
            ? `${badgeEntry.claimCount} live claim${badgeEntry.claimCount === 1 ? "" : "s"} recorded`
            : "No live claims recorded yet"
      }
    ],
    relatedBadgeClaims: sameBadgeClaims,
    relatedBadgeTitle: `Live ${badgeEntry?.title ?? "badge"} claims`,
    relatedAgentTitle: "Next step"
  };
}

function renderDetailSurface(claimEntry = latestClaimEntry) {
  const previewDetail =
    !claimEntry?.claim && !getCurrentProfileAgent() && Boolean(currentSource?.assetDraft)
      ? getCurrentPinPreviewDetail()
      : null;
  const hidePreviewPanels = !claimEntry?.claim && !getCurrentProfileAgent() && !previewDetail;
  if (detailSurface) {
    detailSurface.hidden = hidePreviewPanels;
  }
  if (hidePreviewPanels) {
    return;
  }

  if (previewDetail) {
    detailHeading.textContent = previewDetail.title;
    detailDescription.textContent = previewDetail.description;
    detailChipList.innerHTML = previewDetail.chipValues
      .map((value) => `<span class="chip">${escapeHtml(value)}</span>`)
      .join("");
    detailUnlockTitle.textContent = previewDetail.unlockSummary.title;
    detailUnlockSummary.textContent = previewDetail.unlockSummary.summary;
    renderDetailList(
      detailUnlockLines,
      previewDetail.unlockLines,
      "Claim configuration will appear here once a live badge definition is attached."
    );
    detailRecordTitle.textContent = `${previewDetail.title} status`;
    renderDetailList(
      detailRecordLines,
      previewDetail.recordLines,
      "Badge status will appear here."
    );
    detailRelatedBadgeTitle.textContent = previewDetail.relatedBadgeTitle;
    renderRelatedClaimList(
      detailRelatedBadgeClaims,
      previewDetail.relatedBadgeClaims,
      "No live holders yet."
    );
    detailRelatedAgentTitle.textContent = previewDetail.relatedAgentTitle;
    renderRelatedClaimList(
      detailRelatedAgentClaims,
      [],
      "Open Claim to see whether your agent can unlock this badge."
    );
    return;
  }

  if (!claimEntry?.claim) {
    detailHeading.textContent = "Claim playback page";
    detailDescription.textContent =
      "Load a claim to inspect its unlock path, related records, and share-ready metadata.";
    detailChipList.innerHTML = "";
    detailUnlockTitle.textContent = "Manual Attestor Approval";
    detailUnlockSummary.textContent = "Unlock details appear once a claim is selected.";
    renderDetailList(detailUnlockLines, [], "No unlock adapter is selected yet.");
    detailRecordTitle.textContent = "No claim loaded";
    renderDetailList(detailRecordLines, [], "Claim metadata will appear here.");
    detailRelatedBadgeTitle.textContent = "Related badge claims";
    renderRelatedClaimList(detailRelatedBadgeClaims, [], "No badge relationships yet.");
    detailRelatedAgentTitle.textContent = "Related agent claims";
    renderRelatedClaimList(detailRelatedAgentClaims, [], "No agent relationships yet.");
    return;
  }

  const definition =
    getDefinitionById(claimEntry.definitionId) ??
    {
      name: claimEntry.claim.name,
      description: claimEntry.claim.description ?? "",
      verificationType:
        claimEntry.claim.attributes?.find?.((entry) => entry.trait_type === "Verification")?.value ??
        "ONCHAIN_STATE",
      verificationData: "0x",
      unlockAdapterConfig: decodeUnlockAdapterConfig("ONCHAIN_STATE", "0x"),
      asset: {
        edition: claimEntry.claim?.properties?.edition ?? "launch",
        loopSeconds: claimEntry.claim?.properties?.loop_seconds ?? 5
      }
    };
  const catalogEntry = getCatalogEntryForDefinition(definition);
  const claimCondition = definition.claimCondition ?? catalogEntry?.claimCondition ?? "";
  const unlockSummary = summarizeUnlockAdapter(definition);
  const advancedPolicySummary = summarizeAdvancedPolicy(definition);
  const evidenceLines = buildClaimEvidenceLines(claimEntry, definition);
  const shareUrl = getClaimShareUrl(claimEntry);
  const sameBadgeClaims = registryState.claims
    .filter((entry) => entry.definitionId === claimEntry.definitionId && entry.id !== claimEntry.id)
    .slice(0, 4);
  const sameAgentClaims = registryState.claims
    .filter(
      (entry) =>
        normalizeAgentValue(entry.agent) === normalizeAgentValue(claimEntry.agent) &&
        entry.id !== claimEntry.id
    )
    .slice(0, 4);

  detailHeading.textContent = definition.name ?? claimEntry.claim.name ?? "Badge detail";
  detailDescription.textContent =
    definition.description ??
    catalogEntry?.description ??
    claimEntry.claim.description ??
    "Looping pin playback with claim metadata.";
  detailChipList.innerHTML = [
    badgeTypeLabel(definition.badgeType ?? "CUSTOM"),
    verificationTypeLabel(definition.verificationType ?? "ONCHAIN_STATE"),
    advancedPolicySummary ? advancedPolicySummary.title : ""
  ]
    .filter(Boolean)
    .map((value) => `<span class="chip">${escapeHtml(value)}</span>`)
    .join("");

  detailUnlockTitle.textContent = unlockSummary.title;
  detailUnlockSummary.textContent = unlockSummary.summary;
  renderDetailList(
    detailUnlockLines,
    [
      ...(claimCondition
        ? [
            {
              label: "Catalog condition",
              value: claimCondition
            }
          ]
        : []),
      ...unlockSummary.detailLines.map((value, index) => ({
        label: index === 0 ? "Config" : "Detail",
        value
      })),
      ...(advancedPolicySummary?.detailLines ?? []).map((value) => ({
        label: "Policy",
        value
      })),
      {
        label: "Claim Path",
        value: unlockSummary.executionHint
      }
    ],
    "Unlock configuration will appear here."
  );

  detailRecordTitle.textContent = `${definition.name ?? claimEntry.claim.name ?? "Claim"} record`;
  renderDetailList(
    detailRecordLines,
    [
      {
        label: "Agent",
        value: claimEntry.agent || claimEntry.claim?.properties?.agent || "Unknown"
      },
      {
        label: "Claimed",
        value: formatDateTime(claimEntry.claimedAt)
      },
      {
        label: "Reputation",
        value: formatReputationSummary(getClaimReputationSummary(claimEntry))
      },
      ...evidenceLines,
      {
        label: "Share Page",
        value: shareUrl || "No share page"
      }
    ],
    "Claim details will appear here."
  );

  detailRelatedBadgeTitle.textContent = `Other ${definition.name ?? "badge"} claims`;
  renderRelatedClaimList(
    detailRelatedBadgeClaims,
    sameBadgeClaims,
    "No other agents have this badge yet."
  );
  detailRelatedAgentTitle.textContent = `Other claims for ${shortAddress(claimEntry.agent)}`;
  renderRelatedClaimList(
    detailRelatedAgentClaims,
    sameAgentClaims,
    "This agent only has the current claim right now."
  );
}

function updateClaimProofStatus() {
  const definition = getDefinitionById(claimDefinitionSelect.value);
  if (!definition) {
    setSupportStatus(claimProofStatus, "Choose a badge definition to see its unlock path.");
    return;
  }

  const unlockSummary = summarizeUnlockAdapter(definition);
  const unlockAdapterConfig =
    definition.unlockAdapterConfig ??
    decodeUnlockAdapterConfig(definition.verificationType, definition.verificationData);
  const executionPath = claimExecutionPathSelect.value;
  const isSelfTarget =
    normalizeAgentValue(claimAgentInput.value) === normalizeAgentValue(onchainConfig.walletAddress);
  const proofPackageRaw = claimProofPackageInput.value.trim();
  const advancedPolicyEnabled = isOracle8183PolicyEnabled(definition.advancedPolicyConfig);
  const advancedAgentPolicyEnabled = isAgent8183PolicyEnabled(definition.advancedPolicyConfig);
  const oracleServiceUrl =
    connectionOracleServiceInput?.value?.trim?.() || onchainConfig.oracleServiceUrl?.trim?.() || "";
  const x402ServiceUrl =
    connectionX402ServiceInput?.value?.trim?.() || onchainConfig.x402ServiceUrl?.trim?.() || "";
  const farcasterServiceUrl =
    connectionFarcasterServiceInput?.value?.trim?.() || onchainConfig.farcasterServiceUrl?.trim?.() || "";
  const farcasterSession = getFarcasterSession();
  const payerConnected = Boolean(onchainConfig.mppWalletAddress);

  let message = unlockSummary.executionHint;
  let isError = unlockSummary.manualOnly && executionPath === "direct";
  if (executionPath === "direct") {
    message = unlockSummary.manualOnly
      ? "This badge is manual-only. Switch to attestor record."
      : unlockAdapterConfig?.unlockAdapterType === "PAYMENT_HISTORY"
        ? proofPackageRaw
          ? (() => {
              try {
                const proofPackage = parseOracleEventProofPackage(proofPackageRaw);
                if (proofPackage.kind !== "oracle_event_attendance_8183_v1") {
                  isError = true;
                  return "This badge requires an 8183 payment history proof package.";
                }
                if (
                  definition.advancedPolicyConfig?.requiredIssuer &&
                  normalizeAgentValue(proofPackage.signerAddress) !==
                    normalizeAgentValue(definition.advancedPolicyConfig.requiredIssuer)
                ) {
                  isError = true;
                  return "The pasted payment proof was signed by a different issuer than this badge expects.";
                }
                if (
                  definition.advancedPolicyConfig?.contextId &&
                  proofPackage.contextId !== definition.advancedPolicyConfig.contextId
                ) {
                  isError = true;
                  return "The pasted payment proof uses a different criteria context than this badge expects.";
                }
                if (
                  definition.advancedPolicyConfig?.schemaId &&
                  proofPackage.schemaId !== definition.advancedPolicyConfig.schemaId
                ) {
                  isError = true;
                  return "The pasted payment proof uses a different schema than this badge expects.";
                }
                if (proofPackage.expiresAt < Math.floor(Date.now() / 1000)) {
                  isError = true;
                  return "The pasted payment proof has expired. Load a fresh proof package.";
                }
                return `Direct self-claim will submit the pasted 8183 payment proof package. Expires ${formatDateTime(
                  proofPackage.expiresAt
                )}.`;
              } catch {
                isError = true;
                return "The pasted payment proof package could not be validated. Check the JSON payload or request a fresh proof.";
              }
            })()
          : x402ServiceUrl
            ? payerConnected
              ? "Direct self-claim will request a fresh 8183 payment history proof using the connected agent wallet and the connected MPP payer wallet."
              : "Direct self-claim will request a fresh 8183 payment history proof for the connected agent wallet. Connect the payer wallet too if you want MPP activity counted."
            : ((isError = true),
              "Add a payment proof service URL or paste a valid 8183 payment proof package before claiming.")
      : unlockAdapterConfig?.unlockAdapterType === "FARCASTER_ACCOUNT"
        ? !advancedPolicyEnabled
          ? ((isError = true),
            "This badge is missing its ORACLE_8183 advanced policy. Update the badge policy before claiming.")
          : proofPackageRaw
          ? (() => {
              try {
                const proofPackage = parseOracleEventProofPackage(proofPackageRaw);
                if (proofPackage.kind !== "oracle_event_attendance_8183_v1") {
                  isError = true;
                  return "This badge requires an 8183 Farcaster proof package.";
                }
                if (
                  definition.advancedPolicyConfig?.requiredIssuer &&
                  normalizeAgentValue(proofPackage.signerAddress) !==
                    normalizeAgentValue(definition.advancedPolicyConfig.requiredIssuer)
                ) {
                  isError = true;
                  return "The pasted Farcaster proof was signed by a different issuer than this badge expects.";
                }
                if (
                  definition.advancedPolicyConfig?.contextId &&
                  proofPackage.contextId !== definition.advancedPolicyConfig.contextId
                ) {
                  isError = true;
                  return "The pasted Farcaster proof uses a different criteria context than this badge expects.";
                }
                if (
                  definition.advancedPolicyConfig?.schemaId &&
                  proofPackage.schemaId !== definition.advancedPolicyConfig.schemaId
                ) {
                  isError = true;
                  return "The pasted Farcaster proof uses a different schema than this badge expects.";
                }
                if (proofPackage.expiresAt < Math.floor(Date.now() / 1000)) {
                  isError = true;
                  return "The pasted Farcaster proof has expired. Load a fresh proof package.";
                }
                return `Direct self-claim will submit the pasted 8183 Farcaster proof package. Expires ${formatDateTime(
                  proofPackage.expiresAt
                )}.`;
              } catch {
                isError = true;
                return "The pasted Farcaster proof package could not be validated. Check the JSON payload or request a fresh proof.";
              }
            })()
          : farcasterServiceUrl
            ? farcasterSession.isMiniApp
              ? farcasterSession.connected
                ? "Direct self-claim will request a fresh 8183 Farcaster proof using the connected Quick Auth session."
                : "Open Farcaster connect to request a fresh 8183 proof for this badge."
              : ((isError = true),
                "Open txs.quest inside Farcaster before trying to self-claim this badge.")
            : ((isError = true),
              "Add a Farcaster proof service URL before claiming this badge.")
      : isReusableOracleAdapter(unlockAdapterConfig?.unlockAdapterType)
        ? !advancedPolicyEnabled
          ? ((isError = true),
            "This badge is missing its ORACLE_8183 advanced policy. Update the badge policy before claiming.")
          : proofPackageRaw
          ? (() => {
              try {
                const proofPackage = parseOracleEventProofPackage(proofPackageRaw);
                if (proofPackage.kind !== "oracle_event_attendance_8183_v1") {
                  isError = true;
                  return "This badge requires an 8183 oracle proof package.";
                }
                if (
                  definition.advancedPolicyConfig?.requiredIssuer &&
                  normalizeAgentValue(proofPackage.signerAddress) !==
                    normalizeAgentValue(definition.advancedPolicyConfig.requiredIssuer)
                ) {
                  isError = true;
                  return "The pasted oracle proof was signed by a different issuer than this badge expects.";
                }
                if (
                  definition.advancedPolicyConfig?.contextId &&
                  proofPackage.contextId !== definition.advancedPolicyConfig.contextId
                ) {
                  isError = true;
                  return "The pasted oracle proof uses a different criteria context than this badge expects.";
                }
                if (
                  definition.advancedPolicyConfig?.schemaId &&
                  proofPackage.schemaId !== definition.advancedPolicyConfig.schemaId
                ) {
                  isError = true;
                  return "The pasted oracle proof uses a different schema than this badge expects.";
                }
                if (proofPackage.expiresAt < Math.floor(Date.now() / 1000)) {
                  isError = true;
                  return "The pasted oracle proof has expired. Load a fresh proof package.";
                }
                return `Direct self-claim will submit the pasted 8183 oracle proof package. Expires ${formatDateTime(
                  proofPackage.expiresAt
                )}.`;
              } catch {
                isError = true;
                return "The pasted oracle proof package could not be validated. Check the JSON payload or request a fresh proof.";
              }
            })()
          : oracleServiceUrl
            ? "Direct self-claim will request a fresh 8183 oracle proof for the connected wallet."
            : ((isError = true),
              "Add an oracle proof service URL or paste a valid 8183 oracle proof package before claiming.")
      : unlockAdapterConfig?.unlockAdapterType === "X402_HISTORY"
        ? proofPackageRaw
          ? (() => {
              try {
                const proofPackage = parseOracleEventProofPackage(proofPackageRaw);
                if (proofPackage.kind !== "oracle_event_attendance_8183_v1") {
                  isError = true;
                  return "This badge requires an 8183 x402 history proof package.";
                }
                if (
                  definition.advancedPolicyConfig?.requiredIssuer &&
                  normalizeAgentValue(proofPackage.signerAddress) !==
                    normalizeAgentValue(definition.advancedPolicyConfig.requiredIssuer)
                ) {
                  isError = true;
                  return "The pasted x402 proof was signed by a different issuer than this badge expects.";
                }
                if (
                  definition.advancedPolicyConfig?.contextId &&
                  proofPackage.contextId !== definition.advancedPolicyConfig.contextId
                ) {
                  isError = true;
                  return "The pasted x402 proof uses a different criteria context than this badge expects.";
                }
                if (
                  definition.advancedPolicyConfig?.schemaId &&
                  proofPackage.schemaId !== definition.advancedPolicyConfig.schemaId
                ) {
                  isError = true;
                  return "The pasted x402 proof uses a different schema than this badge expects.";
                }
                if (proofPackage.expiresAt < Math.floor(Date.now() / 1000)) {
                  isError = true;
                  return "The pasted x402 proof has expired. Load a fresh proof package.";
                }
                return `Direct self-claim will submit the pasted 8183 x402 proof package. Expires ${formatDateTime(
                  proofPackage.expiresAt
                )}.`;
              } catch {
                isError = true;
                return "The pasted x402 proof package could not be validated. Check the JSON payload or request a fresh proof.";
              }
            })()
          : x402ServiceUrl
            ? "Direct self-claim will request a fresh 8183 x402 history proof for the connected wallet only."
            : ((isError = true),
              "Add an x402 proof service URL or paste a valid 8183 x402 proof package before claiming.")
      : unlockAdapterConfig?.unlockAdapterType === "ORACLE_EVENT"
        ? proofPackageRaw
          ? (() => {
              try {
                const proofPackage = parseOracleEventProofPackage(proofPackageRaw);
                if (advancedPolicyEnabled && proofPackage.kind !== "oracle_event_attendance_8183_v1") {
                  isError = true;
                  return "This badge requires an 8183 attendance proof package with context, expiry, and nonce fields.";
                }
                if (
                  advancedPolicyEnabled &&
                  definition.advancedPolicyConfig?.requiredIssuer &&
                  normalizeAgentValue(proofPackage.signerAddress) !==
                    normalizeAgentValue(definition.advancedPolicyConfig.requiredIssuer)
                ) {
                  isError = true;
                  return "The pasted 8183 proof was signed by a different issuer than this badge expects.";
                }
                if (
                  advancedPolicyEnabled &&
                  definition.advancedPolicyConfig?.contextId &&
                  proofPackage.contextId !== definition.advancedPolicyConfig.contextId
                ) {
                  isError = true;
                  return "The pasted 8183 proof uses a different context than this badge expects.";
                }
                if (proofPackage.expiresAt && proofPackage.expiresAt < Math.floor(Date.now() / 1000)) {
                  isError = true;
                  return "The pasted attendance proof has expired. Load a fresh proof package.";
                }
                if (proofPackage.expiresAt) {
                  return advancedPolicyEnabled
                    ? `Direct self-claim will submit the pasted 8183 attendance proof package. Expires ${formatDateTime(proofPackage.expiresAt)}.`
                    : `Direct self-claim will submit the pasted attendance proof package. Expires ${formatDateTime(proofPackage.expiresAt)}.`;
                }
                return advancedPolicyEnabled
                  ? "Direct self-claim will submit the pasted 8183 attendance proof package."
                  : "Direct self-claim will submit the pasted attendance proof package.";
              } catch {
                isError = true;
                return "The pasted proof package could not be validated. Check the JSON payload or load a fresh proof package.";
              }
            })()
          : advancedPolicyEnabled
            ? "Direct self-claim needs a valid 8183 event proof package unless the required issuer wallet is connected."
            : "Direct self-claim needs an event attendance proof package unless the oracle signer wallet is connected."
        : unlockAdapterConfig?.unlockAdapterType === "TOKEN_BALANCE"
          ? "Direct self-claim will verify the connected wallet balance against the configured token threshold."
          : unlockAdapterConfig?.unlockAdapterType === "BADGE_COUNT"
            ? "Direct self-claim will verify the connected wallet's onchain badge count."
            : unlockAdapterConfig?.unlockAdapterType === "AGENT_REP"
              ? proofPackageRaw
                ? (() => {
                    try {
                      const proofPackage = parseAgentAttestationProofPackage(proofPackageRaw);
                      if (
                        advancedAgentPolicyEnabled &&
                        definition.advancedPolicyConfig?.requiredIssuer &&
                        normalizeAgentValue(proofPackage.signerAddress) !==
                          normalizeAgentValue(definition.advancedPolicyConfig.requiredIssuer)
                      ) {
                        isError = true;
                        return "The pasted 8183 agent proof was signed by a different issuer than this badge expects.";
                      }
                      if (
                        advancedAgentPolicyEnabled &&
                        definition.advancedPolicyConfig?.contextId &&
                        proofPackage.contextId !== definition.advancedPolicyConfig.contextId
                      ) {
                        isError = true;
                        return "The pasted 8183 agent proof uses a different context than this badge expects.";
                      }
                      if (proofPackage.expiresAt < Math.floor(Date.now() / 1000)) {
                        isError = true;
                        return "The pasted agent attestation proof has expired. Load a fresh proof package.";
                      }
                      return advancedAgentPolicyEnabled
                        ? `Direct self-claim will submit the pasted 8183 agent proof package. Expires ${formatDateTime(proofPackage.expiresAt)}.`
                        : "Direct self-claim will submit the pasted agent proof package.";
                    } catch {
                      isError = true;
                      return "The pasted agent proof package could not be validated. Check the JSON payload or load a fresh proof package.";
                    }
                  })()
                : advancedAgentPolicyEnabled
                  ? "Direct self-claim needs a valid 8183 agent proof package unless the attesting issuer wallet is connected."
                  : "Direct self-claim needs a qualifying agent attestation."
            : "Direct self-claim will use the selected unlock proof path.";
  } else if (executionPath === "attestor") {
    message = "Attestor record will bypass self-claim proofs and requires an authorized attestor wallet.";
  } else if (!isSelfTarget && onchainConfig.mode === "onchain") {
    message = "Auto mode will choose attestor record because the agent does not match the connected wallet.";
  } else if (
    isReusableOracleAdapter(unlockAdapterConfig?.unlockAdapterType) &&
    !claimProofPackageInput.value.trim()
  ) {
    message = oracleServiceUrl
      ? "Auto mode can self-claim only when the connected wallet can request a fresh oracle proof from the configured service."
      : "Auto mode needs an oracle proof service URL or a pasted 8183 oracle proof package.";
    isError = !oracleServiceUrl;
  } else if (
    unlockAdapterConfig?.unlockAdapterType === "PAYMENT_HISTORY" &&
    !claimProofPackageInput.value.trim()
  ) {
    message = x402ServiceUrl
      ? payerConnected
        ? "Auto mode can self-claim by requesting a fresh payment proof for the connected wallet and payer wallet."
        : "Auto mode can self-claim by requesting a fresh payment proof for the connected wallet. Connect the payer wallet too if you want MPP activity counted."
      : "Auto mode needs a payment proof service URL or a pasted 8183 payment proof package.";
    isError = !x402ServiceUrl;
  } else if (
    unlockAdapterConfig?.unlockAdapterType === "X402_HISTORY" &&
    !claimProofPackageInput.value.trim()
  ) {
    message = x402ServiceUrl
      ? "Auto mode can self-claim only when the connected wallet can request a fresh x402 proof from the configured service."
      : "Auto mode needs an x402 proof service URL or a pasted 8183 x402 proof package.";
    isError = !x402ServiceUrl;
  } else if (
    unlockAdapterConfig?.unlockAdapterType === "ORACLE_EVENT" &&
    !claimProofPackageInput.value.trim()
  ) {
    message = advancedPolicyEnabled
      ? "Auto mode can self-claim only when a valid 8183 attendance proof package is present or the required issuer wallet is connected."
      : "Auto mode can self-claim only when a valid attendance proof package is present or the signer wallet is connected.";
  } else if (
    unlockAdapterConfig?.unlockAdapterType === "AGENT_REP" &&
    !claimProofPackageInput.value.trim() &&
    advancedAgentPolicyEnabled
  ) {
    message =
      "Auto mode can self-claim only when a valid 8183 agent proof package is present or the attesting issuer wallet is connected.";
  }

  setSupportStatus(claimProofStatus, `${unlockSummary.title}. ${message}`, isError);
}

function syncBrowserUrlForClaim(claimEntry) {
  const shareUrl = getClaimShareUrl(claimEntry);
  if (!shareUrl || typeof window === "undefined") {
    return;
  }

  try {
    const url = new URL(shareUrl, window.location.href);
    if (url.origin !== window.location.origin) {
      return;
    }

    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // Ignore invalid share URLs.
  }
}

function syncBrowserUrlForProfile(agent) {
  const profileUrl = getProfileShareUrl(agent);
  if (!profileUrl || typeof window === "undefined") {
    return;
  }

  try {
    const url = new URL(profileUrl, window.location.href);
    if (url.origin !== window.location.origin) {
      return;
    }

    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // Ignore invalid profile URLs.
  }
}

function syncBrowserUrlForWall() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const url = createCanonicalAppUrl("/");
    url.searchParams.delete("claim");
    url.searchParams.delete("localClaim");
    url.searchParams.delete("claimAgent");
    url.searchParams.delete("claimDef");
    url.searchParams.delete("profileAgent");
    url.searchParams.delete("samplePin");
    url.searchParams.delete("claimAssistant");
    url.searchParams.delete("agent");
    url.searchParams.delete("address");
    url.searchParams.delete("ens");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // Ignore invalid URLs.
  }
}

function syncBrowserUrlForSamplePin(pinId) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const url = createCanonicalAppUrl("/");
    url.searchParams.set("samplePin", normalizeSamplePinId(pinId));
    url.searchParams.delete("claim");
    url.searchParams.delete("localClaim");
    url.searchParams.delete("claimAgent");
    url.searchParams.delete("claimDef");
    url.searchParams.delete("profileAgent");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // Ignore invalid URLs.
  }
}

function syncBrowserUrlForClaimAssistant(target = "") {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const url = createCanonicalAppUrl("/claim");
    const normalizedTarget = target?.trim?.() ?? "";
    if (normalizedTarget) {
      if (normalizedTarget.endsWith(".eth")) {
        url.searchParams.set("ens", normalizedTarget);
      } else {
        url.searchParams.set("agent", normalizedTarget);
      }
    }
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  } catch {
    // Ignore invalid URLs.
  }
}

function normalizeAgentValue(value) {
  return value?.trim?.().toLowerCase?.() ?? "";
}

function getClaimsForAgent(agent) {
  const normalizedAgent = normalizeAgentValue(agent);
  if (!normalizedAgent) {
    return [];
  }

  return [...registryState.claims]
    .filter((claimEntry) => normalizeAgentValue(claimEntry.agent) === normalizedAgent)
    .sort((first, second) => {
      const claimedAtDelta = second.claimedAt - first.claimedAt;
      if (claimedAtDelta !== 0) {
        return claimedAtDelta;
      }
      return second.id - first.id;
    });
}

function renderClaimAssistantItems(container, items, emptyMessage) {
  if (!container) {
    return;
  }

  if (!items.length) {
    container.innerHTML = `<p class="empty-state">${escapeHtml(emptyMessage)}</p>`;
    return;
  }

  container.innerHTML = items
    .map(
      (item) => `
        <article class="claim-assistant-item">
          <strong>${escapeHtml(item.label)}</strong>
          <span>${escapeHtml(item.value)}</span>
        </article>
      `
    )
    .join("");
}

function getClaimAssistantSnapshot(agent) {
  const normalizedAgent = normalizeAgentValue(agent);
  const claims = getClaimsForAgent(normalizedAgent);
  const claimedDefinitionIds = new Set(claims.map((claimEntry) => Number(claimEntry.definitionId)));
  const activeDefinitions = registryState.definitions.filter((definition) => definition.active !== false);
  const unclaimedDefinitions = activeDefinitions
    .filter((definition) => !claimedDefinitionIds.has(Number(definition.id)))
    .map((definition) => ({
      definition,
      adapterSummary: summarizeUnlockAdapter(definition),
      unlockAdapterConfig:
        definition.unlockAdapterConfig ??
        decodeUnlockAdapterConfig(definition.verificationType, definition.verificationData)
    }));
  const directDefinitions = unclaimedDefinitions.filter((entry) => !entry.adapterSummary.manualOnly && !entry.adapterSummary.requiresProof);
  const proofDefinitions = unclaimedDefinitions.filter((entry) => entry.adapterSummary.requiresProof);
  const farcasterDefinitions = proofDefinitions.filter(
    (entry) => entry.unlockAdapterConfig?.unlockAdapterType === "FARCASTER_ACCOUNT"
  );
  const farcasterSession = getFarcasterSession();
  const eligibleFarcasterDefinitions = farcasterDefinitions.filter((entry) => {
    if (!farcasterSession?.connected || !farcasterSession?.authAddress || !normalizedAgent) {
      return false;
    }
    if (normalizeAgentValue(farcasterSession.authAddress) !== normalizedAgent) {
      return false;
    }
    return matchesFarcasterCriteria(farcasterSession.fid, {
      minFid: entry.unlockAdapterConfig?.unlockThreshold
    });
  });
  const attestorDefinitions = unclaimedDefinitions.filter((entry) => entry.adapterSummary.manualOnly);
  const selfConnected =
    normalizedAgent && normalizedAgent === normalizeAgentValue(onchainConfig.walletAddress);

  return {
    normalizedAgent,
    displayAgent: claims[0]?.agent ?? agent.trim(),
    claimedCount: claimedDefinitionIds.size,
    claimRecordCount: claims.length,
    activeDefinitionCount: activeDefinitions.length,
    unclaimedCount: unclaimedDefinitions.length,
    selfConnected,
    profileUrl: buildProfilePageUrl(window.location.href, claims[0]?.agent ?? agent.trim()),
    directDefinitions,
    proofDefinitions,
    farcasterDefinitions,
    eligibleFarcasterDefinitions,
    farcasterSession,
    attestorDefinitions,
    nextDefinitions: [...directDefinitions, ...proofDefinitions, ...attestorDefinitions].slice(0, 6)
  };
}

function getClaimAssistantHeadline(snapshot) {
  if (!snapshot?.normalizedAgent) {
    return "Connect a wallet to get started";
  }

  if (snapshot.claimedCount > 0) {
    return `Your agent has ${snapshot.claimedCount} badge${snapshot.claimedCount === 1 ? "" : "s"} on txs.quest.`;
  }

  if (snapshot.eligibleFarcasterDefinitions.length > 0) {
    return `Your connected Farcaster account can unlock ${snapshot.eligibleFarcasterDefinitions.length} badge${snapshot.eligibleFarcasterDefinitions.length === 1 ? "" : "s"} now.`;
  }

  if (snapshot.directDefinitions.length > 0) {
    return `This agent has ${snapshot.directDefinitions.length} direct badge path${snapshot.directDefinitions.length === 1 ? "" : "s"} ready to check.`;
  }

  if (snapshot.proofDefinitions.length > 0) {
    return `This agent has ${snapshot.proofDefinitions.length} proof-backed badge path${snapshot.proofDefinitions.length === 1 ? "" : "s"} available.`;
  }

  return "No live badges are claimed for this agent yet.";
}

function getClaimAssistantStatusMessage(snapshot, resolvedLabel) {
  if (!snapshot?.normalizedAgent) {
    return "";
  }

  if (snapshot.claimedCount > 0) {
    return `Found ${snapshot.claimedCount} live badge${snapshot.claimedCount === 1 ? "" : "s"} for ${snapshot.displayAgent}.`;
  }

  if (snapshot.eligibleFarcasterDefinitions.length > 0) {
    const farcasterAddress = snapshot.farcasterSession?.authAddress || snapshot.normalizedAgent;
    return `Your Farcaster account qualifies for ${snapshot.eligibleFarcasterDefinitions.length} badge path${snapshot.eligibleFarcasterDefinitions.length === 1 ? "" : "s"} now. Tap Connect Wallet to use the Farcaster Mini App signer for ${shortAddress(farcasterAddress)}.`;
  }

  if (snapshot.farcasterDefinitions.length > 0) {
    return `No live badges are claimed for ${resolvedLabel}, but ${snapshot.farcasterDefinitions.length} Farcaster badge path${snapshot.farcasterDefinitions.length === 1 ? "" : "s"} can be checked here.`;
  }

  if (snapshot.unclaimedCount > 0) {
    return `No live badges are claimed for ${resolvedLabel}, but ${snapshot.unclaimedCount} badge path${snapshot.unclaimedCount === 1 ? "" : "s"} are available to explore.`;
  }

  return `No live claimed badges found for ${resolvedLabel}`;
}

function getClaimAssistantPrimaryAction(snapshot = claimAssistantState.snapshot) {
  if (!snapshot?.normalizedAgent) {
    return null;
  }

  if (snapshot.selfConnected && snapshot.eligibleFarcasterDefinitions.length > 0) {
    return {
      kind: "claim-farcaster",
      label:
        snapshot.eligibleFarcasterDefinitions.length === 1
          ? "Claim Farcaster Badge"
          : "Claim Eligible Badge",
      definitionEntry: snapshot.eligibleFarcasterDefinitions[0]
    };
  }

  return {
    kind: "open-profile",
    label: snapshot.selfConnected ? "Open Profile" : "View Profile"
  };
}

function hasClaimAssistantReadyBadges(snapshot) {
  if (!snapshot?.normalizedAgent) {
    return false;
  }

  if (snapshot.eligibleFarcasterDefinitions.length > 0) {
    return true;
  }

  return Boolean(snapshot.selfConnected && snapshot.unclaimedCount > 0);
}

function hasClaimAssistantPositiveLookup(snapshot) {
  if (!snapshot?.normalizedAgent) {
    return false;
  }

  return Boolean(
    snapshot.claimedCount > 0 ||
      snapshot.farcasterDefinitions.length > 0 ||
      snapshot.unclaimedCount > 0
  );
}

function isFarcasterAutoConnectTarget(rawValue) {
  const farcasterSession = getFarcasterSession();
  if (!farcasterSession.connected || !farcasterSession.isMiniApp || !farcasterSession.authAddress) {
    return false;
  }

  const trimmed = String(rawValue ?? "").trim();
  if (!trimmed) {
    return true;
  }

  return normalizeAgentValue(trimmed) === normalizeAgentValue(farcasterSession.authAddress);
}

function formatClaimAssistantWalletError(error) {
  const baseMessage = shortErrorMessage(error);
  const farcasterSession = getFarcasterSession();
  if (
    farcasterSession.connected &&
    farcasterSession.isMiniApp &&
    /network action|could not attach to this network|could not switch to the txs.quest network/i.test(
      baseMessage
    )
  ) {
    return "Your Farcaster account is verified and the badge check worked, but the Mini App wallet could not switch to Tempo Moderato yet. Claiming will work once this wallet supports the txs.quest network.";
  }

  return baseMessage;
}

function primeClaimAssistantAction(definitionId, agent, executionPath = "direct") {
  const definition = getDefinitionById(definitionId);
  if (!definition) {
    throw new Error("That badge definition is no longer available.");
  }

  claimDefinitionSelect.value = String(definition.id);
  claimAgentInput.value = agent;
  claimExecutionPathSelect.value = executionPath;
  claimProofPackageInput.value = "";
  previewBadgeDefinition(definition.id, { activateDetailMode: true });
  updateClaimProofStatus();
  return definition;
}

function renderClaimAssistantSnapshot(snapshot) {
  if (!claimAssistantSummaryTitle || !claimAssistantSummarySubtitle || !claimAssistantChipList) {
    return;
  }

  if (!snapshot?.normalizedAgent) {
    claimAssistantState.snapshot = null;
    claimAssistantSummaryTitle.textContent = "Connect a wallet to get started";
    claimAssistantSummarySubtitle.textContent =
      "We’ll show live badge ownership, profile links, and the claim path for any unclaimed badges we can classify without generating paid proofs.";
    claimAssistantChipList.innerHTML = "";
    renderClaimAssistantItems(
      claimAssistantOutlook,
      [],
      "Connect a wallet or paste an ENS / wallet address to see the live badge outlook."
    );
    renderClaimAssistantItems(
      claimAssistantNext,
      [],
      "Once we know the agent address, we’ll show the next badge paths here."
    );
    if (claimAssistantOpenProfileButton) {
      claimAssistantOpenProfileButton.hidden = true;
      claimAssistantOpenProfileButton.disabled = true;
      claimAssistantOpenProfileButton.textContent = "Open Profile";
    }
    return;
  }

  claimAssistantState.snapshot = snapshot;
  claimAssistantSummaryTitle.textContent = getClaimAssistantHeadline(snapshot);
  claimAssistantSummarySubtitle.textContent = snapshot.selfConnected
    ? snapshot.unclaimedCount > 0
      ? `${snapshot.unclaimedCount} more badge path${snapshot.unclaimedCount === 1 ? "" : "s"} can be checked from this connected wallet now. Direct checks stay local; paid x402 / MPP proofs only run when you actively claim.`
      : "This connected wallet is matched to the agent. Open the profile to review earned badges and future claim paths."
    : snapshot.eligibleFarcasterDefinitions.length > 0
      ? `This Farcaster account already qualifies. Connect ${shortAddress(
          snapshot.farcasterSession?.authAddress || snapshot.normalizedAgent
        )} with the wallet button to sign the onchain claim.`
      : "Connect this exact agent wallet to check self-claim paths live. Proof-based and paid routes are only evaluated when that wallet actively claims.";

  claimAssistantChipList.innerHTML = [
    `${shortAddress(snapshot.displayAgent)}`,
    `${snapshot.claimedCount} claimed`,
    `${snapshot.directDefinitions.length} direct path${snapshot.directDefinitions.length === 1 ? "" : "s"}`,
    `${snapshot.proofDefinitions.length} proof path${snapshot.proofDefinitions.length === 1 ? "" : "s"}`,
    `${snapshot.farcasterDefinitions.length} Farcaster path${snapshot.farcasterDefinitions.length === 1 ? "" : "s"}`,
    `${snapshot.eligibleFarcasterDefinitions.length} Farcaster ready`,
    `${snapshot.attestorDefinitions.length} attestor path${snapshot.attestorDefinitions.length === 1 ? "" : "s"}`
  ]
    .map((value) => `<span class="chip">${escapeHtml(value)}</span>`)
    .join("");

  renderClaimAssistantItems(
    claimAssistantOutlook,
    [
      {
        label: "Live Claims",
        value: `${snapshot.claimedCount} badge${snapshot.claimedCount === 1 ? "" : "s"} already claimed across ${snapshot.claimRecordCount} claim record${snapshot.claimRecordCount === 1 ? "" : "s"}.`
      },
      {
        label: "Direct Self-Claim",
        value: snapshot.directDefinitions.length
          ? `${snapshot.directDefinitions.length} badge path${snapshot.directDefinitions.length === 1 ? "" : "s"} can be checked with the connected wallet and onchain state.`
          : "No direct self-claim paths are visible from the current badge set."
      },
      {
        label: "Proof-Based",
        value: snapshot.proofDefinitions.length
          ? `${snapshot.proofDefinitions.length} badge path${snapshot.proofDefinitions.length === 1 ? "" : "s"} need an 8183 proof, x402 history, payment history, or oracle / peer attestation.`
          : "No proof-backed paths are visible for the current badge set."
      },
      {
        label: "Farcaster",
        value: snapshot.farcasterDefinitions.length
          ? snapshot.eligibleFarcasterDefinitions.length
            ? `${snapshot.eligibleFarcasterDefinitions.length} Farcaster badge path${snapshot.eligibleFarcasterDefinitions.length === 1 ? "" : "s"} already match the connected Farcaster account and can request a proof now.`
            : `${snapshot.farcasterDefinitions.length} badge path${snapshot.farcasterDefinitions.length === 1 ? "" : "s"} can only be checked after opening txs.quest inside Farcaster and connecting with Quick Auth.`
          : "No Farcaster-only badge paths are visible right now."
      },
      {
        label: "Manual Attestor",
        value: snapshot.attestorDefinitions.length
          ? `${snapshot.attestorDefinitions.length} badge path${snapshot.attestorDefinitions.length === 1 ? "" : "s"} still require an authorized attestor.`
          : "No manual attestor-only badges are visible right now."
      }
    ],
    "No badge outlook is available yet."
  );

  renderClaimAssistantItems(
    claimAssistantNext,
    snapshot.nextDefinitions.map((entry) => ({
      label: `${entry.definition.name} · ${entry.adapterSummary.title}`,
      value:
        entry.unlockAdapterConfig?.unlockAdapterType === "FARCASTER_ACCOUNT"
          ? (() => {
              const farcasterSession = snapshot.farcasterSession ?? getFarcasterSession();
              const sameWallet =
                normalizeAgentValue(farcasterSession?.authAddress) === snapshot.normalizedAgent;
              const requirement = formatFarcasterCriteriaRequirement({
                minFid: entry.unlockAdapterConfig?.unlockThreshold
              });
              if (!farcasterSession?.isMiniApp || !farcasterSession?.connected) {
                return "Use Open in Farcaster, connect with Quick Auth there, then use the same wallet to claim this badge.";
              }
              if (!sameWallet) {
                return "Your Farcaster Quick Auth wallet must match the agent wallet before this badge can be claimed.";
              }
              if (
                matchesFarcasterCriteria(farcasterSession.fid, {
                  minFid: entry.unlockAdapterConfig?.unlockThreshold
                })
              ) {
                return `Your connected Farcaster account qualifies now (${requirement}). Claim this badge to request the proof.`;
              }
              return `This badge needs ${requirement}. Your connected Farcaster fid is ${farcasterSession.fid || 0}.`;
            })()
          : snapshot.selfConnected
            ? entry.adapterSummary.executionHint
            : "Connect this exact wallet to check or claim this path live."
    })),
    "No additional badge paths are visible beyond the badges already claimed."
  );

  if (claimAssistantOpenProfileButton) {
    const primaryAction = getClaimAssistantPrimaryAction(snapshot);
    claimAssistantOpenProfileButton.hidden = !primaryAction;
    claimAssistantOpenProfileButton.disabled =
      !primaryAction ||
      (primaryAction.kind === "open-profile" && !snapshot.profileUrl);
    claimAssistantOpenProfileButton.textContent = primaryAction?.label || "Open Profile";
  }
}

async function ensureClaimAssistantRegistry() {
  if (onchainConfig.mode === "onchain" && isOnchainConfigured(onchainConfig)) {
    if (registryState.definitions.length === 0) {
      await refreshOnchainRegistryState({ loadLatestClaim: false });
    }
    return;
  }

  if (isLocalhostRuntime()) {
    return;
  }

  const deployment = await loadDeploymentProfile(DEFAULT_LIVE_DEPLOYMENT_URL);
  onchainConfig = normalizeDeploymentConfig({
    ...deployment,
    deploymentProfileUrl: DEFAULT_LIVE_DEPLOYMENT_URL
  });
  saveOnchainConfig(onchainConfig);
  syncConnectionForm(onchainConfig);
  await refreshOnchainRegistryState({ loadLatestClaim: false });
}

async function resolveClaimAssistantAgent(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    throw new Error("Enter an ENS name or 0x wallet address.");
  }

  if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
    return {
      address: trimmed,
      label: trimmed
    };
  }

  if (/\.eth$/i.test(trimmed)) {
    const address = await ensPublicClient.getEnsAddress({
      name: trimmed.toLowerCase()
    });
    if (!address) {
      throw new Error("That ENS name does not currently resolve to a wallet address.");
    }

    return {
      address,
      label: trimmed.toLowerCase()
    };
  }

  throw new Error("Enter a valid ENS name or 0x wallet address.");
}

function setClaimAssistantStatus(message = "", isError = false) {
  if (!claimAssistantStatus) {
    return;
  }

  noteInteractionStatus(message, { isError });

  // Wrap .eth names in a blue pill
  const ensMatch = message.match(/(\S+\.eth)/i);
  if (ensMatch && !isError) {
    const parts = message.split(ensMatch[1]);
    claimAssistantStatus.innerHTML = "";
    claimAssistantStatus.append(
      document.createTextNode(parts[0]),
      Object.assign(document.createElement("span"), {
        className: "ens-pill",
        textContent: ensMatch[1],
      }),
      document.createTextNode(parts[1] || "")
    );
  } else {
    claimAssistantStatus.textContent = message;
  }
  claimAssistantStatus.classList.toggle("is-error", Boolean(isError));
}

function buildFarcasterManifestCommand({ header = "", payload = "", signature = "" } = {}) {
  return [
    "bun run farcaster:set-domain",
    "--header '" + header + "'",
    "--payload '" + payload + "'",
    "--signature '" + signature + "'"
  ].join(" ");
}

function formatFarcasterManifestError(error) {
  const name = String(error?.name ?? "");
  if (name === "SignManifest.InvalidDomain") {
    return "Farcaster rejected the txs.quest domain. Make sure you opened the canonical txs.quest Mini App inside Farcaster, then try again.";
  }
  if (name === "SignManifest.RejectedByUser") {
    return "The Farcaster manifest signature request was rejected.";
  }
  if (name === "SignManifest.GenericError") {
    return error?.message || "Farcaster could not sign the Mini App manifest yet.";
  }
  return shortErrorMessage(error);
}

function buildFarcasterManifestDebug(error = null, session = getFarcasterSession()) {
  const lines = [
    `host: ${window.location.hostname}`,
    `path: ${window.location.pathname}`,
    `isMiniApp: ${Boolean(session?.isMiniApp)}`,
    `connected: ${Boolean(session?.connected)}`,
    `username: ${session?.username || ""}`,
    `fid: ${session?.fid || 0}`,
    `authMethod: ${session?.authMethod || ""}`,
    `authAddress: ${session?.authAddress || ""}`,
    `capabilities: ${Array.isArray(session?.capabilities) ? session.capabilities.join(", ") : ""}`
  ];

  if (error) {
    lines.push(`error.name: ${String(error?.name ?? "")}`);
    lines.push(`error.message: ${String(error?.message ?? "")}`);
    if (error?.stack) {
      lines.push("error.stack:");
      lines.push(String(error.stack));
    }
  }

  return lines.join("\n").trim();
}

function renderFarcasterManifestState(session = getFarcasterSession()) {
  if (!claimAssistantManifestSection) {
    return;
  }

  const shouldShow = Boolean(session?.isMiniApp);
  claimAssistantManifestSection.hidden = !shouldShow;
  if (!shouldShow) {
    return;
  }

  if (claimAssistantSignManifestButton) {
    claimAssistantSignManifestButton.disabled = farcasterManifestState.loading;
    claimAssistantSignManifestButton.textContent = farcasterManifestState.loading
      ? "Generating..."
      : "Generate Signature";
  }

  const hasSignature = Boolean(farcasterManifestState.command);
  if (claimAssistantCopyManifestCommandButton) {
    claimAssistantCopyManifestCommandButton.hidden = !hasSignature;
    claimAssistantCopyManifestCommandButton.disabled = !hasSignature;
  }
  if (claimAssistantManifestOutput) {
    claimAssistantManifestOutput.hidden = !hasSignature;
  }
  if (claimAssistantManifestCommand) {
    claimAssistantManifestCommand.textContent = farcasterManifestState.command;
  }
  if (claimAssistantManifestHeader) {
    claimAssistantManifestHeader.value = farcasterManifestState.header;
  }
  if (claimAssistantManifestPayload) {
    claimAssistantManifestPayload.value = farcasterManifestState.payload;
  }
  if (claimAssistantManifestSignature) {
    claimAssistantManifestSignature.value = farcasterManifestState.signature;
  }
  if (claimAssistantManifestDebug) {
    claimAssistantManifestDebug.hidden = !farcasterManifestState.debug;
  }
  if (claimAssistantManifestDebugOutput) {
    claimAssistantManifestDebugOutput.textContent = farcasterManifestState.debug;
  }
}

function updateClaimAssistantButtons() {
  if (!claimAssistantConnectButton || !claimAssistantUseConnectedButton) {
    return;
  }

  const farcasterSession = getFarcasterSession();
  const farcasterWallet = getFarcasterMiniAppWallet({
    allowLocalDev: true,
    chainId: connectionChainIdInput?.value || onchainConfig.chainId
  });
  claimAssistantConnectButton.textContent = onchainConfig.walletAddress
    ? `Connected ${shortAddress(onchainConfig.walletAddress)}`
    : farcasterSession.connected && farcasterSession.authAddress && farcasterWallet
      ? `Connect ${shortAddress(farcasterSession.authAddress)} via Farcaster`
      : farcasterSession.connected && farcasterSession.authAddress
        ? `Connect ${shortAddress(farcasterSession.authAddress)}`
      : "Connect Wallet";
  claimAssistantUseConnectedButton.disabled = !onchainConfig.walletAddress;
  if (claimAssistantFarcasterButton) {
    claimAssistantFarcasterButton.textContent = farcasterSession.connected
      ? describeFarcasterSession(farcasterSession)
      : farcasterSession.checked && !farcasterSession.isMiniApp
        ? "Open in Farcaster"
        : "Connect Farcaster";
  }
  renderFarcasterManifestState(farcasterSession);
}

function isClaimAssistantRouteActive() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    const url = new URL(window.location.href);
    return url.pathname === "/claim" || url.searchParams.get("claimAssistant") === "1";
  } catch {
    return false;
  }
}

function openClaimAssistantModal({ syncUrl = true, target = "" } = {}) {
  if (!claimAssistantModal) {
    return;
  }

  claimAssistantState.isOpen = true;
  claimAssistantModal.hidden = false;
  document.body.style.overflow = "hidden";
  updateClaimAssistantButtons();
  if (!claimAssistantState.resolvedAgent && onchainConfig.walletAddress && claimAssistantInput) {
    claimAssistantInput.value = onchainConfig.walletAddress;
  }

  if (syncUrl) {
    syncBrowserUrlForClaimAssistant(target || claimAssistantInput?.value || onchainConfig.walletAddress || "");
  }
  prepareFarcasterConnect()
    .catch(() => null)
    .finally(() => {
      updateClaimAssistantButtons();
    });
}

function closeClaimAssistantModal({ syncUrl = true } = {}) {
  if (!claimAssistantModal) {
    return;
  }

  claimAssistantState.isOpen = false;
  claimAssistantModal.hidden = true;
  document.body.style.overflow = "";

  if (syncUrl && isClaimAssistantRouteActive()) {
    syncBrowserUrlForWall();
  }
}

async function runClaimAssistantLookup(rawValue, { silent = false } = {}) {
  try {
    claimAssistantState.loading = true;
    setClaimAssistantStatus(silent ? "" : "Checking the live badge registry...");
    await ensureClaimAssistantRegistry();
    const resolved = await resolveClaimAssistantAgent(rawValue);
    claimAssistantState.resolvedAgent = resolved.address;
    claimAssistantState.resolvedLabel = resolved.label;
    claimAssistantState.selfConnected =
      normalizeAgentValue(resolved.address) === normalizeAgentValue(onchainConfig.walletAddress);
    const snapshot = getClaimAssistantSnapshot(resolved.address);
    claimAssistantState.selfConnected = snapshot.selfConnected;
    renderClaimAssistantSnapshot(snapshot);
    if (hasClaimAssistantReadyBadges(snapshot)) {
      playClaimReadyCue();
    } else if (hasClaimAssistantPositiveLookup(snapshot)) {
      playLookupPositiveCue();
    }
    setClaimAssistantStatus(getClaimAssistantStatusMessage(snapshot, resolved.label));
  } catch (error) {
    claimAssistantState.resolvedAgent = "";
    claimAssistantState.resolvedLabel = "";
    renderClaimAssistantSnapshot(null);
    setClaimAssistantStatus(shortErrorMessage(error), true);
  } finally {
    claimAssistantState.loading = false;
    updateClaimAssistantButtons();
  }
}

async function connectClaimAssistantWalletAndLookup() {
  let draftConfig = readConnectionFormValues();
  const farcasterSession = getFarcasterSession();
  if (farcasterSession.connected && farcasterSession.isMiniApp) {
    await refreshWalletProviders();
    const farcasterWallet = getFarcasterMiniAppWallet({
      allowLocalDev: true,
      chainId: draftConfig.chainId
    });
    if (farcasterWallet) {
      connectionWalletProviderSelect.value = farcasterWallet.id;
      draftConfig = {
        ...draftConfig,
        walletProviderId: farcasterWallet.id
      };
    }
  }
  const wallet = await resolveSelectedWallet(draftConfig);
  onchainConfig = await connectOnchainWallet(draftConfig, wallet);
  saveOnchainConfig(onchainConfig);
  syncConnectionForm(onchainConfig);
  await refreshOnchainRegistryState({ loadLatestClaim: false });
  openClaimAssistantModal({
    target: onchainConfig.walletAddress || ""
  });
  if (claimAssistantInput) {
    claimAssistantInput.value = onchainConfig.walletAddress || claimAssistantInput.value;
  }
  await runClaimAssistantLookup(onchainConfig.walletAddress, { silent: true });
  if (
    farcasterSession.connected &&
    farcasterSession.authAddress &&
    normalizeAgentValue(farcasterSession.authAddress) !== normalizeAgentValue(onchainConfig.walletAddress)
  ) {
    setClaimAssistantStatus(
      `Farcaster verified ${shortAddress(farcasterSession.authAddress)}, but the connected wallet is ${shortAddress(onchainConfig.walletAddress)}. Use the Farcaster Mini App wallet for this badge.`,
      true
    );
  }
  return wallet;
}

async function connectClaimAssistantFarcasterAndLookup({
  preferredTarget = "",
  allowLaunch = true
} = {}) {
  const initialSession = await prepareFarcasterConnect().catch(() => getFarcasterSession());
  if (!initialSession.isMiniApp) {
    if (allowLaunch) {
      const launchUrl = openFarcasterClaim({
        target: preferredTarget || claimAssistantInput?.value || onchainConfig.walletAddress || ""
      });
      return {
        ...initialSession,
        launched: true,
        launchUrl
      };
    }
    throw new Error("Open txs.quest inside Farcaster to connect with Quick Auth.");
  }

  const farcasterSession = await connectFarcaster({ force: true });
  await refreshWalletProviders();
  const targetAddress = farcasterSession.authAddress || "";
  updateClaimAssistantButtons();
  if (!targetAddress) {
    openClaimAssistantModal({
      target: preferredTarget || ""
    });
    return {
      ...farcasterSession,
      missingAuthAddress: true
    };
  }
  if (claimAssistantInput) {
    claimAssistantInput.value = targetAddress;
  }
  openClaimAssistantModal({
    target: targetAddress
  });
  await runClaimAssistantLookup(targetAddress, { silent: true });
  return farcasterSession;
}

async function openClaimAssistantFromRoute(target = "", { preferFarcaster = false } = {}) {
  openClaimAssistantModal({
    syncUrl: false,
    target
  });

  const normalizedTarget = typeof target === "string" ? target.trim() : "";
  if (preferFarcaster) {
    const farcasterSession = await prepareFarcasterConnect().catch(() => null);
    if (farcasterSession?.isMiniApp) {
      updateClaimAssistantButtons();
      if (!normalizedTarget) {
        setClaimAssistantStatus(
          "Connect Farcaster to verify Farcaster badges, or generate the Mini App signature below."
        );
        renderClaimAssistantSnapshot(null);
        return;
      }
    }
  }

  if (normalizedTarget) {
    if (claimAssistantInput) {
      claimAssistantInput.value = normalizedTarget;
    }
    await runClaimAssistantLookup(normalizedTarget, { silent: true });
    return;
  }

  if (onchainConfig.walletAddress) {
    if (claimAssistantInput) {
      claimAssistantInput.value = onchainConfig.walletAddress;
    }
    await runClaimAssistantLookup(onchainConfig.walletAddress, { silent: true });
    return;
  }

  setClaimAssistantStatus("Connect a wallet or enter an agent address to check live badges.");
  renderClaimAssistantSnapshot(null);
  updateClaimAssistantButtons();
}

function setGalleryUiState({ loading = false, errorMessage = "" } = {}) {
  galleryUiState = {
    loading,
    errorMessage
  };
}

function getGalleryScopeAgent() {
  const normalizedAgent = normalizeAgentValue(claimAgentInput.value);
  return /^0x[a-f0-9]{40}$/.test(normalizedAgent) ? normalizedAgent : "";
}

function getGalleryBaseClaims() {
  return registryState.claims.map((claimEntry) => {
    const definition = getDefinitionById(claimEntry.definitionId);
    const title = definition?.name ?? claimEntry.claim?.name ?? `Badge #${claimEntry.definitionId}`;
    const edition = claimEntry.claim?.properties?.edition ?? definition?.asset?.edition ?? "launch";
    const loopSeconds = Number(
      claimEntry.claim?.properties?.loop_seconds ?? definition?.asset?.loopSeconds ?? 5
    );
    const badgeLabel = badgeTypeLabel(definition?.badgeType ?? "CUSTOM");
    const verificationLabel =
      claimEntry.claim?.attributes?.find?.((entry) => entry.trait_type === "Verification")?.value ??
      "Unknown";
    const shareUrl = getClaimShareUrl(claimEntry);
    const reputationSummary = getClaimReputationSummary(claimEntry);
    const videoUri =
      claimEntry.claim?.animation_url ??
      claimEntry.claim?.animationUrl ??
      claimEntry.claim?.properties?.video_uri ??
      definition?.asset?.videoUri ??
      "";

    return {
      ...claimEntry,
      definition,
      title,
      edition,
      loopSeconds,
      badgeLabel,
      verificationLabel,
      videoUri,
      shareUrl,
      reputationSummary
    };
  });
}

function getBadgeGridEntries() {
  const galleryClaims = getGalleryBaseClaims();

  return SAMPLE_PIN_OPTIONS
    .map((pinOption) => {
      const relatedClaims = galleryClaims
        .filter((claimEntry) =>
          assetMatchesPin(
            {
              posterUri: claimEntry.claim?.image ?? claimEntry.definition?.asset?.posterUri ?? "",
              videoUri: claimEntry.videoUri ?? claimEntry.definition?.asset?.videoUri ?? ""
            },
            pinOption
          )
        )
        .sort((first, second) => {
          const claimedAtDelta = second.claimedAt - first.claimedAt;
          if (claimedAtDelta !== 0) {
            return claimedAtDelta;
          }
          return second.id - first.id;
        });
      const latestClaim = relatedClaims[0] ?? null;
      const posterUri =
        latestClaim?.claim?.image ??
        latestClaim?.definition?.asset?.posterUri ??
        pinOption.asset.posterUri ??
        "";
      const videoUri =
        latestClaim?.claim?.animation_url ??
        latestClaim?.claim?.animationUrl ??
        latestClaim?.claim?.properties?.video_uri ??
        latestClaim?.definition?.asset?.videoUri ??
        pinOption.asset.videoUri ??
        "";
      const catalogEntry = pinOption.catalog ?? null;
      const title = latestClaim?.definition?.name ?? catalogEntry?.name ?? pinOption.label;
      const edition =
        latestClaim?.claim?.properties?.edition ??
        latestClaim?.definition?.asset?.edition ??
        pinOption.asset.edition ??
        pinOption.id;
      const verificationLabel =
        latestClaim?.claim?.attributes?.find?.((entry) => entry.trait_type === "Verification")?.value ??
        (videoUri ? "Looping video" : "Poster fallback");

      return {
        pinId: pinOption.id,
        title,
        description: latestClaim?.definition?.description ?? catalogEntry?.description ?? "",
        claimCondition:
          latestClaim?.definition?.claimCondition ?? catalogEntry?.claimCondition ?? "",
        catalogEntry,
        edition,
        posterUri,
        videoUri,
        latestClaim,
        shareUrl: latestClaim ? getClaimShareUrl(latestClaim) : "",
        claimCount: relatedClaims.length,
        latestClaimedAt: latestClaim?.claimedAt ?? 0,
        verificationLabel,
        asset: pinOption.asset
      };
    })
    .sort((first, second) => {
      const firstIndex = RANDOMIZED_BADGE_PIN_INDEX.get(first.pinId) ?? Number.MAX_SAFE_INTEGER;
      const secondIndex = RANDOMIZED_BADGE_PIN_INDEX.get(second.pinId) ?? Number.MAX_SAFE_INTEGER;
      if (firstIndex !== secondIndex) {
        return firstIndex - secondIndex;
      }

      return first.pinId.localeCompare(second.pinId, undefined, {
        numeric: true,
        sensitivity: "base"
      });
    });
}

function matchesGalleryScope(claimEntry, scopeValue) {
  if (scopeValue === "shareable") {
    return Boolean(claimEntry.shareUrl);
  }

  if (scopeValue === "selected-agent") {
    const selectedAgent = getGalleryScopeAgent();
    return selectedAgent ? normalizeAgentValue(claimEntry.agent) === selectedAgent : true;
  }

  if (scopeValue === "recent") {
    const nowSeconds = Math.floor(Date.now() / 1000);
    return claimEntry.claimedAt >= nowSeconds - 7 * 24 * 60 * 60;
  }

  return true;
}

function sortGalleryClaims(claims, sortValue) {
  const collator = new Intl.Collator(undefined, {
    sensitivity: "base"
  });

  const sortedClaims = [...claims];
  sortedClaims.sort((first, second) => {
    if (sortValue === "oldest") {
      return first.claimedAt - second.claimedAt;
    }

    if (sortValue === "reputation") {
      const repDelta =
        Number(second.reputationSummary?.summaryValue ?? 0) -
        Number(first.reputationSummary?.summaryValue ?? 0);
      if (repDelta !== 0) {
        return repDelta;
      }
      return second.claimedAt - first.claimedAt;
    }

    if (sortValue === "badge") {
      const titleDelta = collator.compare(first.title, second.title);
      if (titleDelta !== 0) {
        return titleDelta;
      }
      return second.claimedAt - first.claimedAt;
    }

    return second.claimedAt - first.claimedAt;
  });

  return sortedClaims;
}

function getPreparedGalleryClaims({ includeSelectedAgentFilter = true } = {}) {
  const query = galleryFilterInput.value.trim().toLowerCase();
  const scopeValue = galleryScopeSelect.value;
  const sortValue = gallerySortSelect.value;

  const filteredClaims = getGalleryBaseClaims().filter((claimEntry) => {
    const haystack = [
      claimEntry.title,
      claimEntry.agent,
      claimEntry.edition,
      claimEntry.badgeLabel,
      claimEntry.verificationLabel
    ]
      .join(" ")
      .toLowerCase();

    return (!query || haystack.includes(query)) && matchesGalleryScope(claimEntry, scopeValue);
  });

  const shelfFilteredClaims = includeSelectedAgentFilter
    ? filteredClaims.filter((claimEntry) =>
        selectedShelfAgent ? normalizeAgentValue(claimEntry.agent) === selectedShelfAgent : true
      )
    : filteredClaims;

  return sortGalleryClaims(shelfFilteredClaims, sortValue);
}

function renderGalleryHeader(claims) {
  galleryVisibleCount.textContent = String(claims.length);
  galleryAgentCount.textContent = String(
    new Set(claims.map((claimEntry) => normalizeAgentValue(claimEntry.agent))).size
  );

  if (galleryUiState.loading) {
    galleryStatus.textContent = "Loading claims from the registry...";
    galleryStatus.classList.remove("is-error");
    return;
  }

  if (galleryUiState.errorMessage) {
    galleryStatus.textContent = galleryUiState.errorMessage;
    galleryStatus.classList.add("is-error");
    return;
  }

  const filters = [];
  if (galleryScopeSelect.value !== "all") {
    filters.push(galleryScopeSelect.options[galleryScopeSelect.selectedIndex]?.textContent ?? "Scoped");
  }
  if (selectedShelfAgent) {
    filters.push(`Agent ${shortAddress(selectedShelfAgent)}`);
  }
  if (galleryFilterInput.value.trim()) {
    filters.push(`Query "${galleryFilterInput.value.trim()}"`);
  }

  galleryStatus.textContent =
    claims.length > 0
      ? `Showing ${claims.length} claim${claims.length === 1 ? "" : "s"} across ${new Set(
          claims.map((claimEntry) => normalizeAgentValue(claimEntry.agent))
        ).size} agent${new Set(claims.map((claimEntry) => normalizeAgentValue(claimEntry.agent))).size === 1 ? "" : "s"}${
          filters.length ? ` · ${filters.join(" · ")}` : ""
        }.`
      : "No claims match the current gallery view yet.";
  galleryStatus.classList.remove("is-error");
}

function renderAgentShelf() {
  const shelfClaims = getPreparedGalleryClaims({
    includeSelectedAgentFilter: false
  });

  if (galleryUiState.loading) {
    clearAgentFilterButton.disabled = !selectedShelfAgent;
    agentShelf.innerHTML = '<p class="empty-state"><strong>Agent shelf</strong>Loading agent slices...</p>';
    return;
  }

  if (shelfClaims.length === 0) {
    selectedShelfAgent = "";
    clearAgentFilterButton.disabled = true;
    agentShelf.innerHTML =
      '<p class="empty-state"><strong>Agent shelf</strong>No agent slices yet. Issue or load claims to populate shelves.</p>';
    return;
  }

  const groupedAgents = [...shelfClaims.reduce((groups, claimEntry) => {
    const key = normalizeAgentValue(claimEntry.agent);
    const existing = groups.get(key) ?? {
      agent: claimEntry.agent,
      count: 0,
      latestClaimedAt: 0,
      reputationSummary: claimEntry.reputationSummary
    };
    existing.count += 1;
    existing.latestClaimedAt = Math.max(existing.latestClaimedAt, claimEntry.claimedAt);
    if (
      Number(claimEntry.reputationSummary?.summaryValue ?? 0) >
      Number(existing.reputationSummary?.summaryValue ?? 0)
    ) {
      existing.reputationSummary = claimEntry.reputationSummary;
    }
    groups.set(key, existing);
    return groups;
  }, new Map()).values()]
    .sort((first, second) => {
      const countDelta = second.count - first.count;
      if (countDelta !== 0) {
        return countDelta;
      }
      return second.latestClaimedAt - first.latestClaimedAt;
    })
    .slice(0, 8);

  if (
    selectedShelfAgent &&
    !groupedAgents.some((entry) => normalizeAgentValue(entry.agent) === selectedShelfAgent)
  ) {
    selectedShelfAgent = "";
  }

  clearAgentFilterButton.disabled = !selectedShelfAgent;

  agentShelf.innerHTML = groupedAgents
    .map(
      (entry) => `
        <button
          type="button"
          class="agent-chip${normalizeAgentValue(entry.agent) === selectedShelfAgent ? " is-selected" : ""}"
          data-agent-filter="${entry.agent}"
          data-view-profile="${entry.agent}"
        >
          <span>${escapeHtml(shortAddress(entry.agent))}</span>
          <strong>${escapeHtml(`${entry.count} claim${entry.count === 1 ? "" : "s"}`)}</strong>
        </button>
      `
    )
    .join("");
}

function buildCardMediaMarkup({
  title,
  posterUri = "",
  videoUri = "",
  posterClass = "",
  videoClass = ""
}) {
  if (!posterUri && !videoUri) {
    return '<div class="card-media"><div class="card-poster is-empty" aria-hidden="true"></div></div>';
  }

  const resolvedPosterClass = ["card-poster", posterClass].filter(Boolean).join(" ");
  const resolvedVideoClass = ["card-hover-video", videoClass].filter(Boolean).join(" ");
  const posterMarkup = posterUri
    ? `<img class="${escapeHtml(resolvedPosterClass)}" src="${escapeHtml(posterUri)}" alt="${escapeHtml(
        title
      )} poster" loading="lazy" decoding="async" fetchpriority="low" />`
    : `<div class="${escapeHtml(resolvedPosterClass)} is-empty" aria-hidden="true"></div>`;
  const videoMarkup = videoUri
    ? `<video class="${escapeHtml(resolvedVideoClass)}" muted loop playsinline preload="none" poster="${escapeHtml(
        posterUri || ""
      )}" data-video-src="${escapeHtml(videoUri)}" aria-label="${escapeHtml(title)} preview"></video>`
    : "";

  return `
    <div class="card-media">
      ${posterMarkup}
      ${videoMarkup}
    </div>
  `;
}

function previewBadgeDefinition(definitionId, { activateDetailMode = true } = {}) {
  const definition = getDefinitionById(definitionId);
  if (!definition) {
    return false;
  }

  enterDetailView(activateDetailMode, {
    scrollToTop: activateDetailMode
  });
  selectedGalleryClaimId = 0;
  claimDefinitionSelect.value = String(definition.id);
  clearCurrentObjectUrl();
  setPreviewSource({
    type: "definition",
    name: definition.name,
    videoUri: definition.asset?.videoUri || "",
    posterUri: definition.asset?.posterUri || "",
    meta: definition.asset?.videoUri
      ? "Muted autoplaying loop with matching poster."
      : "Poster fallback preview.",
    assetDraft: definition.asset
  });
  setAssetStatus(`Previewing ${definition.name}.`);
  renderGallerySurface();
  updateClaimProofStatus();
  updateLatestClaimOutputs(null);
  return true;
}

function previewPinAsset(pinId, { activateDetailMode = true, message = "" } = {}) {
  const pinOption = getSamplePinOption(pinId);
  if (!pinOption) {
    return false;
  }

  clearCurrentObjectUrl();
  selectedGalleryClaimId = 0;
  selectedProfileAgent = "";
  enterDetailView(activateDetailMode, {
    scrollToTop: activateDetailMode
  });
  setPreviewSource({
    type: "pin-wall",
    pinId: pinOption.id,
    name: pinOption.label,
    videoUri: pinOption.asset.videoUri,
    posterUri: pinOption.asset.posterUri,
    meta: pinOption.asset.videoUri
      ? `${pinOption.asset.edition} · ${pinOption.asset.loopSeconds || 5}s loop`
      : `${pinOption.asset.edition} · poster fallback`,
    assetDraft: pinOption.asset
  });
  renderGallerySurface();
  renderProfileSurface();
  renderDetailSurface(null);
  updateLatestClaimOutputs(null);
  syncBrowserUrlForSamplePin(pinOption.id);
  setAssetStatus(message || `Previewing ${pinOption.label} from the badge wall.`);
  return true;
}

function renderBadgeGrid() {
  if (galleryUiState.loading) {
    badgeGridStatus.textContent = "Loading pin assets...";
    badgeGridStatus.classList.remove("is-error");
    badgeGrid.innerHTML =
      '<p class="empty-state"><strong>Badge grid</strong>Loading the current pin wall.</p>';
    return;
  }

  const badgeEntries = getBadgeGridEntries();
  const totalSlots = Math.max(BADGE_GRID_MIN_SLOTS, badgeEntries.length);
  const emptySlotCount = Math.max(0, totalSlots - badgeEntries.length);

  if (galleryUiState.errorMessage) {
    badgeGridStatus.textContent = `${galleryUiState.errorMessage} Showing local pin assets instead.`;
    badgeGridStatus.classList.add("is-error");
  } else {
    badgeGridStatus.textContent =
      badgeEntries.length > 0
        ? `Showing ${badgeEntries.length} pin${badgeEntries.length === 1 ? "" : "s"} in a 4-column wall.`
        : "No pin assets were found for the badge wall.";
    badgeGridStatus.classList.remove("is-error");
  }

  if (badgeEntries.length === 0) {
    badgeGrid.innerHTML = Array.from({ length: BADGE_GRID_MIN_SLOTS }, () => {
      return `
        <article class="badge-tile is-empty">
          <div class="card-media"><div class="card-poster badge-tile-poster is-empty" aria-hidden="true"></div></div>
          <div class="badge-tile-body">
            <h3 class="badge-tile-title">Empty slot</h3>
            <p class="badge-tile-meta">Define the next badge to fill this space.</p>
          </div>
        </article>
      `;
    }).join("");
    return;
  }

  badgeGrid.innerHTML = [
    ...badgeEntries.map((entry) => {
      const isSelected =
        latestClaimEntry?.id === entry.latestClaim?.id ||
        (!latestClaimEntry && normalizeSamplePinId(currentSource?.pinId) === entry.pinId);

      return `
        <article
          class="badge-tile${isSelected ? " is-selected" : ""}"
          data-view-pin="${entry.pinId}"
          role="button"
          tabindex="0"
        >
          ${buildCardMediaMarkup({
            title: entry.title,
            posterUri: entry.posterUri,
            videoUri: entry.videoUri,
            posterClass: "badge-tile-poster",
            videoClass: "badge-tile-video"
          })}
          <div class="badge-tile-body">
            <h3 class="badge-tile-title">${escapeHtml(entry.title)}</h3>
            <p class="badge-tile-meta">${escapeHtml(
              entry.claimCount > 0
                ? `${entry.claimCount} claim${entry.claimCount === 1 ? "" : "s"} · ${entry.edition}`
                : `${entry.edition}${entry.videoUri ? " · video available" : " · poster fallback"}`
            )}</p>
          </div>
        </article>
      `;
    }),
    ...Array.from({ length: emptySlotCount }, () => {
      return `
        <article class="badge-tile is-empty">
          <div class="card-media"><div class="card-poster badge-tile-poster is-empty" aria-hidden="true"></div></div>
          <div class="badge-tile-body">
            <h3 class="badge-tile-title">Empty slot</h3>
            <p class="badge-tile-meta">Reserved for the next badge family.</p>
          </div>
        </article>
      `;
    })
  ].join("");

  syncLazyCardMedia(badgeGrid);
}

function renderGallerySurface() {
  renderBadgeGrid();
  renderAgentShelf();
  const preparedClaims = getPreparedGalleryClaims();
  renderGalleryHeader(preparedClaims);
  renderClaimGallery(preparedClaims);
}

function getInteractiveCardFromEventTarget(target) {
  return target?.closest?.(".badge-tile[data-view-pin], .claim-card[data-view-claim]") ?? null;
}

function loadCardVideo(video) {
  if (!(video instanceof HTMLVideoElement)) {
    return;
  }

  const src = video.dataset.videoSrc?.trim?.() ?? "";
  if (!src || video.src) {
    return;
  }

  video.src = src;
  video.removeAttribute("data-video-src");
  video.load();
}

function handleCardVideoFailure(video) {
  if (!(video instanceof HTMLVideoElement)) {
    return;
  }

  const card = video.closest(".badge-tile, .claim-card");
  video.pause();
  video.hidden = true;
  try {
    video.removeAttribute("src");
    video.load();
  } catch {
    // Ignore if the browser does not allow resetting the source.
  }
  card?.classList.remove("is-playing");
  card?.classList.add("has-video-fallback");
}

function syncLazyCardMedia(container) {
  if (!container) {
    return;
  }

  const videos = [...container.querySelectorAll(".card-hover-video")];
  videos.forEach((video) => {
    if (!(video instanceof HTMLVideoElement)) {
      return;
    }

    video.hidden = false;
    video.addEventListener(
      "error",
      () => {
        handleCardVideoFailure(video);
      },
      { once: true }
    );
  });

  if (!("IntersectionObserver" in window)) {
    videos.forEach(loadCardVideo);
    return;
  }

  if (!cardVideoObserver) {
    cardVideoObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          loadCardVideo(entry.target);
          cardVideoObserver?.unobserve(entry.target);
        });
      },
      {
        rootMargin: "240px 0px",
        threshold: 0.01
      }
    );
  }

  videos.forEach((video) => {
    if (video.dataset.videoSrc) {
      cardVideoObserver.observe(video);
    }
  });
}

function playHoverCardVideo(card) {
  if (!card || card.classList.contains("is-empty")) {
    return;
  }

  const video = card.querySelector(".card-hover-video");
  if (!(video instanceof HTMLVideoElement)) {
    return;
  }

  loadCardVideo(video);

  const startPlayback = () => {
    if (video.hidden) {
      return;
    }

    card.classList.add("is-playing");
    const playAttempt = video.play();
    if (playAttempt?.catch) {
      playAttempt.catch(() => {
        card.classList.remove("is-playing");
      });
    }
  };

  if (video.readyState < 2) {
    video.addEventListener("loadeddata", startPlayback, { once: true });
  }

  startPlayback();
}

function stopHoverCardVideo(card) {
  if (!card) {
    return;
  }

  const video = card.querySelector(".card-hover-video");
  if (!(video instanceof HTMLVideoElement)) {
    return;
  }

  video.pause();
  try {
    video.currentTime = 0;
  } catch {
    // Ignore if the browser does not allow seeking yet.
  }
  card.classList.remove("is-playing");
}

function handleCardHoverStart(event) {
  const card = getInteractiveCardFromEventTarget(event.target);
  if (!card) {
    return;
  }

  if (
    event.type === "mouseover" &&
    event.relatedTarget instanceof Element &&
    card.contains(event.relatedTarget)
  ) {
    return;
  }

  playHoverCardVideo(card);
}

function handleCardHoverEnd(event) {
  const card = getInteractiveCardFromEventTarget(event.target);
  if (!card) {
    return;
  }

  if (
    event.type === "mouseout" &&
    event.relatedTarget instanceof Element &&
    card.contains(event.relatedTarget)
  ) {
    return;
  }

  stopHoverCardVideo(card);
}

function clearCurrentObjectUrl() {
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = "";
  }
}

function setPreviewSource(source) {
  const version = ++previewSourceVersion;
  currentSource = source;

  previewTitle.textContent = source.name || "Agentic Pin";
  previewMeta.textContent =
    source.meta ||
    (source.videoUri ? "Muted autoplaying loop with matching poster." : "Poster fallback preview.");
  pinPoster.src = source.posterUri || "";
  pinPoster.hidden = !source.posterUri;
  pinVideo.poster = source.posterUri || "";
  pinVideo.onerror = null;
  pinVideo.hidden = !source.videoUri;

  if (!source.videoUri) {
    pinVideo.pause();
    pinVideo.removeAttribute("src");
    pinVideo.load();
    return;
  }

  pinVideo.src = source.videoUri || "";
  pinVideo.onerror = () => {
    if (version !== previewSourceVersion) {
      return;
    }

    pinVideo.pause();
    pinVideo.hidden = true;
    pinVideo.removeAttribute("src");
    pinVideo.load();
    previewMeta.textContent = `${source.meta || source.name || "Pin preview"} · poster fallback`;
  };
  pinVideo.load();
  void pinVideo.play().catch(() => {
    // Ignore autoplay blocks; controls remain available.
  });
}

function loadSamplePin(pinId, message = "") {
  clearCurrentObjectUrl();
  selectedProfileAgent = "";
  setDetailMode(false);
  const sample = getSamplePinOption(pinId);
  setPreviewSource({
    type: "sample-pin",
    pinId: sample.id,
    name: sample.label,
    videoUri: sample.asset.videoUri,
    posterUri: sample.asset.posterUri,
    meta: sample.asset.videoUri
      ? `${sample.asset.edition} · ${sample.asset.loopSeconds || 5}s loop`
      : `${sample.asset.edition} · poster fallback`,
    assetDraft: sample.asset
  });
  syncBrowserUrlForSamplePin(sample.id);
  setAssetStatus(
    message ||
      (sample.asset.videoUri
        ? `Viewing ${sample.label}. Poster + looping MP4 are the canonical asset package.`
        : `Viewing ${sample.label}. The static poster is active until a looping MP4 is available.`)
  );
  renderProfileSurface();
  renderDetailSurface(null);
}

function syncUnlockAdapterControls() {
  const adapterType = definitionUnlockAdapterSelect.value || "MANUAL_ATTESTOR";
  const targetLabel = definitionUnlockTargetInput.closest(".field");
  const thresholdLabel = definitionUnlockThresholdInput.closest(".field");
  const signerLabel = definitionUnlockSignerInput.closest(".field");
  const advancedConfig = readAdvancedPolicyFormValues();
  const reusableOracleSelected = isReusableOracleAdapter(adapterType);
  const paymentHistorySelected =
    adapterType === "X402_HISTORY" || adapterType === "PAYMENT_HISTORY";
  const proofCriteriaSelected =
    reusableOracleSelected || paymentHistorySelected || adapterType === "FARCASTER_ACCOUNT";
  const advancedEnabled = proofCriteriaSelected ? true : advancedConfig.enabled;
  const advancedCompatible =
    adapterType === "ORACLE_EVENT" ||
    adapterType === "FARCASTER_ACCOUNT" ||
    reusableOracleSelected ||
    adapterType === "AGENT_REP" ||
    adapterType === "X402_HISTORY" ||
    adapterType === "PAYMENT_HISTORY";
  const defaultAdvancedSchema =
    adapterType === "AGENT_REP"
      ? DEFAULT_AGENT_8183_SCHEMA
      : adapterType === "FARCASTER_ACCOUNT"
        ? DEFAULT_FARCASTER_8183_SCHEMA
      : adapterType === "WALLET_AGE_ACTIVITY"
        ? DEFAULT_WALLET_AGE_8183_SCHEMA
      : adapterType === "PROTOCOL_ACTIVITY"
        ? DEFAULT_PROTOCOL_ACTIVITY_8183_SCHEMA
      : adapterType === "PORTFOLIO_STATE"
        ? DEFAULT_PORTFOLIO_STATE_8183_SCHEMA
      : adapterType === "INTERNAL_SERVICE_ACTIVITY"
        ? DEFAULT_INTERNAL_SERVICE_ACTIVITY_8183_SCHEMA
      : adapterType === "PAYMENT_HISTORY"
        ? DEFAULT_PAYMENT_8183_SCHEMA
      : adapterType === "X402_HISTORY"
        ? DEFAULT_X402_8183_SCHEMA
        : DEFAULT_ORACLE_8183_SCHEMA;
  const targetLabelText = targetLabel?.querySelector("span");
  const thresholdLabelText = thresholdLabel?.querySelector("span");
  const signerLabelText = signerLabel?.querySelector("span");

  definitionVerificationTypeSelect.value = verificationTypeForAdapter(adapterType);
  definitionVerificationTypeSelect.disabled = true;
  definitionAdvancedEnabledInput.disabled = proofCriteriaSelected;
  if (proofCriteriaSelected) {
    definitionAdvancedEnabledInput.checked = true;
  }

  if (targetLabel) {
    targetLabel.hidden = adapterType !== "BADGE_COUNT" && adapterType !== "TOKEN_BALANCE";
  }
  if (thresholdLabel) {
    thresholdLabel.hidden =
      adapterType === "MANUAL_ATTESTOR" ||
      adapterType === "ORACLE_EVENT" ||
      reusableOracleSelected;
  }
  if (signerLabel) {
    signerLabel.hidden =
      adapterType !== "ORACLE_EVENT" &&
      adapterType !== "FARCASTER_ACCOUNT" &&
      !reusableOracleSelected &&
      adapterType !== "X402_HISTORY" &&
      adapterType !== "PAYMENT_HISTORY";
  }
  if (definitionOraclePanel) {
    definitionOraclePanel.hidden = !reusableOracleSelected;
  }
  if (definitionX402Panel) {
    definitionX402Panel.hidden = !paymentHistorySelected;
  }
  if (definitionX402RailModeSelect) {
    definitionX402RailModeSelect.disabled = adapterType === "X402_HISTORY";
    if (adapterType === "X402_HISTORY") {
      definitionX402RailModeSelect.value = "X402_ONLY";
    }
  }
  if (targetLabelText) {
    targetLabelText.textContent =
      adapterType === "TOKEN_BALANCE" ? "Token Contract" : "Unlock Target";
  }
  if (thresholdLabelText) {
    thresholdLabelText.textContent =
      adapterType === "X402_HISTORY" || adapterType === "PAYMENT_HISTORY"
        ? "Required Threshold"
        : adapterType === "TOKEN_BALANCE"
          ? "Minimum Balance"
          : adapterType === "BADGE_COUNT"
            ? "Minimum Count"
            : adapterType === "FARCASTER_ACCOUNT"
              ? "Minimum FID"
            : adapterType === "AGENT_REP"
              ? "Minimum Reputation"
              : "Unlock Threshold";
  }
  if (signerLabelText) {
    signerLabelText.textContent =
      adapterType === "X402_HISTORY"
        ? "x402 Proof Signer"
        : reusableOracleSelected
          ? "Oracle Proof Signer"
        : adapterType === "PAYMENT_HISTORY"
          ? "Payment Proof Signer"
          : adapterType === "FARCASTER_ACCOUNT"
            ? "Farcaster Proof Signer"
            : "Unlock Signer";
  }

  if (adapterType === "BADGE_COUNT" && !definitionUnlockTargetInput.value.trim()) {
    definitionUnlockTargetInput.value = onchainConfig.badgeRegistryAddress || "";
  }
  if (adapterType === "TOKEN_BALANCE" && !definitionUnlockTargetInput.value.trim()) {
    definitionUnlockTargetInput.value = onchainConfig.balanceTokenAddress || "";
  }
  if (
    (adapterType === "ORACLE_EVENT" ||
      adapterType === "FARCASTER_ACCOUNT" ||
      reusableOracleSelected ||
      adapterType === "X402_HISTORY" ||
      adapterType === "PAYMENT_HISTORY") &&
    !definitionUnlockSignerInput.value.trim()
  ) {
    definitionUnlockSignerInput.value = onchainConfig.walletAddress || LOCAL_DEV_ACCOUNT.address;
  }
  if (
    definitionAdvancedSchemaInput.value.trim() === "" ||
    definitionAdvancedSchemaInput.value.trim() === DEFAULT_ORACLE_8183_SCHEMA ||
    definitionAdvancedSchemaInput.value.trim() === DEFAULT_AGENT_8183_SCHEMA ||
    definitionAdvancedSchemaInput.value.trim() === DEFAULT_FARCASTER_8183_SCHEMA ||
    definitionAdvancedSchemaInput.value.trim() === DEFAULT_WALLET_AGE_8183_SCHEMA ||
    definitionAdvancedSchemaInput.value.trim() === DEFAULT_PROTOCOL_ACTIVITY_8183_SCHEMA ||
    definitionAdvancedSchemaInput.value.trim() === DEFAULT_PORTFOLIO_STATE_8183_SCHEMA ||
    definitionAdvancedSchemaInput.value.trim() === DEFAULT_INTERNAL_SERVICE_ACTIVITY_8183_SCHEMA ||
    definitionAdvancedSchemaInput.value.trim() === DEFAULT_PAYMENT_8183_SCHEMA ||
    definitionAdvancedSchemaInput.value.trim() === DEFAULT_X402_8183_SCHEMA
  ) {
    definitionAdvancedSchemaInput.value = defaultAdvancedSchema;
  }
  if (
    (adapterType === "ORACLE_EVENT" ||
      adapterType === "FARCASTER_ACCOUNT" ||
      reusableOracleSelected ||
      adapterType === "X402_HISTORY" ||
      adapterType === "PAYMENT_HISTORY") &&
    !definitionAdvancedIssuerInput.value.trim()
  ) {
    definitionAdvancedIssuerInput.value =
      definitionUnlockSignerInput.value.trim() ||
      onchainConfig.walletAddress ||
      LOCAL_DEV_ACCOUNT.address;
  }
  if (proofCriteriaSelected) {
    try {
      const proofPayload = buildUnlockAdapterPayload(
        {
          ...normalizeUnlockConfigFromForm(),
          unlockAdapterType: adapterType
        },
        {
          fallbackTargetAddress: onchainConfig.badgeRegistryAddress
        }
      );
      const derivedContext =
        proofPayload.unlockAdapterConfig?.farcasterCriteriaHash ||
        proofPayload.unlockAdapterConfig?.oracleCriteriaHash ||
        proofPayload.unlockAdapterConfig?.paymentCriteriaHash ||
        proofPayload.unlockAdapterConfig?.x402CriteriaHash ||
        "";
      if (derivedContext) {
        definitionAdvancedContextInput.value = derivedContext;
      }
    } catch {
      // Leave the context field untouched until the signer and criteria are valid enough to derive the hash.
    }
  }
  if (definitionAdvancedPanel) {
    definitionAdvancedPanel.hidden = !advancedEnabled;
  }
  if (definitionAdvancedNote) {
    definitionAdvancedNote.textContent = advancedEnabled
        ? advancedCompatible
          ? adapterType === "AGENT_REP"
            ? "Advanced criteria are active. This badge will require an 8183 agent proof with context, expiry, nonce, and reputation-aware issuer checks."
          : adapterType === "FARCASTER_ACCOUNT"
            ? "Advanced criteria are active. This badge will request an 8183 Farcaster proof on demand, bound to the Quick Auth wallet, signer, schema, context, expiry, and nonce rules below."
          : reusableOracleSelected
            ? "Advanced criteria are active. This badge will request an 8183 oracle proof on demand, bound to the stored criteria JSON, signer, schema, context, expiry, and nonce rules below."
          : adapterType === "PAYMENT_HISTORY"
            ? "Advanced criteria are active. This badge will request an 8183 payment proof on demand, bound to the configured rails, metric, origins, signer, and nonce rules below."
          : adapterType === "X402_HISTORY"
            ? "Advanced criteria are active. This badge will request an 8183 x402 history proof on demand, bound to the configured metric, service origins, signer, and nonce rules below."
          : "Advanced criteria are active. This badge will require an 8183 event proof with the issuer, context, expiry, and nonce rules below."
        : "Advanced criteria are enabled, but they only apply to oracle-backed unlock methods and agent-attested badges. Switch the unlock method before defining this badge."
      : "Advanced criteria stay optional. Leave them off to keep this badge on the normal unlock path.";
    definitionAdvancedNote.classList.toggle("is-error", advancedEnabled && !advancedCompatible);
  }

  const unlockSummary = summarizeUnlockAdapter({
    unlockAdapterConfig: normalizeUnlockConfigFromForm()
  });
  claimProofStatus.textContent = unlockSummary.executionHint;
}

function normalizeUnlockConfigFromForm() {
  return {
    unlockAdapterType: definitionUnlockAdapterSelect.value,
    unlockTargetAddress: definitionUnlockTargetInput.value,
    unlockThreshold: definitionUnlockThresholdInput.value,
    unlockSignerAddress: definitionUnlockSignerInput.value,
    oracleCriteriaJson: definitionOracleCriteriaInput?.value,
    unlockMetric: definitionX402MetricSelect?.value,
    unlockRailMode: definitionX402RailModeSelect?.value,
    unlockOrigins: definitionX402OriginsInput?.value,
    unlockWindowDays: definitionX402WindowDaysInput?.value,
    unlockIdentityMode: definitionX402IdentityModeSelect?.value,
    unlockNote: definitionUnlockNoteInput.value
  };
}

function setDefinitionFormValues(values = {}) {
  const defaults = definitionInputDefaults();
  const merged = {
    ...defaults,
    ...values
  };
  const unlockConfig = {
    ...unlockAdapterDefaults(merged.unlockAdapterType ?? "MANUAL_ATTESTOR", {
      targetAddress: onchainConfig.badgeRegistryAddress,
      signerAddress: onchainConfig.walletAddress || LOCAL_DEV_ACCOUNT.address
    }),
    ...(merged.unlockAdapterConfig ?? {}),
    unlockAdapterType: merged.unlockAdapterType ?? merged.unlockAdapterConfig?.unlockAdapterType ?? "MANUAL_ATTESTOR",
    unlockTargetAddress:
      merged.unlockTargetAddress ??
      merged.unlockAdapterConfig?.unlockTargetAddress ??
      "",
    unlockThreshold:
      merged.unlockThreshold ??
      merged.unlockAdapterConfig?.unlockThreshold ??
      "0",
    unlockSignerAddress:
      merged.unlockSignerAddress ??
      merged.unlockAdapterConfig?.unlockSignerAddress ??
      "",
    oracleCriteriaJson:
      merged.oracleCriteriaJson ??
      merged.unlockAdapterConfig?.oracleCriteriaJson ??
      "",
    unlockMetric:
      merged.unlockMetric ??
      merged.unlockAdapterConfig?.unlockMetric ??
      "paid_requests",
    unlockOrigins:
      merged.unlockOrigins ??
      merged.unlockAdapterConfig?.unlockOrigins ??
      "",
    unlockWindowDays:
      merged.unlockWindowDays ??
      merged.unlockAdapterConfig?.unlockWindowDays ??
      "365",
    unlockIdentityMode:
      merged.unlockIdentityMode ??
      merged.unlockAdapterConfig?.unlockIdentityMode ??
      "WALLET_ONLY",
    unlockRailMode:
      merged.unlockRailMode ??
      merged.unlockAdapterConfig?.unlockRailMode ??
      "ANY",
    unlockNote: merged.unlockNote ?? merged.unlockAdapterConfig?.unlockNote ?? ""
  };
  const advancedPolicyConfig = {
    ...advancedPolicyDefaults({
      requiredIssuer: unlockConfig.unlockSignerAddress,
      ruleKind: unlockConfig.unlockAdapterType === "AGENT_REP" ? "AGENT_8183" : "ORACLE_8183",
      schemaInput:
        unlockConfig.unlockAdapterType === "WALLET_AGE_ACTIVITY"
          ? DEFAULT_WALLET_AGE_8183_SCHEMA
          : unlockConfig.unlockAdapterType === "PROTOCOL_ACTIVITY"
            ? DEFAULT_PROTOCOL_ACTIVITY_8183_SCHEMA
          : unlockConfig.unlockAdapterType === "PORTFOLIO_STATE"
            ? DEFAULT_PORTFOLIO_STATE_8183_SCHEMA
          : unlockConfig.unlockAdapterType === "INTERNAL_SERVICE_ACTIVITY"
            ? DEFAULT_INTERNAL_SERVICE_ACTIVITY_8183_SCHEMA
          : unlockConfig.unlockAdapterType === "PAYMENT_HISTORY"
          ? DEFAULT_PAYMENT_8183_SCHEMA
          : unlockConfig.unlockAdapterType === "X402_HISTORY"
          ? DEFAULT_X402_8183_SCHEMA
          : unlockConfig.unlockAdapterType === "FARCASTER_ACCOUNT"
            ? DEFAULT_FARCASTER_8183_SCHEMA
          : unlockConfig.unlockAdapterType === "AGENT_REP"
            ? DEFAULT_AGENT_8183_SCHEMA
            : DEFAULT_ORACLE_8183_SCHEMA
    }),
    ...(merged.advancedPolicyConfig ?? {}),
    enabled:
      unlockConfig.unlockAdapterType === "X402_HISTORY" ||
      unlockConfig.unlockAdapterType === "PAYMENT_HISTORY" ||
      isReusableOracleAdapter(unlockConfig.unlockAdapterType) ||
      unlockConfig.unlockAdapterType === "FARCASTER_ACCOUNT"
        ? true
        : (merged.advancedPolicyEnabled ?? merged.advancedPolicyConfig?.enabled ?? false)
  };

  definitionNameInput.value = merged.name ?? "";
  definitionDescriptionInput.value = merged.description ?? "";
  definitionCreatorInput.value = merged.creator ?? DEFAULT_CREATOR;
  definitionBadgeTypeSelect.value = merged.badgeType ?? "ACHIEVEMENT";
  definitionVerificationTypeSelect.value = merged.verificationType ?? "ONCHAIN_STATE";
  definitionUnlockAdapterSelect.value = unlockConfig.unlockAdapterType;
  definitionUnlockTargetInput.value = unlockConfig.unlockTargetAddress;
  definitionUnlockThresholdInput.value = String(unlockConfig.unlockThreshold ?? "0");
  definitionUnlockSignerInput.value = unlockConfig.unlockSignerAddress;
  if (definitionOracleCriteriaInput) {
    definitionOracleCriteriaInput.value = unlockConfig.oracleCriteriaJson ?? "";
  }
  if (definitionX402MetricSelect) {
    definitionX402MetricSelect.value = unlockConfig.unlockMetric;
  }
  if (definitionX402RailModeSelect) {
    definitionX402RailModeSelect.value = unlockConfig.unlockRailMode;
  }
  if (definitionX402OriginsInput) {
    definitionX402OriginsInput.value = unlockConfig.unlockOrigins;
  }
  if (definitionX402WindowDaysInput) {
    definitionX402WindowDaysInput.value = String(unlockConfig.unlockWindowDays ?? "365");
  }
  if (definitionX402IdentityModeSelect) {
    definitionX402IdentityModeSelect.value = unlockConfig.unlockIdentityMode;
  }
  definitionUnlockNoteInput.value = unlockConfig.unlockNote;
  definitionAdvancedEnabledInput.checked = Boolean(advancedPolicyConfig.enabled);
  definitionAdvancedContextInput.value =
    advancedPolicyConfig.contextInput ??
    advancedPolicyConfig.contextId ??
    "";
  definitionAdvancedSchemaInput.value =
    advancedPolicyConfig.schemaInput ??
    advancedPolicyConfig.schemaId ??
    "";
  definitionAdvancedIssuerInput.value = advancedPolicyConfig.requiredIssuer ?? "";
  definitionAdvancedMaxAgeInput.value = String(advancedPolicyConfig.maxAge ?? "0");
  definitionAdvancedNonceScopeSelect.value = advancedPolicyConfig.nonceScope ?? "GLOBAL";
  definitionAdvancedRequireExpiryInput.checked = advancedPolicyConfig.requireExpiry ?? true;
  definitionMaxClaimsInput.value = String(merged.maxClaims ?? 0);
  definitionAssetIdInput.value = String(merged.assetId ?? 0);
  definitionVideoUriInput.value = merged.videoUri ?? "";
  definitionPosterUriInput.value = merged.posterUri ?? "";
  definitionDetailUriInput.value = merged.detailUri ?? "";
  definitionEditionInput.value = merged.edition ?? "";
  definitionLoopSecondsInput.value = String(merged.loopSeconds ?? 5);
  definitionVideoHashInput.value = merged.videoHash ?? "";
  definitionPosterHashInput.value = merged.posterHash ?? "";
  syncUnlockAdapterControls();
}

function readDefinitionFormValues() {
  const unlockPayload = buildUnlockAdapterPayload(
    {
      ...normalizeUnlockConfigFromForm()
    },
    {
      fallbackTargetAddress: onchainConfig.badgeRegistryAddress
    }
  );

  return {
    name: definitionNameInput.value,
    description: definitionDescriptionInput.value,
    creator: definitionCreatorInput.value,
    badgeType: definitionBadgeTypeSelect.value,
    verificationType: unlockPayload.verificationType,
    verificationData: unlockPayload.verificationData,
    unlockAdapterType: unlockPayload.unlockAdapterType,
    unlockAdapterConfig: unlockPayload.unlockAdapterConfig,
    unlockTargetAddress: unlockPayload.unlockAdapterConfig.unlockTargetAddress,
    unlockThreshold: unlockPayload.unlockAdapterConfig.unlockThreshold,
    unlockSignerAddress: unlockPayload.unlockAdapterConfig.unlockSignerAddress,
    oracleCriteriaJson: unlockPayload.unlockAdapterConfig.oracleCriteriaJson,
    unlockMetric: unlockPayload.unlockAdapterConfig.unlockMetric,
    unlockRailMode: unlockPayload.unlockAdapterConfig.unlockRailMode,
    unlockOrigins: unlockPayload.unlockAdapterConfig.unlockOrigins,
    unlockWindowDays: unlockPayload.unlockAdapterConfig.unlockWindowDays,
    unlockIdentityMode: unlockPayload.unlockAdapterConfig.unlockIdentityMode,
    unlockNote: unlockPayload.unlockAdapterConfig.unlockNote,
    advancedPolicyEnabled:
      definitionUnlockAdapterSelect.value === "X402_HISTORY" ||
      definitionUnlockAdapterSelect.value === "PAYMENT_HISTORY" ||
      isReusableOracleAdapter(definitionUnlockAdapterSelect.value)
        ? true
        : Boolean(definitionAdvancedEnabledInput.checked),
    advancedPolicyConfig: readAdvancedPolicyFormValues(),
    maxClaims: definitionMaxClaimsInput.value,
    assetId: definitionAssetIdInput.value,
    videoUri: definitionVideoUriInput.value,
    posterUri: definitionPosterUriInput.value,
    detailUri: definitionDetailUriInput.value,
    edition: definitionEditionInput.value,
    loopSeconds: definitionLoopSecondsInput.value,
    videoHash: definitionVideoHashInput.value,
    posterHash: definitionPosterHashInput.value
  };
}

function describeWalletRole(config = onchainConfig) {
  if (!config.walletAddress) {
    return "Not connected";
  }

  const roles = [];
  if (config.isOwner) {
    roles.push("Owner");
  }
  if (config.isAttestor) {
    roles.push("Attestor");
  }

  return roles[0] ? roles.join(" + ") : "Participant";
}

function walletOptions({ allowLocalDev = true, chainId = onchainConfig?.chainId } = {}) {
  return (allowLocalDev ? availableWallets : availableWallets.filter((wallet) => !wallet.isLocalDev)).filter(
    (wallet) => !wallet.isTempoConnect || isTempoChainId(chainId)
  );
}

function getFarcasterMiniAppWallet({ allowLocalDev = true, chainId = onchainConfig?.chainId } = {}) {
  return (
    findWalletById(walletOptions({ allowLocalDev, chainId }), FARCASTER_MINIAPP_WALLET_ID) ?? null
  );
}

function renderWalletProviderOptions(select, selectedId = "", { allowLocalDev = true, chainId = onchainConfig?.chainId } = {}) {
  const wallets = walletOptions({ allowLocalDev, chainId });
  const resolvedId = getPreferredWalletId(wallets, selectedId);

  if (wallets.length === 0) {
    select.innerHTML = '<option value="">No wallets detected</option>';
    select.value = "";
    select.disabled = true;
    return resolvedId;
  }

  select.disabled = false;
  select.innerHTML = wallets
    .map(
      (wallet) =>
        `<option value="${escapeHtml(wallet.id)}">${escapeHtml(walletOptionLabel(wallet))}</option>`
    )
    .join("");
  select.value = resolvedId;
  return resolvedId;
}

function renderWalletDiagnosticItems(container, items, emptyMessage) {
  if (!container) {
    return;
  }

  if (!items.length) {
    container.innerHTML = `<p class="empty-state">${escapeHtml(emptyMessage)}</p>`;
    return;
  }

  container.innerHTML = items
    .map(
      (item) => `
        <article class="wallet-diagnostic-item">
          <strong>${escapeHtml(item.label)}</strong>
          <span>${escapeHtml(item.value)}</span>
        </article>
      `
    )
    .join("");
}

function walletLabelForId(walletId, { allowLocalDev = true, chainId = onchainConfig?.chainId } = {}) {
  const wallet = findWalletById(walletOptions({ allowLocalDev, chainId }), walletId);
  return wallet ? walletOptionLabel(wallet) : "Not selected";
}

function isLocalhostRuntime() {
  if (typeof window === "undefined") {
    return false;
  }

  const hostname = window.location.hostname;
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}

function getLocalDevWallet() {
  return findWalletById(availableWallets, LOCAL_DEV_WALLET_ID) ?? null;
}

function shouldForceLocalAdminWrites(config = onchainConfig) {
  return (
    config.mode === "onchain" &&
    String(config.chainId) === "31337" &&
    isLocalhostRuntime() &&
    Boolean(getLocalDevWallet())
  );
}

async function resolveDefinitionWriteWallet(config = onchainConfig) {
  if (availableWallets.length === 0) {
    await refreshWalletProviders();
  }

  if (shouldForceLocalAdminWrites(config)) {
    const localDevWallet = getLocalDevWallet();
    if (!localDevWallet) {
      throw new Error("Localhost badge definition needs the Local Dev Wallet to stay available.");
    }

    return {
      forced: true,
      wallet: localDevWallet
    };
  }

  return {
    forced: false,
    wallet: await resolveSelectedWallet(config)
  };
}

function identityStatusLabel(config = onchainConfig) {
  if (!config.identityRegistryAddress) {
    return "No identity registry configured";
  }
  if (!config.walletAddress) {
    return "Connect a contract wallet to inspect or register identity";
  }
  if (!config.identityRegistered) {
    return "Not registered";
  }

  return `Registered · Primary wallet ${config.identityPrimaryWallet || config.walletAddress}`;
}

function formatWalletChainStatus(expectedChainId, actualChainId) {
  if (!actualChainId) {
    return "Not connected";
  }

  return String(actualChainId) === String(expectedChainId)
    ? `Chain ${actualChainId}`
    : `Chain ${actualChainId} · switch to ${expectedChainId}`;
}

function resolveX402AdminUrl(serviceUrl, pathname) {
  const trimmed = serviceUrl?.trim?.() ?? "";
  if (!trimmed) {
    return "";
  }

  try {
    const url = new URL(trimmed, window.location.href);
    url.pathname = pathname;
    url.search = "";
    return url.toString();
  } catch {
    return "";
  }
}

function resolveOperatorServiceConfig() {
  const oracleServiceUrl = onchainConfig.oracleServiceUrl?.trim?.() ?? "";
  if (oracleServiceUrl) {
    return {
      url: oracleServiceUrl,
      healthPath: "/api/oracle/health",
      decisionsPath: "/api/oracle/admin/decisions",
      label: "oracle proof service"
    };
  }

  const paymentServiceUrl = onchainConfig.x402ServiceUrl?.trim?.() ?? "";
  if (paymentServiceUrl) {
    return {
      url: paymentServiceUrl,
      healthPath: "/api/x402/health",
      decisionsPath: "/api/x402/admin/decisions",
      label: "payment proof service"
    };
  }

  return {
    url: "",
    healthPath: "",
    decisionsPath: "",
    label: "oracle proof service"
  };
}

function renderOperatorPanel() {
  if (!operatorStatus || !operatorHealthList || !operatorDecisionList) {
    return;
  }

  const operatorService = resolveOperatorServiceConfig();

  if (!operatorService.url) {
    operatorStatus.textContent =
      "Add an oracle proof service URL to inspect operator health and recent proof decisions.";
    renderWalletDiagnosticItems(operatorHealthList, [], "No oracle proof service configured.");
    renderWalletDiagnosticItems(operatorDecisionList, [], "No recent proof decisions yet.");
    return;
  }

  if (x402OperatorState.loading) {
    operatorStatus.textContent = `Checking the ${operatorService.label} and recent decisions.`;
    renderWalletDiagnosticItems(operatorHealthList, [], "Loading service health.");
    renderWalletDiagnosticItems(operatorDecisionList, [], "Loading recent proof decisions.");
    return;
  }

  if (x402OperatorState.errorMessage) {
    operatorStatus.textContent = x402OperatorState.errorMessage;
    renderWalletDiagnosticItems(operatorHealthList, [], "The oracle proof service is unavailable.");
    renderWalletDiagnosticItems(operatorDecisionList, [], "No recent proof decisions available.");
    return;
  }

  const health = x402OperatorState.health;
  operatorStatus.textContent = health
    ? `${operatorService.label} online · ${health.signerAddress || "no signer"} · ${health.source?.mode || "file"} source mode.`
    : "The oracle proof service has not been checked yet.";

  renderWalletDiagnosticItems(
    operatorHealthList,
    health
      ? [
          {
            label: "Service URL",
            value: operatorService.url
          },
          {
            label: "Signer",
            value: health.signerAddress || "Unavailable"
          },
          {
            label: "History Source",
            value:
              health.source?.mode === "http"
                ? `HTTP backend · ${health.source?.url || "URL unavailable"}`
                : `File source · ${health.source?.historyRecords ?? 0} local records`
          },
          ...(health.backendHealth
            ? [
                {
                  label: "Backend Health",
                  value: health.backendHealth.ok
                    ? `OK · ${health.backendHealth.status}`
                    : health.backendHealth.error
                      ? `Unavailable · ${health.backendHealth.error}`
                      : `HTTP ${health.backendHealth.status}`
                }
              ]
            : []),
          {
            label: "Recent Decisions",
            value: `${health.recentDecisions ?? x402OperatorState.decisions.length} stored on the proof service`
          }
        ]
      : [],
    "The oracle proof service has not returned health data yet."
  );

  renderWalletDiagnosticItems(
    operatorDecisionList,
    x402OperatorState.decisions.map((decision) => ({
      label: `${decision.eligible ? "Eligible" : "Denied"} · Badge #${decision.definitionId}`,
      value: [
        shortAddress(decision.agent || ""),
        decision.detail || "",
        decision.sourceMode === "http" && decision.backendRequestId
          ? `backend ${decision.backendRequestId}`
          : decision.sourceMode || ""
      ]
        .filter(Boolean)
        .join(" · ")
    })),
    "No proof decisions have been recorded yet."
  );
}

async function refreshX402OperatorState({ silent = false } = {}) {
  const operatorService = resolveOperatorServiceConfig();
  if (!operatorService.url) {
    x402OperatorState = {
      loading: false,
      health: null,
      decisions: [],
      errorMessage: ""
    };
    renderOperatorPanel();
    return;
  }

  x402OperatorState = {
    ...x402OperatorState,
    loading: true,
    errorMessage: ""
  };
  renderOperatorPanel();

  try {
    const [healthResponse, decisionsResponse] = await Promise.all([
      fetch(resolveX402AdminUrl(operatorService.url, operatorService.healthPath)),
      fetch(resolveX402AdminUrl(operatorService.url, operatorService.decisionsPath))
    ]);
    const healthPayload = await healthResponse.json();
    const decisionsPayload = await decisionsResponse.json();

    if (!healthResponse.ok) {
      throw new Error(healthPayload?.detail || `payment proof health failed with ${healthResponse.status}.`);
    }
    if (!decisionsResponse.ok) {
      throw new Error(
        decisionsPayload?.detail || `payment proof decision feed failed with ${decisionsResponse.status}.`
      );
    }

    x402OperatorState = {
      loading: false,
      health: healthPayload,
      decisions: Array.isArray(decisionsPayload?.decisions) ? decisionsPayload.decisions : [],
      errorMessage: ""
    };
    renderOperatorPanel();
    if (!silent) {
      setSupportStatus(
        connectionStatus,
        `Loaded ${operatorService.label} operator data from ${operatorService.url}.`
      );
    }
  } catch (error) {
    x402OperatorState = {
      loading: false,
      health: null,
      decisions: [],
      errorMessage: shortErrorMessage(error)
    };
    renderOperatorPanel();
    if (!silent) {
      setSupportStatus(connectionStatus, shortErrorMessage(error), true);
    }
  }
}

function renderWalletDiagnostics(config = onchainConfig) {
  if (!walletDiagnosticsSummary || !walletDiagnosticsDetected || !walletDiagnosticsSession) {
    return;
  }

  const injectedWallets = availableWallets.filter((wallet) => !wallet.isLocalDev);
  const localWallets = availableWallets.filter((wallet) => wallet.isLocalDev);
  walletDiagnosticsSummary.textContent =
    availableWallets.length > 0
      ? `Detected ${injectedWallets.length} injected wallet${injectedWallets.length === 1 ? "" : "s"}${localWallets.length ? ` and ${localWallets.length} local dev option${localWallets.length === 1 ? "" : "s"}` : ""}.`
      : "No injected wallets detected yet. Try Refresh Wallets after unlocking your extension.";

  renderWalletDiagnosticItems(
    walletDiagnosticsDetected,
    availableWallets.map((wallet) => ({
      label: walletOptionLabel(wallet),
      value: [
        wallet.id === config.walletProviderId ? "Selected for contract wallet" : "",
        wallet.id === config.mppWalletProviderId ? "Selected for MPP payer" : "",
        wallet.isLocalDev ? "Localhost dev signer" : wallet.source || "Injected provider"
      ]
        .filter(Boolean)
        .join(" · ")
    })),
    "No wallets discovered in this browser context."
  );

  renderWalletDiagnosticItems(
    walletDiagnosticsSession,
    [
      {
        label: "Contract Session",
        value: `${walletLabelForId(config.walletProviderId, { allowLocalDev: true, chainId: config.chainId })} · ${config.walletAddress || "Not connected"} · ${formatWalletChainStatus(
          config.chainId,
          config.walletChainId
        )}`
      },
      {
        label: "MPP Session",
        value: `${walletLabelForId(config.mppWalletProviderId, { allowLocalDev: false, chainId: config.chainId })} · ${config.mppWalletAddress || "Not connected"} · ${formatWalletChainStatus(
          config.chainId,
          config.mppWalletChainId
        )}`
      },
      {
        label: "Live Context",
        value: `${config.mode === "onchain" ? "Live contract mode" : "Local demo mode"} · ${config.networkName || "Manual network"} · Chain ${config.chainId}`
      },
      {
        label: "Identity",
        value: identityStatusLabel(config)
      },
      {
        label: "Admin Writes",
        value: shouldForceLocalAdminWrites(config)
          ? "Local Dev Wallet · Badge definition and asset registration are forced to the localhost signer."
          : `${walletLabelForId(config.walletProviderId, { allowLocalDev: true, chainId: config.chainId })} · Uses the selected contract wallet.`
      },
      {
        label: "Connect Mode",
        value: getSelectedWallet(config)?.isTempoConnect
          ? "Tempo Connect · Passkey-backed Tempo session"
          : "Wagmi · Extension-backed wallet session"
      },
      {
        label: "Deployment",
        value: config.deploymentProfileUrl || "Manual connection form"
      }
    ],
    "No session data yet."
  );
}

async function refreshWalletProviders() {
  availableWallets = await discoverInjectedWallets();

  if (onchainConfig.mode === "onchain") {
    onchainConfig = await syncWagmiConnections(onchainConfig, availableWallets);
    saveOnchainConfig(onchainConfig);
  }

  return availableWallets;
}

function getSelectedWallet(config = onchainConfig) {
  const walletId = config.walletProviderId || connectionWalletProviderSelect.value;
  return findWalletById(walletOptions({ allowLocalDev: true, chainId: config.chainId }), walletId) ?? null;
}

function getSelectedMppWallet(config = onchainConfig) {
  const walletId = config.mppWalletProviderId || connectionMppWalletProviderSelect.value;
  return findWalletById(walletOptions({ allowLocalDev: false, chainId: config.chainId }), walletId) ?? null;
}

async function resolveSelectedWallet(config = onchainConfig) {
  if (availableWallets.length === 0) {
    await refreshWalletProviders();
    syncConnectionForm({
      ...config,
      walletProviderId: getPreferredWalletId(
        walletOptions({ allowLocalDev: true, chainId: config.chainId }),
        config.walletProviderId
      ),
      mppWalletProviderId: getPreferredWalletId(
        walletOptions({ allowLocalDev: false, chainId: config.chainId }),
        config.mppWalletProviderId
      )
    });
  }

  const wallet = getSelectedWallet(config);
  if (wallet) {
    return wallet;
  }

  throw new Error(
    "No wallet was detected. Use Tempo Connect, unlock a wallet extension, or use the localhost dev wallet."
  );
}

async function resolveSelectedMppWallet(config = onchainConfig) {
  if (walletOptions({ allowLocalDev: false, chainId: config.chainId }).length === 0) {
    await refreshWalletProviders();
    syncConnectionForm({
      ...config,
      mppWalletProviderId: getPreferredWalletId(
        walletOptions({ allowLocalDev: false, chainId: config.chainId }),
        config.mppWalletProviderId
      )
    });
  }

  const wallet = getSelectedMppWallet(config);
  if (wallet) {
    return wallet;
  }

  throw new Error("No payer wallet was detected. Use Tempo Connect or unlock a wallet first.");
}

function syncConnectionForm(config = onchainConfig) {
  const walletProviderId = renderWalletProviderOptions(
    connectionWalletProviderSelect,
    config.walletProviderId,
    { allowLocalDev: true, chainId: config.chainId }
  );
  const mppWalletProviderId = renderWalletProviderOptions(
    connectionMppWalletProviderSelect,
    config.mppWalletProviderId,
    { allowLocalDev: false, chainId: config.chainId }
  );

  connectionModeSelect.value = config.mode;
  connectionChainIdInput.value = config.chainId;
  connectionRpcUrlInput.value = config.rpcUrl;
  connectionDeploymentInput.value = config.deploymentProfileUrl || "";
  connectionBadgeRegistryInput.value = config.badgeRegistryAddress;
  connectionAssetRegistryInput.value = config.assetRegistryAddress;
  connectionIdentityRegistryInput.value = config.identityRegistryAddress || "";
  connectionBalanceTokenInput.value = config.balanceTokenAddress || "";
  connectionWalletProviderSelect.value = walletProviderId;
  connectionWalletInput.value = config.walletAddress;
  connectionOwnerInput.value = config.ownerAddress;
  connectionWalletRoleInput.value = describeWalletRole(config);
  connectionAttestorInput.value = config.walletAddress
    ? config.isAttestor
      ? "Authorized"
      : "Not authorized"
    : "Wallet not connected";
  connectionIdentityStatusInput.value = identityStatusLabel(config);
  connectionMppWalletProviderSelect.value = mppWalletProviderId;
  connectionMppWalletInput.value = config.mppWalletAddress;
  connectionMppServiceInput.value = config.mppServiceUrl;
  if (connectionOracleServiceInput) {
    connectionOracleServiceInput.value = config.oracleServiceUrl || "";
  }
  connectionX402ServiceInput.value = config.x402ServiceUrl;
  if (connectionFarcasterServiceInput) {
    connectionFarcasterServiceInput.value = config.farcasterServiceUrl || "";
  }
  connectionMppPriceInput.value = config.mppPrice;

  const isOnchainMode = config.mode === "onchain";
  const selectedWallet = findWalletById(availableWallets, walletProviderId);
  const selectedMppWallet = findWalletById(
    walletOptions({ allowLocalDev: false, chainId: config.chainId }),
    mppWalletProviderId
  );
  const canUseMpp =
    isOnchainMode &&
    walletOptions({ allowLocalDev: false, chainId: config.chainId }).length > 0 &&
    Boolean(selectedMppWallet) &&
    Boolean(config.mppServiceUrl.trim());
  refreshChainButton.disabled = !isOnchainMode;
  connectWalletButton.disabled =
    !isOnchainMode || walletOptions({ allowLocalDev: true, chainId: config.chainId }).length === 0;
  connectMppWalletButton.disabled =
    !isOnchainMode || walletOptions({ allowLocalDev: false, chainId: config.chainId }).length === 0;
  registerIdentityButton.disabled =
    !isOnchainMode ||
    !selectedWallet ||
    !Boolean(config.identityRegistryAddress || config.badgeRegistryAddress);
  authorizeAttestorButton.disabled = !isOnchainMode || !selectedWallet;
  mintViaMppButton.disabled = !canUseMpp;
  claimUseConnectedWalletButton.disabled = !isOnchainMode || !config.walletAddress;
  renderWalletDiagnostics(config);
  renderOperatorPanel();
  updateClaimAssistantButtons();
  updateClaimProofStatus();
}

function readConnectionFormValues() {
  return {
    ...onchainConfig,
    mode: connectionModeSelect.value,
    chainId: connectionChainIdInput.value,
    rpcUrl: connectionRpcUrlInput.value,
    deploymentProfileUrl: connectionDeploymentInput.value,
    badgeRegistryAddress: connectionBadgeRegistryInput.value,
    balanceTokenAddress: onchainConfig.balanceTokenAddress,
    walletProviderId: connectionWalletProviderSelect.value,
    mppWalletProviderId: connectionMppWalletProviderSelect.value,
    mppServiceUrl: connectionMppServiceInput.value,
    oracleServiceUrl:
      connectionOracleServiceInput?.value ?? onchainConfig.oracleServiceUrl,
    x402ServiceUrl: connectionX402ServiceInput.value,
    farcasterServiceUrl: connectionFarcasterServiceInput?.value ?? onchainConfig.farcasterServiceUrl,
    mppPrice: connectionMppPriceInput.value
  };
}

function normalizeDeploymentConfig(deployment = {}) {
  const network = deployment.network ?? {};
  const contracts = deployment.contracts ?? {};
  const services = deployment.services ?? {};
  const paymentProofService = services.paymentProof ?? {};
  const farcasterProofService = services.farcasterProof ?? {};
  const mppService = services.mpp ?? {};

  return {
    ...onchainConfig,
    mode: "onchain",
    networkName: String(network.name ?? deployment.networkName ?? onchainConfig.networkName),
    deploymentProfileUrl:
      deployment.deploymentProfileUrl ?? deployment.profileUrl ?? onchainConfig.deploymentProfileUrl,
    eventStartBlock:
      deployment.eventStartBlock ??
      deployment.deploymentBlock ??
      onchainConfig.eventStartBlock,
    chainId: String(deployment.chainId ?? network.chainId ?? onchainConfig.chainId),
    rpcUrl: deployment.rpcUrl ?? network.rpcUrl ?? onchainConfig.rpcUrl,
    badgeRegistryAddress:
      deployment.badgeRegistryAddress ??
      contracts.agenticBadgeRegistry ??
      onchainConfig.badgeRegistryAddress,
    assetRegistryAddress:
      deployment.assetRegistryAddress ??
      contracts.badgeAssetRegistry ??
      onchainConfig.assetRegistryAddress,
    identityRegistryAddress:
      deployment.identityRegistryAddress ??
      contracts.identityRegistry ??
      onchainConfig.identityRegistryAddress,
    balanceTokenAddress:
      deployment.balanceTokenAddress ??
      deployment.tokens?.balanceToken ??
      onchainConfig.balanceTokenAddress,
    reputationRegistryAddress:
      deployment.reputationRegistryAddress ??
      contracts.reputationRegistry ??
      onchainConfig.reputationRegistryAddress,
    claimPageBaseUri: deployment.claimPageBaseUri ?? onchainConfig.claimPageBaseUri,
    mppServiceUrl:
      deployment.mppServiceUrl ??
      mppService.mintUrl ??
      onchainConfig.mppServiceUrl,
    oracleServiceUrl:
      deployment.oracleServiceUrl ??
      services.oracleProof?.proofUrl ??
      onchainConfig.oracleServiceUrl,
    x402ServiceUrl:
      deployment.paymentProofServiceUrl ??
      deployment.x402ServiceUrl ??
      paymentProofService.proofUrl ??
      onchainConfig.x402ServiceUrl,
    farcasterServiceUrl:
      deployment.farcasterServiceUrl ??
      farcasterProofService.proofUrl ??
      onchainConfig.farcasterServiceUrl
  };
}

async function ensureConnectedWallet(config = readConnectionFormValues()) {
  const wallet = await resolveSelectedWallet(config);
  const selectedWalletId = connectionWalletProviderSelect.value;
  const shouldReuseConnection =
    Boolean(config.walletAddress) &&
    selectedWalletId === onchainConfig.walletProviderId &&
    config.walletAddress === onchainConfig.walletAddress;
  const nextConfig =
    shouldReuseConnection ? config : await connectOnchainWallet(config, wallet);

  return {
    wallet,
    config: nextConfig
  };
}

function renderRegistrySummary() {
  definitionCount.textContent = String(registryState.definitions.length);
  claimCount.textContent = String(registryState.claims.length);

  const currentValue = claimDefinitionSelect.value;
  if (registryState.definitions.length === 0) {
    claimDefinitionSelect.innerHTML = '<option value="">No badges defined yet</option>';
    claimDefinitionSelect.disabled = true;
  } else {
    claimDefinitionSelect.disabled = false;
    claimDefinitionSelect.innerHTML = registryState.definitions
      .map(
        (definition) =>
          `<option value="${definition.id}">${escapeHtml(definition.name)} · ${badgeTypeLabel(
            definition.badgeType
          )}</option>`
      )
      .join("");

    if (registryState.definitions.some((definition) => String(definition.id) === currentValue)) {
      claimDefinitionSelect.value = currentValue;
    }
  }

  if (registryState.definitions.length === 0) {
    definitionList.innerHTML = '<p class="empty-state">Define a badge to start issuing claims.</p>';
  } else {
    definitionList.innerHTML = registryState.definitions
      .map(
        (definition) =>
          `<span class="chip">${escapeHtml(definition.name)} · ${escapeHtml(
            definition.asset.edition || "launch"
          )}${definition.maxClaims > 0 ? ` · ${definition.claimCount}/${definition.maxClaims}` : ""}</span>`
      )
      .join("");
  }

  updateClaimProofStatus();
}

function renderClaimGallery(filteredClaims = getPreparedGalleryClaims()) {
  if (galleryUiState.loading) {
    claimGallery.innerHTML =
      '<p class="empty-state"><strong>Loading claims</strong>Fetching the latest pin claims from the registry.</p>';
    return;
  }

  if (galleryUiState.errorMessage && filteredClaims.length === 0) {
    claimGallery.innerHTML =
      '<p class="empty-state"><strong>Gallery unavailable</strong>The latest claims could not be loaded from the registry.</p>';
    return;
  }

  if (filteredClaims.length === 0) {
    claimGallery.innerHTML =
      '<p class="empty-state"><strong>No matching claims</strong>Widen the search, clear the shelf filter, or issue a new claim.</p>';
    return;
  }

  claimGallery.innerHTML = filteredClaims
    .map((claimEntry) => {
      const sourceLabel = onchainConfig.mode === "onchain" ? "Live" : "Local";

      return `
        <article
          class="claim-card${claimEntry.id === selectedGalleryClaimId ? " is-selected" : ""}"
          data-view-claim="${claimEntry.id}"
          role="button"
          tabindex="0"
        >
          ${buildCardMediaMarkup({
            title: claimEntry.title,
            posterUri: claimEntry.claim?.image ?? claimEntry.definition?.asset?.posterUri ?? "",
            videoUri: claimEntry.videoUri,
            posterClass: "claim-poster",
            videoClass: "claim-video"
          })}
          <div class="claim-card-body">
            <div class="claim-card-top">
              <div>
                <h3 class="claim-title">${escapeHtml(claimEntry.title)}</h3>
                <p class="claim-meta">${escapeHtml(shortAddress(claimEntry.agent))} · ${escapeHtml(
                  claimEntry.badgeLabel
                )}</p>
              </div>
              <div class="claim-chip-row">
                <span class="claim-chip">${escapeHtml(sourceLabel)}</span>
                <span class="claim-chip">${escapeHtml(claimEntry.verificationLabel)}</span>
                <span class="claim-chip">${escapeHtml(claimEntry.shareUrl ? "Shareable" : "Private")}</span>
              </div>
            </div>
            <p class="claim-meta">${escapeHtml(
              formatReputationSummary(claimEntry.reputationSummary)
            )}</p>
            <p class="claim-meta">${escapeHtml(claimEntry.edition)} · ${escapeHtml(
              `${claimEntry.loopSeconds}s loop`
            )} · ${escapeHtml(formatDateTime(claimEntry.claimedAt))}</p>
            <div class="claim-actions">
              <button type="button" data-view-profile="${escapeHtml(claimEntry.agent)}">Profile</button>
              <button type="button" data-open-share="${claimEntry.id}" ${
                claimEntry.shareUrl ? "" : "disabled"
              }>Open Share</button>
              <button type="button" data-copy-share="${claimEntry.id}" ${
                claimEntry.shareUrl ? "" : "disabled"
              }>Copy Share</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");

  syncLazyCardMedia(claimGallery);
}

function updateLatestClaimOutputs(claimEntry) {
  latestClaimEntry = claimEntry ?? null;
  openLatestClaimButton.disabled = !latestClaimEntry;
  copyClaimUriButton.disabled = !latestClaimEntry?.claimUri;
  copyShareLinkButton.disabled = !getClaimShareUrl(latestClaimEntry);
  copyProfileLinkButton.disabled = !getProfileShareUrl();
  openSharePageButton.disabled = !getClaimShareUrl(latestClaimEntry);
  openProfilePageButton.disabled = !getProfileShareUrl();
  downloadClaimJsonButton.disabled = !latestClaimEntry;

  if (!latestClaimEntry) {
    claimUriOutput.value = "";
    claimShareUrlOutput.value = "";
    claimReputationOutput.value = "";
    claimEvidenceOutput.value = "";
    claimJsonOutput.value = "";
    renderProfileSurface();
    renderDetailSurface(null);
    return;
  }

  claimUriOutput.value = latestClaimEntry.claimUri ?? "";
  claimShareUrlOutput.value = getClaimShareUrl(latestClaimEntry);
  claimReputationOutput.value = formatReputationSummary(getClaimReputationSummary(latestClaimEntry));
  claimEvidenceOutput.value = buildClaimEvidenceText(latestClaimEntry);
  claimJsonOutput.value = JSON.stringify(latestClaimEntry.claim, null, 2);
  renderProfileSurface();
  renderDetailSurface(latestClaimEntry);
}

function persistRegistryState(nextState) {
  registryState = nextState;
  if (onchainConfig.mode !== "onchain") {
    saveRegistryState(registryState);
  }
  renderRegistrySummary();
  renderGallerySurface();
  renderProfileSurface();
}

function getCurrentSourceAssetDraft() {
  return currentSource?.assetDraft ?? null;
}

async function loadClaimPackage(claim, baseUrl, label) {
  clearCurrentObjectUrl();
  const assetDraft = assetDraftFromClaim(claim);
  const resolvedVideoUrl = resolveAssetUri(baseUrl, assetDraft.videoUri);
  const resolvedPosterUrl = resolveAssetUri(baseUrl, assetDraft.posterUri);

  if (!resolvedVideoUrl) {
    setAssetStatus(`Could not parse ${label}. The claim is missing a video asset.`, true);
    return;
  }

  setPreviewSource({
    type: "claim",
    name: claim.name ?? "Agentic Pin",
    videoUri: resolvedVideoUrl,
    posterUri: resolvedPosterUrl,
    meta: `${assetDraft.edition || "launch"} · ${(assetDraft.loopSeconds || 5)}s loop`,
    assetDraft: {
      ...assetDraft,
      videoUri: resolvedVideoUrl,
      posterUri: resolvedPosterUrl,
      detailUri: assetDraft.detailUri ? resolveAssetUri(baseUrl, assetDraft.detailUri) : ""
    }
  });
  setAssetStatus(`Viewing Tempo claim: ${claim.name ?? "Agentic Pin"}.`);
}

function createStandaloneClaimEntry(claim, { claimUri = "", shareUrl = "" } = {}) {
  const definitionId = Number(claim?.properties?.definition_id ?? 0);
  const agent = claim?.properties?.agent?.trim?.() ?? "";
  const claimedAt = Number(
    claim?.attributes?.find?.((entry) => entry.trait_type === "Claimed At")?.value ?? 0
  );
  const registryClaim = agent ? getClaimByAgentAndDefinition(agent, definitionId) : null;
  const derivedBadgeCount = agent
    ? registryState.claims.filter((entry) => entry.agent.toLowerCase() === agent.toLowerCase()).length
    : 0;

  return {
    id: registryClaim?.id ?? 0,
    definitionId,
    agent,
    claimedAt,
    issuedBy: claim?.properties?.issuer ?? "",
    proofHash: claim?.properties?.proof_hash ?? "",
    claimUri: claimUri || encodeDataUriText(JSON.stringify(claim)),
    claim: {
      ...claim,
      external_url: claim.external_url || shareUrl || ""
    },
    reputationSummary:
      registryClaim?.reputationSummary ??
      (agent
        ? {
            count: derivedBadgeCount || 1,
            summaryValue: derivedBadgeCount || 1,
            lastUpdatedAt: claimedAt
          }
        : null)
  };
}

async function loadClaimFromUrl(claimUrl) {
  const label = claimUrl.trim().startsWith("data:") ? "claim URI" : basename(claimUrl);
  setAssetStatus(`Loading claim ${label}...`);
  selectedProfileAgent = "";
  setDetailMode(true);

  try {
    if (claimUrl.trim().startsWith("data:")) {
      const claim = parseClaimDocument(claimUrl, label);
      await loadClaimPackage(claim, window.location.href, label);
      updateLatestClaimOutputs(
        createStandaloneClaimEntry(claim, {
          claimUri: claimUrl,
          shareUrl: window.location.href
        })
      );
      return;
    }

    const resolvedClaimUrl = resolveAssetUri(window.location.href, claimUrl);
    const response = await fetch(resolvedClaimUrl);
    if (!response.ok) {
      throw new Error(`Claim request failed with ${response.status}`);
    }

    const claim = parseClaimDocument(await response.text(), label);
    await loadClaimPackage(claim, resolvedClaimUrl, label);
    updateLatestClaimOutputs(
      createStandaloneClaimEntry(claim, {
        shareUrl: buildDirectClaimShareUrl(claimUrl)
      })
    );
  } catch (error) {
    console.error("Claim fetch failed", error);
    setAssetStatus(`Could not load claim ${label}.`, true);
  }
}

async function loadClaimFromFile(file) {
  setAssetStatus(`Loading claim ${file.name}...`);
  selectedProfileAgent = "";
  setDetailMode(true);

  try {
    const claim = parseClaimDocument(await file.text(), file.name);
    await loadClaimPackage(claim, window.location.href, file.name);
    updateLatestClaimOutputs(
      createStandaloneClaimEntry(claim, {
        shareUrl: ""
      })
    );
  } catch (error) {
    console.error("Claim file parse failed", error);
    setAssetStatus(
      "Could not read that claim file. Use claim JSON or a raw data:application/json;base64 claimURI string.",
      true
    );
  }
}

async function loadLocalEventProof() {
  const response = await fetch("/local/anvil-event-proof.json", {
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(`Event proof request failed with ${response.status}`);
  }

  const proofPackage = parseOracleEventProofPackage(await response.text());
  claimProofPackageInput.value = `${JSON.stringify(proofPackage, null, 2)}\n`;

  if (Number.isFinite(proofPackage.definitionId)) {
    claimDefinitionSelect.value = String(proofPackage.definitionId);
  }
  if (proofPackage.agent) {
    claimAgentInput.value = proofPackage.agent;
  }
  claimExecutionPathSelect.value = "direct";
  updateClaimProofStatus();
  return proofPackage;
}

function loadVideoFromFile(file) {
  clearCurrentObjectUrl();
  currentObjectUrl = URL.createObjectURL(file);
  selectedProfileAgent = "";
  setDetailMode(false);

  const assetDraft = assetDraftFromVideoSource({
    videoUri: currentObjectUrl,
    posterUri: "",
    detailUri: "",
    edition: "local-upload",
    loopSeconds: 5
  });

  setPreviewSource({
    type: "file",
    name: basename(file.name),
    videoUri: currentObjectUrl,
    posterUri: "",
    meta: "Local upload · 5s loop target",
    assetDraft
  });
  setAssetStatus(`Viewing imported video: ${file.name}. Use Loaded Asset to reuse it in a draft.`);
  renderProfileSurface();
}

async function viewClaimEntry(
  claimEntry,
  {
    keepProfileRoute = false,
    activateDetailMode = true,
    scrollToTop = true
  } = {}
) {
  if (!claimEntry?.claim) {
    return;
  }

  enterDetailView(activateDetailMode, {
    scrollToTop: activateDetailMode && scrollToTop
  });
  if (!keepProfileRoute) {
    selectedProfileAgent = "";
  }
  selectedGalleryClaimId = claimEntry.id;
  if (claimEntry.definitionId !== undefined) {
    claimDefinitionSelect.value = String(claimEntry.definitionId);
  }
  if (claimEntry.agent) {
    claimAgentInput.value = claimEntry.agent;
  }
  renderGallerySurface();
  updateClaimProofStatus();
  updateLatestClaimOutputs(claimEntry);
  if (keepProfileRoute && claimEntry.agent) {
    syncBrowserUrlForProfile(claimEntry.agent);
  } else {
    syncBrowserUrlForClaim(claimEntry);
  }
  await loadClaimPackage(
    claimEntry.claim,
    window.location.href,
    `${claimEntry.claim.name ?? "Local Claim"} #${claimEntry.id}`
  );
}

async function openAgentProfile(agent, { claimId = null } = {}) {
  const normalizedAgent = normalizeAgentValue(agent);
  if (!/^0x[a-f0-9]{40}$/.test(normalizedAgent)) {
    throw new Error("Enter a valid 0x agent address to open a profile.");
  }

  selectedProfileAgent = normalizedAgent;
  selectedShelfAgent = normalizedAgent;
  enterDetailView(true, {
    scrollToTop: false
  });
  const agentClaims = getClaimsForAgent(normalizedAgent);

  if (agentClaims.length === 0) {
    claimAgentInput.value = agent.trim();
    renderGallerySurface();
    renderProfileSurface(agent);
    syncBrowserUrlForProfile(agent);
    return;
  }

  const targetClaim =
    (claimId ? agentClaims.find((claimEntry) => claimEntry.id === Number(claimId)) : null) ??
    agentClaims[0];
  await viewClaimEntry(targetClaim, {
    keepProfileRoute: true,
    scrollToTop: false
  });
}

function applyAssetDraftToDefinitionForm(assetDraft, message) {
  const currentValues = readDefinitionFormValues();
  setDefinitionFormValues({
    ...currentValues,
    ...assetDraft
  });
  setSupportStatus(definitionStatus, message);
}

async function initializeClaimStudio({
  localClaimParam,
  claimParam,
  samplePinParam,
  deploymentParam,
  profileAgentParam,
  claimAgentParam,
  claimDefParam
}) {
  const initialSamplePinId = normalizeSamplePinId(samplePinParam);
  populateSelect(definitionBadgeTypeSelect, BADGE_TYPE_OPTIONS);
  populateSelect(definitionVerificationTypeSelect, VERIFICATION_TYPE_OPTIONS);
  populateSelect(definitionUnlockAdapterSelect, UNLOCK_ADAPTER_OPTIONS);
  populateSelect(definitionX402MetricSelect, PAYMENT_HISTORY_METRIC_OPTIONS);
  populateSelect(definitionX402RailModeSelect, PAYMENT_HISTORY_RAIL_MODE_OPTIONS);
  populateSelect(definitionX402IdentityModeSelect, PAYMENT_HISTORY_IDENTITY_MODE_OPTIONS);
  populateSelect(connectionModeSelect, MODE_OPTIONS);
  setDetailMode(false);

  onchainConfig = loadOnchainConfig();
  await refreshWalletProviders();
  syncConnectionForm(onchainConfig);
  prepareFarcasterConnect()
    .catch(() => null)
    .finally(() => {
      updateClaimAssistantButtons();
    });
  setDefinitionFormValues(definitionInputDefaults(initialSamplePinId));
  setSupportStatus(
    definitionStatus,
    "Pinned sample media loaded. Define a badge or pull the current preview asset."
  );
  setSupportStatus(claimStatus, "Issue a claim to generate Tempo-ready poster + loop metadata.");
  setSupportStatus(claimProofStatus, "Choose a badge to see whether it needs a direct proof or attestor record.");
  setSupportStatus(
    connectionStatus,
    onchainConfig.mode === "onchain"
      ? "Live contract mode is active."
      : "Local demo mode is active. Switch to live mode when you have a deployed registry."
  );
  claimAgentInput.value = DEFAULT_AGENT;
  claimIssuedByInput.value = DEFAULT_CREATOR;
  setGalleryUiState();
  updateLatestClaimOutputs(null);
  setLatestOperationResult(null);

  if (deploymentParam) {
    try {
      const deployment = await loadDeploymentProfile(deploymentParam);
      onchainConfig = normalizeDeploymentConfig({
        ...deployment,
        deploymentProfileUrl: deploymentParam
      });
      await refreshWalletProviders();
      saveOnchainConfig(onchainConfig);
      syncConnectionForm(onchainConfig);
      setSupportStatus(
        connectionStatus,
        `Loaded deployment profile ${shortAddress(onchainConfig.badgeRegistryAddress)}.`
      );
    } catch (error) {
      setSupportStatus(connectionStatus, shortErrorMessage(error), true);
    }
  }

  if (onchainConfig.mode === "onchain") {
    await refreshOnchainRegistryState({
      loadLatestClaim: false
    });
  } else {
    registryState = await ensureSeedRegistryState({
      sampleClaimUrl: SAMPLE_CLAIM_URL
    });
    renderRegistrySummary();
    renderGallerySurface();
    renderOperatorPanel();
    const newestClaim = registryState.claims[0] ?? null;
    updateLatestClaimOutputs(newestClaim);
  }

  if (localClaimParam) {
    const localClaim = getClaimById(localClaimParam);
    if (localClaim) {
      await viewClaimEntry(localClaim);
      setSupportStatus(claimStatus, `Loaded local Tempo claim #${localClaim.id}.`);
      return;
    }

    setSupportStatus(
      claimStatus,
      `Local claim #${localClaimParam} was not found in this browser profile.`,
      true
    );
  }

  if (claimParam) {
    await loadClaimFromUrl(claimParam);
    return;
  }

  if (claimAgentParam && claimDefParam !== "") {
    const sharedClaim = getClaimByAgentAndDefinition(claimAgentParam, claimDefParam);
    if (sharedClaim) {
      await viewClaimEntry(sharedClaim);
      setSupportStatus(
        claimStatus,
        `Loaded shared claim for ${shortAddress(sharedClaim.agent)} on badge #${sharedClaim.definitionId}.`
      );
      return;
    }

    setSupportStatus(
      claimStatus,
      `No claim was found for ${shortAddress(claimAgentParam)} on badge #${claimDefParam}.`,
      true
    );
  }

  if (profileAgentParam) {
    const profileClaims = getClaimsForAgent(profileAgentParam);
    if (profileClaims.length > 0) {
      await openAgentProfile(profileAgentParam);
      setSupportStatus(
        claimStatus,
        `Loaded the profile for ${shortAddress(profileAgentParam)} with ${profileClaims.length} claim${
          profileClaims.length === 1 ? "" : "s"
        }.`
      );
      return;
    }

    selectedProfileAgent = normalizeAgentValue(profileAgentParam);
    renderProfileSurface(profileAgentParam);
    syncBrowserUrlForProfile(profileAgentParam);
    setSupportStatus(
      claimStatus,
      `No claims were found for ${shortAddress(profileAgentParam)}.`,
      true
    );
    return;
  }

  if (samplePinParam) {
    loadSamplePin(initialSamplePinId);
    return;
  }

  const newestClaim = registryState.claims[0] ?? null;
  if (newestClaim) {
    await viewClaimEntry(newestClaim, {
      activateDetailMode: false
    });
    setSupportStatus(claimStatus, "Loaded the latest claim into the viewer.");
    return;
  }

  loadSamplePin(initialSamplePinId);
}

async function loadDeploymentProfile(deploymentUrl = "/local/anvil-deployment.json") {
  const resolvedUrl = new URL(resolveAssetUri(window.location.href, deploymentUrl));
  resolvedUrl.searchParams.set("ts", String(Date.now()));
  const response = await fetch(resolvedUrl, {
    cache: "no-store"
  });
  if (!response.ok) {
    throw new Error(`Deployment request failed with ${response.status}`);
  }

  return parseJsonDocument(await response.text(), basename(resolvedUrl.toString()));
}

async function refreshOnchainRegistryState({ loadLatestClaim = false } = {}) {
  if (!isOnchainConfigured(onchainConfig)) {
    registryState = createEmptyRegistryState();
    setGalleryUiState({
      errorMessage: "Add an RPC URL and badge registry address to load live claims."
    });
    renderRegistrySummary();
    renderGallerySurface();
    updateLatestClaimOutputs(null);
    setSupportStatus(
      connectionStatus,
      "Add an RPC URL and badge registry address, then refresh the chain.",
      true
    );
    return;
  }

  try {
    setGalleryUiState({
      loading: true
    });
    renderGallerySurface();
    const { state, config } = await readOnchainRegistry(onchainConfig);
    onchainConfig = config;
    saveOnchainConfig(onchainConfig);
    syncConnectionForm(onchainConfig);
    await refreshX402OperatorState({ silent: true });
    setGalleryUiState();
    persistRegistryState(state);
    const newestClaim = registryState.claims[0] ?? null;
    const profileClaim = selectedProfileAgent ? getClaimsForAgent(selectedProfileAgent)[0] ?? null : null;
    const defaultClaim = profileClaim ?? newestClaim;
    updateLatestClaimOutputs(defaultClaim);
    setSupportStatus(
      connectionStatus,
      `Connected to ${shortAddress(onchainConfig.badgeRegistryAddress)} on chain ${onchainConfig.chainId}.`
    );

    if (loadLatestClaim && defaultClaim) {
      if (profileClaim && selectedProfileAgent) {
        await openAgentProfile(selectedProfileAgent, {
          claimId: profileClaim.id
        });
        setSupportStatus(claimStatus, `Loaded the profile for ${shortAddress(selectedProfileAgent)}.`);
      } else {
        await viewClaimEntry(defaultClaim);
        setSupportStatus(claimStatus, "Loaded the latest onchain claim into the viewer.");
      }
    }
  } catch (error) {
    console.error("Onchain registry refresh failed", error);
    registryState = createEmptyRegistryState();
    setGalleryUiState({
      errorMessage: shortErrorMessage(error)
    });
    renderRegistrySummary();
    renderGallerySurface();
    updateLatestClaimOutputs(null);
    setSupportStatus(connectionStatus, shortErrorMessage(error), true);
  }
}

usePin1Button.addEventListener("click", () => {
  loadSamplePin("pin1");
});

usePin2Button.addEventListener("click", () => {
  loadSamplePin("pin2");
});

loadClaimButton.addEventListener("click", () => {
  claimUploadInput.click();
});

useSampleClaimButton.addEventListener("click", () => {
  void loadClaimFromUrl(SAMPLE_CLAIM_URL);
});

loadVideoButton.addEventListener("click", () => {
  videoUploadInput.click();
});

claimUploadInput.addEventListener("change", async (event) => {
  const [file] = event.currentTarget.files ?? [];
  if (!file) {
    return;
  }

  await loadClaimFromFile(file);
  event.currentTarget.value = "";
});

definitionUnlockAdapterSelect.addEventListener("change", () => {
  syncUnlockAdapterControls();
});

definitionUnlockTargetInput.addEventListener("input", () => {
  syncUnlockAdapterControls();
});

definitionUnlockThresholdInput.addEventListener("input", () => {
  syncUnlockAdapterControls();
});

definitionUnlockSignerInput.addEventListener("input", () => {
  syncUnlockAdapterControls();
});

definitionX402MetricSelect?.addEventListener("change", () => {
  syncUnlockAdapterControls();
});

definitionX402RailModeSelect?.addEventListener("change", () => {
  syncUnlockAdapterControls();
});

definitionX402OriginsInput?.addEventListener("input", () => {
  syncUnlockAdapterControls();
});

definitionX402WindowDaysInput?.addEventListener("input", () => {
  syncUnlockAdapterControls();
});

definitionX402IdentityModeSelect?.addEventListener("change", () => {
  syncUnlockAdapterControls();
});

definitionUnlockNoteInput.addEventListener("input", () => {
  syncUnlockAdapterControls();
});

definitionAdvancedEnabledInput.addEventListener("change", () => {
  syncUnlockAdapterControls();
});

definitionAdvancedContextInput.addEventListener("input", () => {
  syncUnlockAdapterControls();
});

definitionAdvancedSchemaInput.addEventListener("input", () => {
  syncUnlockAdapterControls();
});

definitionAdvancedIssuerInput.addEventListener("input", () => {
  syncUnlockAdapterControls();
});

definitionAdvancedMaxAgeInput.addEventListener("input", () => {
  syncUnlockAdapterControls();
});

definitionAdvancedNonceScopeSelect.addEventListener("change", () => {
  syncUnlockAdapterControls();
});

definitionAdvancedRequireExpiryInput.addEventListener("change", () => {
  syncUnlockAdapterControls();
});

claimDefinitionSelect.addEventListener("change", () => {
  updateClaimProofStatus();
});

claimExecutionPathSelect.addEventListener("change", () => {
  updateClaimProofStatus();
});

claimAgentInput.addEventListener("input", () => {
  updateClaimProofStatus();
});

claimProofPackageInput.addEventListener("input", () => {
  updateClaimProofStatus();
});

videoUploadInput.addEventListener("change", (event) => {
  const [file] = event.currentTarget.files ?? [];
  if (!file) {
    return;
  }

  loadVideoFromFile(file);
  event.currentTarget.value = "";
});

definitionForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (onchainConfig.mode === "onchain") {
    void (async () => {
      try {
        onchainConfig = readConnectionFormValues();
        saveOnchainConfig(onchainConfig);
        syncConnectionForm(onchainConfig);
        const previousConfig = {
          ...onchainConfig
        };
        const definitionInput = readDefinitionFormValues();
        const { wallet, forced } = await resolveDefinitionWriteWallet(onchainConfig);
        const result = await defineBadgeOnchain(
          onchainConfig,
          definitionInput,
          wallet
        );
        onchainConfig = forced
          ? {
              ...result.config,
              walletProviderId: previousConfig.walletProviderId,
              walletAddress: previousConfig.walletAddress,
              ownerAddress: previousConfig.ownerAddress,
              isAttestor: previousConfig.isAttestor,
              isOwner: previousConfig.isOwner,
              mppWalletProviderId: previousConfig.mppWalletProviderId,
              mppWalletAddress: previousConfig.mppWalletAddress
            }
          : result.config;
        saveOnchainConfig(onchainConfig);
        syncConnectionForm(onchainConfig);
        await refreshOnchainRegistryState({ loadLatestClaim: false });
        claimDefinitionSelect.value = String(result.definitionId);
        setLatestOperationResult({
          operation: "Badge Defined",
          summary: forced
            ? `Registered asset #${result.assetId} and defined badge #${result.definitionId} with the localhost admin signer.`
            : `Registered asset #${result.assetId} and defined badge #${result.definitionId}.`,
          primaryTxHash: result.definitionTxHash || result.txHash,
          secondaryTxHash: result.assetTxHash,
          assetId: result.assetId,
          definitionId: result.definitionId,
          shareUrl: definitionInput.detailUri ? resolveAssetUri(window.location.href, definitionInput.detailUri) : "",
          claimUri: ""
        });
        setSupportStatus(
          definitionStatus,
          forced
            ? `Defined badge #${result.definitionId} onchain with asset #${result.assetId} using the localhost admin signer.`
            : `Defined badge #${result.definitionId} onchain with asset #${result.assetId}.`
        );
      } catch (error) {
        setSupportStatus(definitionStatus, shortErrorMessage(error), true);
      }
    })();
    return;
  }

  try {
    const { state, definition } = createRegistryDefinition(registryState, readDefinitionFormValues());
    persistRegistryState(state);
    claimDefinitionSelect.value = String(definition.id);
    setSupportStatus(
      definitionStatus,
      `Defined ${definition.name} as a ${badgeTypeLabel(definition.badgeType).toLowerCase()} badge.`
    );
    setSupportStatus(claimStatus, `Ready to issue ${definition.name}.`);
  } catch (error) {
    setSupportStatus(
      definitionStatus,
      error instanceof Error ? error.message : "Could not define that badge.",
      true
    );
  }
});

claimForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (onchainConfig.mode === "onchain") {
    try {
      onchainConfig = readConnectionFormValues();
      saveOnchainConfig(onchainConfig);
      syncConnectionForm(onchainConfig);
      const submittedDefinitionId = claimDefinitionSelect.value;
      const submittedAgent = claimAgentInput.value;
      const wallet = await resolveSelectedWallet(onchainConfig);
      const paymentWallet =
        onchainConfig.mppWalletProviderId && onchainConfig.mppWalletProviderId !== LOCAL_DEV_WALLET_ID
          ? await resolveSelectedMppWallet(onchainConfig).catch(() => null)
          : null;
      const result = await issueBadgeClaimOnchain(
        onchainConfig,
        {
          definitionId: submittedDefinitionId,
          agent: submittedAgent,
          proofPackage: claimProofPackageInput.value,
          executionPath: claimExecutionPathSelect.value,
          definition: getDefinitionById(submittedDefinitionId)
        },
        {
          wallet,
          paymentWallet
        }
      );
      await refreshOnchainRegistryState({ loadLatestClaim: true });
      const issuedClaimEntry =
        findClaimEntryByAgentAndDefinition(result.agent, result.definitionId) ?? latestClaimEntry;
      setLatestOperationResult({
        operation: "Claim Recorded",
        summary:
          result.mode === "self-claim"
            ? `Claimed badge #${result.definitionId} as ${shortAddress(result.account)}.`
            : result.mode === "payment-proof"
              ? `Claimed badge #${result.definitionId} with a payment history proof as ${shortAddress(result.account)}.`
            : result.mode === "farcaster-proof"
              ? `Claimed badge #${result.definitionId} with a Farcaster proof as ${shortAddress(result.account)}.`
            : result.mode === "x402-proof"
              ? `Claimed badge #${result.definitionId} with an x402 history proof as ${shortAddress(result.account)}.`
            : result.mode === "oracle-proof"
              ? `Claimed badge #${result.definitionId} with an oracle proof as ${shortAddress(result.account)}.`
              : result.mode === "agent-proof"
                ? `Claimed badge #${result.definitionId} with an agent attestation as ${shortAddress(result.account)}.`
                : `Recorded badge #${result.definitionId} for ${shortAddress(submittedAgent)}.`,
        primaryTxHash: result.txHash,
        secondaryTxHash: "",
        assetId: issuedClaimEntry?.definition?.asset?.assetId ?? "",
        definitionId: result.definitionId,
        shareUrl: issuedClaimEntry ? getClaimShareUrl(issuedClaimEntry) : "",
        claimUri: issuedClaimEntry?.claimUri ?? ""
      });
      setSupportStatus(
        claimStatus,
        result.mode === "self-claim"
          ? `Self-claimed badge ${submittedDefinitionId} as ${shortAddress(result.account)}.`
          : result.mode === "payment-proof"
            ? `Claimed badge ${submittedDefinitionId} with a payment history proof as ${shortAddress(
                result.account
              )}.`
          : result.mode === "farcaster-proof"
            ? `Claimed badge ${submittedDefinitionId} with a Farcaster proof as ${shortAddress(
                result.account
              )}.`
          : result.mode === "x402-proof"
            ? `Claimed badge ${submittedDefinitionId} with an x402 history proof as ${shortAddress(
                result.account
              )}.`
          : result.mode === "oracle-proof"
            ? `Claimed badge ${submittedDefinitionId} with an oracle attendance proof as ${shortAddress(
                result.account
              )}.`
            : result.mode === "agent-proof"
              ? `Claimed badge ${submittedDefinitionId} with an agent attestation as ${shortAddress(
                  result.account
                )}.`
          : `Recorded onchain claim from ${shortAddress(result.account)} for ${shortAddress(
              submittedAgent
            )}.`
      );
    } catch (error) {
      setSupportStatus(claimStatus, shortErrorMessage(error), true);
    }
    return;
  }

  try {
    const { state, claimEntry } = await issueRegistryClaim(registryState, {
      definitionId: claimDefinitionSelect.value,
      agent: claimAgentInput.value,
      proofNote: claimProofNoteInput.value,
      issuedBy: claimIssuedByInput.value
    });
    persistRegistryState(state);
    claimProofNoteInput.value = "";
    await viewClaimEntry(claimEntry);
    setSupportStatus(
      claimStatus,
      `Issued ${claimEntry.claim.name} to ${shortAddress(claimEntry.agent)} at ${formatDateTime(
        claimEntry.claimedAt
      )}.`
    );
  } catch (error) {
    setSupportStatus(
      claimStatus,
      error instanceof Error ? error.message : "Could not issue that claim.",
      true
    );
  }
});

prefillPin1Button.addEventListener("click", () => {
  applyAssetDraftToDefinitionForm(definitionInputDefaults("pin1"), "Loaded Pin 1 into the form.");
});

prefillPin2Button.addEventListener("click", () => {
  applyAssetDraftToDefinitionForm(definitionInputDefaults("pin2"), "Loaded Pin 2 into the form.");
});

pullCurrentAssetButton.addEventListener("click", () => {
  const assetDraft = getCurrentSourceAssetDraft();
  if (!assetDraft) {
    setSupportStatus(
      definitionStatus,
      "The current preview does not expose a portable poster + video package yet.",
      true
    );
    return;
  }

  applyAssetDraftToDefinitionForm(assetDraft, "Pulled the currently loaded asset package into the form.");
});

galleryFilterInput.addEventListener("input", () => {
  renderGallerySurface();
});

galleryScopeSelect.addEventListener("change", () => {
  renderGallerySurface();
});

gallerySortSelect.addEventListener("change", () => {
  renderGallerySurface();
});

clearGalleryFiltersButton.addEventListener("click", () => {
  galleryFilterInput.value = "";
  galleryScopeSelect.value = "all";
  gallerySortSelect.value = "newest";
  selectedShelfAgent = "";
  renderGallerySurface();
  setSupportStatus(claimStatus, "Cleared the gallery filters and restored the full claim shelf.");
});

clearAgentFilterButton.addEventListener("click", () => {
  selectedShelfAgent = "";
  renderGallerySurface();
  setSupportStatus(claimStatus, "Showing claims from every agent again.");
});

loadLocalEventProofButton.addEventListener("click", async () => {
  try {
    const proofPackage = await loadLocalEventProof();
    setSupportStatus(
      claimStatus,
      `Loaded the local event proof for ${shortAddress(proofPackage.agent)} on badge #${proofPackage.definitionId}.`
    );
  } catch (error) {
    setSupportStatus(claimStatus, shortErrorMessage(error), true);
  }
});

clearProofPackageButton.addEventListener("click", () => {
  claimProofPackageInput.value = "";
  updateClaimProofStatus();
  setSupportStatus(claimStatus, "Cleared the current proof package.");
});

agentShelf.addEventListener("click", (event) => {
  const target = event.target.closest("button[data-view-profile]");
  if (!target) {
    return;
  }

  void openAgentProfile(target.dataset.viewProfile)
    .then(() => {
      setSupportStatus(
        claimStatus,
        `Opened the profile for ${shortAddress(target.dataset.viewProfile)}.`
      );
    })
    .catch((error) => {
      setSupportStatus(claimStatus, shortErrorMessage(error), true);
    });
});

[detailRelatedBadgeClaims, detailRelatedAgentClaims].forEach((container) => {
  container.addEventListener("click", async (event) => {
    const target = event.target.closest("button[data-view-claim]");
    if (!target) {
      return;
    }

    const claimEntry = getClaimById(target.dataset.viewClaim);
    if (!claimEntry) {
      return;
    }

    await viewClaimEntry(claimEntry);
    setSupportStatus(claimStatus, `Loaded ${claimEntry.claim.name} into the detail page.`);
  });
});

[profileBadgeClaims, profileRecentClaims].forEach((container) => {
  container.addEventListener("click", async (event) => {
    const target = event.target.closest("button[data-view-claim]");
    if (!target) {
      return;
    }

    const claimEntry = getClaimById(target.dataset.viewClaim);
    if (!claimEntry) {
      return;
    }

    await openAgentProfile(claimEntry.agent, {
      claimId: claimEntry.id
    });
    setSupportStatus(claimStatus, `Opened the profile for ${shortAddress(claimEntry.agent)}.`);
  });
});

profileNeighborList.addEventListener("click", async (event) => {
  const target = event.target.closest("button[data-view-profile]");
  if (!target) {
    return;
  }

  await openAgentProfile(target.dataset.viewProfile);
  setSupportStatus(claimStatus, `Opened the profile for ${shortAddress(target.dataset.viewProfile)}.`);
});

claimGallery.addEventListener("mouseover", handleCardHoverStart);
claimGallery.addEventListener("mouseout", handleCardHoverEnd);
claimGallery.addEventListener("focusin", handleCardHoverStart);
claimGallery.addEventListener("focusout", handleCardHoverEnd);

claimGallery.addEventListener("click", async (event) => {
  const actionButton = event.target.closest("button");
  const card = event.target.closest(".claim-card[data-view-claim]");

  if (actionButton?.dataset.viewProfile) {
    await openAgentProfile(actionButton.dataset.viewProfile);
    setSupportStatus(claimStatus, `Opened the profile for ${shortAddress(actionButton.dataset.viewProfile)}.`);
    return;
  }

  if (actionButton?.dataset.copyClaim) {
    const claimEntry = getClaimById(actionButton.dataset.copyClaim);
    if (!claimEntry) {
      return;
    }

    try {
      await navigator.clipboard.writeText(claimEntry.claimUri);
      setSupportStatus(claimStatus, `Copied claim URI for ${claimEntry.claim.name}.`);
    } catch (error) {
      console.error("Clipboard write failed", error);
      setSupportStatus(claimStatus, "Could not copy that claim URI.", true);
    }
    return;
  }

  if (actionButton?.dataset.copyShare) {
    const claimEntry = getClaimById(actionButton.dataset.copyShare);
    if (!claimEntry) {
      return;
    }

    const shareUrl = getClaimShareUrl(claimEntry);
    if (!shareUrl) {
      setSupportStatus(claimStatus, "That claim does not have a shareable page yet.", true);
      return;
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setSupportStatus(claimStatus, `Copied share link for ${claimEntry.claim.name}.`);
    } catch (error) {
      console.error("Clipboard write failed", error);
      setSupportStatus(claimStatus, "Could not copy that share link.", true);
    }
    return;
  }

  if (actionButton?.dataset.openShare) {
    const claimEntry = getClaimById(actionButton.dataset.openShare);
    if (!claimEntry) {
      return;
    }

    const shareUrl = getClaimShareUrl(claimEntry);
    if (!shareUrl) {
      setSupportStatus(claimStatus, "That claim does not have a shareable page yet.", true);
      return;
    }

    window.open(shareUrl, "_blank", "noopener,noreferrer");
    setSupportStatus(claimStatus, `Opened the share page for ${claimEntry.claim.name}.`);
    return;
  }

  if (!card) {
    return;
  }

  const claimEntry = getClaimById(card.dataset.viewClaim);
  if (!claimEntry) {
    return;
  }

  await viewClaimEntry(claimEntry);
  setSupportStatus(claimStatus, `Loaded claim #${claimEntry.id} into the preview.`);
});

claimGallery.addEventListener("keydown", async (event) => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  if (event.target instanceof HTMLButtonElement) {
    return;
  }

  const card = event.target.closest(".claim-card[data-view-claim]");
  if (!card) {
    return;
  }

  event.preventDefault();
  const claimEntry = getClaimById(card.dataset.viewClaim);
  if (!claimEntry) {
    return;
  }

  await viewClaimEntry(claimEntry);
  setSupportStatus(claimStatus, `Loaded claim #${claimEntry.id} into the preview.`);
});

badgeGrid.addEventListener("mouseover", handleCardHoverStart);
badgeGrid.addEventListener("mouseout", handleCardHoverEnd);
badgeGrid.addEventListener("focusin", handleCardHoverStart);
badgeGrid.addEventListener("focusout", handleCardHoverEnd);

badgeGrid.addEventListener("click", async (event) => {
  const card = event.target.closest(".badge-tile[data-view-pin]");
  if (!card) {
    return;
  }

  const badgeEntry = getBadgeGridEntries().find((entry) => entry.pinId === card.dataset.viewPin);
  if (!badgeEntry) {
    return;
  }

  if (previewPinAsset(card.dataset.viewPin)) {
    setSupportStatus(claimStatus, `Opened ${badgeEntry.title} from the badge wall.`);
  }
});

badgeGrid.addEventListener("keydown", async (event) => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  if (event.target instanceof HTMLButtonElement) {
    return;
  }

  const card = event.target.closest(".badge-tile[data-view-pin]");
  if (!card) {
    return;
  }

  event.preventDefault();
  const badgeEntry = getBadgeGridEntries().find((entry) => entry.pinId === card.dataset.viewPin);
  if (!badgeEntry) {
    return;
  }

  if (previewPinAsset(card.dataset.viewPin)) {
    setSupportStatus(claimStatus, `Opened ${badgeEntry.title} from the badge wall.`);
  }
});

openClaimAssistantButton?.addEventListener("click", async () => {
  openClaimAssistantModal();
  renderClaimAssistantSnapshot(null);
  setClaimAssistantStatus("");
  try {
    await ensureClaimAssistantRegistry();
  } catch (error) {
    setClaimAssistantStatus(shortErrorMessage(error), true);
  }

  if (onchainConfig.walletAddress) {
    if (claimAssistantInput) {
      claimAssistantInput.value = onchainConfig.walletAddress;
    }
    await runClaimAssistantLookup(onchainConfig.walletAddress, { silent: true });
  }
});

closeClaimAssistantButton?.addEventListener("click", () => {
  closeClaimAssistantModal();
});

claimAssistantBackdrop?.addEventListener("click", () => {
  closeClaimAssistantModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && claimAssistantState.isOpen) {
    closeClaimAssistantModal();
  }
});

/* ─── Input resonance: typing pulse, valid glow, ENS detection ─── */
claimAssistantInput?.addEventListener("input", () => {
  const val = claimAssistantInput.value.trim();
  const checkBtn = claimAssistantForm?.querySelector("button.primary");
  const isAddr = /^0x[a-fA-F0-9]{40}$/.test(val);
  const isEns = /\.eth$/i.test(val) && val.length >= 4;

  claimAssistantInput.classList.toggle("is-typing", val.length > 0 && !isAddr && !isEns);
  claimAssistantInput.classList.toggle("is-valid", isAddr);
  claimAssistantInput.classList.toggle("is-ens", isEns);

  if (checkBtn) {
    checkBtn.classList.toggle("is-ens", isEns);
    checkBtn.textContent = isEns ? "Check ENS" : "Check";
  }
});

claimAssistantForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const rawValue = claimAssistantInput?.value ?? "";
  const farcasterSession = getFarcasterSession();
  if (isFarcasterAutoConnectTarget(rawValue)) {
    const targetAddress = farcasterSession.authAddress;
    if (claimAssistantInput) {
      claimAssistantInput.value = targetAddress;
    }
    await runClaimAssistantLookup(targetAddress, { silent: true });
    if (normalizeAgentValue(onchainConfig.walletAddress) !== normalizeAgentValue(targetAddress)) {
      try {
        const wallet = await connectClaimAssistantWalletAndLookup();
        setSupportStatus(
          connectionStatus,
          wallet.isTempoConnect
            ? `Connected Tempo Connect wallet ${shortAddress(onchainConfig.walletAddress)} on chain ${onchainConfig.chainId}.`
            : wallet.isFarcasterMiniApp
              ? `Connected Farcaster Mini App signer ${shortAddress(onchainConfig.walletAddress)} on chain ${onchainConfig.chainId}.`
              : `Connected wallet ${shortAddress(onchainConfig.walletAddress)} on chain ${onchainConfig.chainId}.`
        );
      } catch (error) {
        const message = formatClaimAssistantWalletError(error);
        setClaimAssistantStatus(message, true);
        setSupportStatus(connectionStatus, message, true);
      }
      return;
    }
  }

  await runClaimAssistantLookup(rawValue);
});

claimAssistantConnectButton?.addEventListener("click", async () => {
  try {
    const wallet = await connectClaimAssistantWalletAndLookup();
    setSupportStatus(
      connectionStatus,
      wallet.id === LOCAL_DEV_WALLET_ID
        ? `Connected the localhost dev wallet ${shortAddress(onchainConfig.walletAddress)} on chain ${onchainConfig.chainId}.`
        : wallet.isTempoConnect
          ? `Connected Tempo Connect wallet ${shortAddress(onchainConfig.walletAddress)} on chain ${onchainConfig.chainId}.`
          : `Connected wallet ${shortAddress(onchainConfig.walletAddress)} on chain ${onchainConfig.chainId}.`
    );
  } catch (error) {
    const message = formatClaimAssistantWalletError(error);
    setClaimAssistantStatus(message, true);
    setSupportStatus(connectionStatus, message, true);
  }
});

claimAssistantFarcasterButton?.addEventListener("click", async () => {
  try {
    const session = await connectClaimAssistantFarcasterAndLookup({
      preferredTarget: claimAssistantInput?.value || onchainConfig.walletAddress || claimAssistantState.resolvedAgent || ""
    });
    setClaimAssistantStatus(
      session.launched
        ? "Opened Farcaster with a txs.quest claim embed. Continue there to verify and claim Farcaster badges."
        : session.missingAuthAddress
          ? "Connected Farcaster, but this client did not return an auth wallet address. Mini App setup can continue, but wallet-bound Farcaster badge lookup is unavailable in this client."
        : session.authAddress
          ? `Connected Farcaster ${describeFarcasterSession(session)}.`
          : "Connected Farcaster Quick Auth for this agent."
    );
  } catch (error) {
    setClaimAssistantStatus(shortErrorMessage(error), true);
  }
});

claimAssistantSignManifestButton?.addEventListener("click", async () => {
  try {
    farcasterManifestState = {
      ...farcasterManifestState,
      loading: true
    };
    renderFarcasterManifestState();
    const result = await signFarcasterManifest({
      domain: "txs.quest"
    });
    farcasterManifestState = {
      loading: false,
      header: result.header,
      payload: result.payload,
      signature: result.signature,
      command: buildFarcasterManifestCommand(result),
      debug: buildFarcasterManifestDebug(null, getFarcasterSession())
    };
    renderFarcasterManifestState();
    setClaimAssistantStatus(
      "Generated the Mini App signature for txs.quest. Copy the command, run it locally, then rebuild and redeploy."
    );
  } catch (error) {
    farcasterManifestState = {
      ...farcasterManifestState,
      loading: false,
      debug: buildFarcasterManifestDebug(error, getFarcasterSession())
    };
    renderFarcasterManifestState();
    setClaimAssistantStatus(formatFarcasterManifestError(error), true);
  }
});

claimAssistantCopyManifestCommandButton?.addEventListener("click", async () => {
  try {
    if (!farcasterManifestState.command) {
      throw new Error("Generate the Mini App signature first.");
    }
    await navigator.clipboard.writeText(farcasterManifestState.command);
    setClaimAssistantStatus("Copied the Farcaster domain activation command.");
  } catch (error) {
    setClaimAssistantStatus(shortErrorMessage(error), true);
  }
});

claimAssistantUseConnectedButton?.addEventListener("click", async () => {
  if (!onchainConfig.walletAddress) {
    setClaimAssistantStatus("Connect a wallet first, then we can use that wallet as the agent lookup.", true);
    return;
  }

  if (claimAssistantInput) {
    claimAssistantInput.value = onchainConfig.walletAddress;
  }
  await runClaimAssistantLookup(onchainConfig.walletAddress);
});

claimAssistantOpenProfileButton?.addEventListener("click", async () => {
  const snapshot = claimAssistantState.snapshot;
  const action = getClaimAssistantPrimaryAction(snapshot);
  if (!snapshot?.normalizedAgent || !action) {
    return;
  }

  if (action.kind === "claim-farcaster") {
    const definition = primeClaimAssistantAction(
      action.definitionEntry.definition.id,
      snapshot.normalizedAgent,
      "direct"
    );
    closeClaimAssistantModal();
    setSupportStatus(
      claimStatus,
      `Claiming ${definition.name} for ${shortAddress(snapshot.normalizedAgent)}. Confirm the wallet request to continue.`
    );
    if (typeof claimForm.requestSubmit === "function") {
      claimForm.requestSubmit();
    } else {
      claimForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    }
    return;
  }

  const agent = claimAssistantState.resolvedAgent;
  closeClaimAssistantModal();
  claimAgentInput.value = agent;
  await openAgentProfile(agent);
  setSupportStatus(
    claimStatus,
    claimAssistantState.selfConnected
      ? `Loaded your profile for ${shortAddress(agent)}. Check the claim paths and earned badges here.`
      : `Loaded the profile for ${shortAddress(agent)}.`
  );
});

copyClaimUriButton.addEventListener("click", async () => {
  if (!latestClaimEntry?.claimUri) {
    return;
  }

  try {
    await navigator.clipboard.writeText(latestClaimEntry.claimUri);
    setSupportStatus(claimStatus, `Copied claim URI for ${latestClaimEntry.claim.name}.`);
  } catch (error) {
    console.error("Clipboard write failed", error);
    setSupportStatus(claimStatus, "Could not copy the current claim URI.", true);
  }
});

copyShareLinkButton.addEventListener("click", async () => {
  const shareUrl = getClaimShareUrl(latestClaimEntry);
  if (!shareUrl) {
    return;
  }

  try {
    await navigator.clipboard.writeText(shareUrl);
    setSupportStatus(claimStatus, `Copied share link for ${latestClaimEntry.claim.name}.`);
  } catch (error) {
    console.error("Clipboard write failed", error);
    setSupportStatus(claimStatus, "Could not copy the current share link.", true);
  }
});

copyProfileLinkButton.addEventListener("click", async () => {
  const profileUrl = getProfileShareUrl();
  if (!profileUrl) {
    return;
  }

  try {
    await navigator.clipboard.writeText(profileUrl);
    setSupportStatus(
      claimStatus,
      `Copied profile link for ${shortAddress(getCurrentProfileAgent())}.`
    );
  } catch (error) {
    console.error("Clipboard write failed", error);
    setSupportStatus(claimStatus, "Could not copy the current profile link.", true);
  }
});

openSharePageButton.addEventListener("click", () => {
  const shareUrl = getClaimShareUrl(latestClaimEntry);
  if (!shareUrl) {
    return;
  }

  window.open(shareUrl, "_blank", "noopener,noreferrer");
  setSupportStatus(claimStatus, `Opened share page for ${latestClaimEntry.claim.name}.`);
});

openProfilePageButton.addEventListener("click", () => {
  const profileUrl = getProfileShareUrl();
  if (!profileUrl) {
    return;
  }

  window.open(profileUrl, "_blank", "noopener,noreferrer");
  setSupportStatus(claimStatus, `Opened profile page for ${shortAddress(getCurrentProfileAgent())}.`);
});

downloadClaimJsonButton.addEventListener("click", () => {
  if (!latestClaimEntry) {
    return;
  }

  downloadBlob(
    new Blob([`${JSON.stringify(latestClaimEntry.claim, null, 2)}\n`], {
      type: "application/json"
    }),
    `${toDownloadName(latestClaimEntry.claim.name)}-claim.json`
  );
  setSupportStatus(claimStatus, `Downloaded claim JSON for ${latestClaimEntry.claim.name}.`);
});

openLatestClaimButton.addEventListener("click", async () => {
  if (!latestClaimEntry) {
    return;
  }

  await viewClaimEntry(latestClaimEntry);
  setSupportStatus(claimStatus, `Loaded ${latestClaimEntry.claim.name} into the preview.`);
});

copyResultPrimaryTxButton.addEventListener("click", async () => {
  const txHash = getLatestOperationPrimaryTx();
  if (!txHash) {
    return;
  }

  try {
    await navigator.clipboard.writeText(txHash);
    setSupportStatus(claimStatus, "Copied the primary transaction hash.");
  } catch (error) {
    console.error("Clipboard write failed", error);
    setSupportStatus(claimStatus, "Could not copy the primary transaction hash.", true);
  }
});

copyResultSecondaryTxButton.addEventListener("click", async () => {
  const txHash = getLatestOperationSecondaryTx();
  if (!txHash) {
    return;
  }

  try {
    await navigator.clipboard.writeText(txHash);
    setSupportStatus(claimStatus, "Copied the secondary transaction hash.");
  } catch (error) {
    console.error("Clipboard write failed", error);
    setSupportStatus(claimStatus, "Could not copy the secondary transaction hash.", true);
  }
});

copyResultShareLinkButton.addEventListener("click", async () => {
  const shareUrl = getLatestOperationShareUrl();
  if (!shareUrl) {
    return;
  }

  try {
    await navigator.clipboard.writeText(shareUrl);
    setSupportStatus(claimStatus, "Copied the latest result share link.");
  } catch (error) {
    console.error("Clipboard write failed", error);
    setSupportStatus(claimStatus, "Could not copy the latest result share link.", true);
  }
});

openResultShareLinkButton.addEventListener("click", () => {
  const shareUrl = getLatestOperationShareUrl();
  if (!shareUrl) {
    return;
  }

  window.open(shareUrl, "_blank", "noopener,noreferrer");
  setSupportStatus(claimStatus, "Opened the latest result share link.");
});

clearResultOutputButton.addEventListener("click", () => {
  setLatestOperationResult(null);
  setSupportStatus(claimStatus, "Cleared the latest transaction result.");
});

showBadgeWallButton.addEventListener("click", () => {
  setDetailMode(false);
  syncBrowserUrlForWall();
  setSupportStatus(claimStatus, "Returned to the badge wall.");
});

resetRegistryButton.addEventListener("click", async () => {
  if (onchainConfig.mode === "onchain") {
    setSupportStatus(
      connectionStatus,
      "Reset only applies to local demo mode. Switch back to local to clear the browser store.",
      true
    );
    return;
  }

  clearRegistryState();
  setSupportStatus(definitionStatus, "Reset the local registry and reloaded the demo seed.");
  setSupportStatus(claimStatus, "Local Tempo claims were reset.");
  await initializeClaimStudio({
    localClaimParam: "",
    claimParam: "",
    profileAgentParam: "",
    samplePinParam: "pin1"
  });
});

connectionModeSelect.addEventListener("change", () => {
  onchainConfig = {
    ...onchainConfig,
    ...readConnectionFormValues()
  };
  syncConnectionForm(onchainConfig);
});

connectionWalletProviderSelect.addEventListener("change", () => {
  onchainConfig = {
    ...onchainConfig,
    ...readConnectionFormValues(),
    walletAddress: "",
    isAttestor: false,
    isOwner: false
  };
  syncConnectionForm(onchainConfig);
});

connectionMppWalletProviderSelect.addEventListener("change", () => {
  onchainConfig = {
    ...onchainConfig,
    ...readConnectionFormValues(),
    mppWalletAddress: ""
  };
  syncConnectionForm(onchainConfig);
});

saveConnectionButton.addEventListener("click", async () => {
  const draftConfig = {
    ...onchainConfig,
    ...readConnectionFormValues()
  };
  onchainConfig =
    draftConfig.mode === "onchain"
      ? await syncWagmiConnections(draftConfig, availableWallets)
      : draftConfig;
  saveOnchainConfig(onchainConfig);
  syncConnectionForm(onchainConfig);

  if (onchainConfig.mode === "onchain") {
    await refreshOnchainRegistryState({ loadLatestClaim: false });
    return;
  }

  await initializeClaimStudio({
    localClaimParam: "",
    claimParam: "",
    profileAgentParam: "",
    samplePinParam: "pin1"
  });
});

refreshWalletsButton.addEventListener("click", async () => {
  await refreshWalletProviders();
  const draftConfig = {
    ...onchainConfig,
    ...readConnectionFormValues(),
    walletProviderId: getPreferredWalletId(
      walletOptions({ allowLocalDev: true, chainId: connectionChainIdInput.value || onchainConfig.chainId }),
      connectionWalletProviderSelect.value || onchainConfig.walletProviderId
    ),
    mppWalletProviderId: getPreferredWalletId(
      walletOptions({ allowLocalDev: false, chainId: connectionChainIdInput.value || onchainConfig.chainId }),
      connectionMppWalletProviderSelect.value || onchainConfig.mppWalletProviderId
    )
  };
  onchainConfig =
    draftConfig.mode === "onchain"
      ? await syncWagmiConnections(draftConfig, availableWallets)
      : draftConfig;
  saveOnchainConfig(onchainConfig);
  syncConnectionForm(onchainConfig);
  setSupportStatus(
    connectionStatus,
    availableWallets.length > 0
      ? `Found ${availableWallets.length} wallet option${availableWallets.length === 1 ? "" : "s"}.`
      : "No wallets were found. Use Tempo Connect or unlock a wallet extension and try again.",
    availableWallets.length === 0
  );
});

useLocalDeploymentButton.addEventListener("click", async () => {
  try {
    const deployment = await loadDeploymentProfile();
    onchainConfig = normalizeDeploymentConfig({
      ...deployment,
      deploymentProfileUrl: "/local/anvil-deployment.json"
    });
    await refreshWalletProviders();
    saveOnchainConfig(onchainConfig);
    syncConnectionForm(onchainConfig);
    await refreshOnchainRegistryState({ loadLatestClaim: true });
    setSupportStatus(
      connectionStatus,
      `Loaded local deployment ${shortAddress(onchainConfig.badgeRegistryAddress)} on chain ${onchainConfig.chainId}.`
    );
  } catch (error) {
    setSupportStatus(connectionStatus, shortErrorMessage(error), true);
  }
});

loadDeploymentButton.addEventListener("click", async () => {
  try {
    const deploymentUrl = connectionDeploymentInput.value.trim();
    if (!deploymentUrl) {
      throw new Error("Enter a deployment profile URL first.");
    }

    const deployment = await loadDeploymentProfile(deploymentUrl);
    onchainConfig = normalizeDeploymentConfig({
      ...deployment,
      deploymentProfileUrl: deploymentUrl
    });
    await refreshWalletProviders();
    saveOnchainConfig(onchainConfig);
    syncConnectionForm(onchainConfig);
    await refreshOnchainRegistryState({ loadLatestClaim: true });
    setSupportStatus(
      connectionStatus,
      `Loaded deployment ${shortAddress(onchainConfig.badgeRegistryAddress)} from ${deploymentUrl}.`
    );
  } catch (error) {
    setSupportStatus(connectionStatus, shortErrorMessage(error), true);
  }
});

connectWalletButton.addEventListener("click", async () => {
  try {
    const draftConfig = readConnectionFormValues();
    const wallet = await resolveSelectedWallet(draftConfig);
    onchainConfig = await connectOnchainWallet(draftConfig, wallet);
    saveOnchainConfig(onchainConfig);
    syncConnectionForm(onchainConfig);
    setSupportStatus(
      connectionStatus,
      wallet.id === LOCAL_DEV_WALLET_ID
        ? `Connected the localhost dev wallet ${shortAddress(
            onchainConfig.walletAddress
          )} on chain ${onchainConfig.chainId}.`
        : wallet.isTempoConnect
          ? `Connected Tempo Connect wallet ${shortAddress(onchainConfig.walletAddress)} on chain ${onchainConfig.chainId}.`
          : `Connected wallet ${shortAddress(onchainConfig.walletAddress)} on chain ${onchainConfig.chainId}.`
    );
    await refreshOnchainRegistryState({ loadLatestClaim: false });
    openClaimAssistantModal({
      target: onchainConfig.walletAddress || ""
    });
    if (claimAssistantInput) {
      claimAssistantInput.value = onchainConfig.walletAddress;
    }
    await runClaimAssistantLookup(onchainConfig.walletAddress, { silent: true });
  } catch (error) {
    setSupportStatus(connectionStatus, shortErrorMessage(error), true);
  }
});

connectMppWalletButton.addEventListener("click", async () => {
  try {
    const draftConfig = readConnectionFormValues();
    const wallet = await resolveSelectedMppWallet(draftConfig);
    onchainConfig = await connectPaymentWallet(draftConfig, wallet);
    saveOnchainConfig(onchainConfig);
    syncConnectionForm(onchainConfig);
    setSupportStatus(
      connectionStatus,
      wallet.isTempoConnect
        ? `Connected Tempo Connect payer ${shortAddress(onchainConfig.mppWalletAddress)}.`
        : `Connected payer wallet ${shortAddress(onchainConfig.mppWalletAddress)} for MPP minting.`
    );
  } catch (error) {
    setSupportStatus(connectionStatus, shortErrorMessage(error), true);
  }
});

refreshChainButton.addEventListener("click", async () => {
  const draftConfig = {
    ...onchainConfig,
    ...readConnectionFormValues()
  };
  onchainConfig = await syncWagmiConnections(draftConfig, availableWallets);
  saveOnchainConfig(onchainConfig);
  syncConnectionForm(onchainConfig);
  await refreshOnchainRegistryState({ loadLatestClaim: false });
});

authorizeAttestorButton.addEventListener("click", async () => {
  try {
    const draftConfig = {
      ...onchainConfig,
      ...readConnectionFormValues()
    };
    const wallet = await resolveSelectedWallet(draftConfig);
    onchainConfig = await authorizeConnectedAttestor(draftConfig, wallet);
    saveOnchainConfig(onchainConfig);
    syncConnectionForm(onchainConfig);
    setSupportStatus(
      connectionStatus,
      `Authorized ${shortAddress(onchainConfig.walletAddress)} as an attestor.`
    );
  } catch (error) {
    setSupportStatus(connectionStatus, shortErrorMessage(error), true);
  }
});

registerIdentityButton.addEventListener("click", async () => {
  try {
    const draftConfig = {
      ...onchainConfig,
      ...readConnectionFormValues()
    };
    const wallet = await resolveSelectedWallet(draftConfig);
    const result = await registerConnectedIdentity(draftConfig, wallet);
    onchainConfig = result.config;
    saveOnchainConfig(onchainConfig);
    syncConnectionForm(onchainConfig);
    await refreshOnchainRegistryState({ loadLatestClaim: false });
    setSupportStatus(
      connectionStatus,
      `Registered ${shortAddress(onchainConfig.walletAddress)} in the identity registry.`
    );
  } catch (error) {
    setSupportStatus(connectionStatus, shortErrorMessage(error), true);
  }
});

refreshOperatorButton?.addEventListener("click", async () => {
  await refreshX402OperatorState();
});

mintViaMppButton.addEventListener("click", async () => {
  if (onchainConfig.mode !== "onchain") {
    setSupportStatus(
      claimStatus,
      "Switch to live contract mode before minting through MPP.",
      true
    );
    return;
  }

  try {
    const definitionId = Number(claimDefinitionSelect.value);
    if (!Number.isInteger(definitionId) || definitionId < 0) {
      throw new Error("Select a badge before minting via MPP.");
    }

    const agent = claimAgentInput.value.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(agent)) {
      throw new Error("Enter a valid 0x agent address.");
    }

    if (!readConnectionFormValues().mppServiceUrl.trim()) {
      throw new Error("Add an MPP mint service URL first.");
    }

    const draftConfig = readConnectionFormValues();
    const wallet = await resolveSelectedMppWallet(draftConfig);
    const shouldReusePayer =
      Boolean(draftConfig.mppWalletAddress) &&
      wallet.id === draftConfig.mppWalletProviderId &&
      draftConfig.mppWalletAddress === onchainConfig.mppWalletAddress;
    onchainConfig = shouldReusePayer
      ? {
          ...onchainConfig,
          ...draftConfig
        }
      : await connectPaymentWallet(draftConfig, wallet);
    saveOnchainConfig(onchainConfig);
    syncConnectionForm(onchainConfig);
    const paymentSession = await resolvePaymentWalletSession(onchainConfig, wallet);

    const definition = getDefinitionById(definitionId);
    const payload = {
      definitionId,
      agent,
      badgeRegistryAddress: onchainConfig.badgeRegistryAddress,
      rpcUrl: onchainConfig.rpcUrl,
      chainId: onchainConfig.chainId,
      amount: parseMppPrice(onchainConfig.mppPrice),
      description: definition
        ? `Mint ${definition.name} for ${shortAddress(agent)}`
        : `Mint badge #${definitionId} for ${shortAddress(agent)}`
    };

    const result = await mintClaimViaMpp({
      provider: wallet.provider,
      walletClient: paymentSession.walletClient,
      serviceUrl: onchainConfig.mppServiceUrl,
      walletAddress: onchainConfig.mppWalletAddress,
      payload
    });

    await refreshOnchainRegistryState({ loadLatestClaim: true });
    const mintedClaimEntry =
      findClaimEntryByAgentAndDefinition(agent, definitionId) ?? latestClaimEntry;
    setLatestOperationResult({
      operation: "Paid Mint",
      summary: `Minted badge #${definitionId} via the paid service.${describeMppReceipt(result.receipt).trim()}`.trim(),
      primaryTxHash: result.data?.txHash ?? "",
      secondaryTxHash: resolveResultReceiptTxHash(result.receipt),
      assetId: mintedClaimEntry?.definition?.asset?.assetId ?? "",
      definitionId,
      shareUrl:
        resolveClaimShareUrl(result.data?.claim) ||
        (mintedClaimEntry ? getClaimShareUrl(mintedClaimEntry) : ""),
      claimUri: result.data?.claimUri ?? mintedClaimEntry?.claimUri ?? ""
    });
    setSupportStatus(
      claimStatus,
      `Minted badge claim via MPP for ${shortAddress(agent)}.${describeMppReceipt(result.receipt)}`
    );
  } catch (error) {
    setSupportStatus(claimStatus, shortErrorMessage(error), true);
  }
});

claimUseConnectedWalletButton.addEventListener("click", () => {
  if (!onchainConfig.walletAddress) {
    setSupportStatus(claimStatus, "Connect a wallet first.", true);
    return;
  }

  claimAgentInput.value = onchainConfig.walletAddress;
  updateClaimProofStatus();
  setSupportStatus(
    claimStatus,
    `Set the claim target to the connected wallet ${shortAddress(onchainConfig.walletAddress)}.`
  );
});

async function boot() {
  const searchParams = new URLSearchParams(window.location.search);
  const localClaimParam = searchParams.get("localClaim");
  const claimParam = searchParams.get("claim");
  const claimAssistantParam = searchParams.get("claimAssistant");
  const samplePinParam = searchParams.get("samplePin");
  const deploymentParam = searchParams.get("deployment");
  const profileAgentParam = searchParams.get("profileAgent");
  const claimAgentParam = searchParams.get("claimAgent");
  const claimDefParam = searchParams.get("claimDef") ?? "";
  const claimAssistantTargetParam =
    searchParams.get("agent") ?? searchParams.get("address") ?? searchParams.get("ens") ?? "";
  const farcasterRouteParam = searchParams.get("farcaster") === "1";
  const shouldOpenClaimAssistantFromRoute =
    typeof window !== "undefined" &&
    (window.location.pathname === "/claim" || claimAssistantParam === "1");

  await initializeClaimStudio({
    localClaimParam,
    claimParam,
    samplePinParam,
    deploymentParam,
    profileAgentParam,
    claimAgentParam,
    claimDefParam
  });

  if (shouldOpenClaimAssistantFromRoute) {
    await openClaimAssistantFromRoute(claimAssistantTargetParam, {
      preferFarcaster: farcasterRouteParam
    });
    syncBrowserUrlForClaimAssistant(claimAssistantTargetParam);
  }
}

renderClaimAssistantSnapshot(null);
updateClaimAssistantButtons();

void boot();
