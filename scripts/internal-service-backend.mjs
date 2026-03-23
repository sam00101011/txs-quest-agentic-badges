import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  INTERNAL_SERVICE_ACTIVITY_CRITERIA_KIND,
  evaluateReusableOracleCriteria,
  normalizeReusableOracleCriteria
} from "../web/oracleCriteria.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_HOST = process.env.HOST ?? "127.0.0.1";
const DEFAULT_PORT = Number(process.env.PORT ?? 8791);
const DEFAULT_DB_PATH =
  process.env.INTERNAL_SERVICE_DB ??
  join(__dirname, "..", "config", "internal-service.sample.json");

async function loadJson(pathname, fallback) {
  try {
    return JSON.parse(await readFile(pathname, "utf8"));
  } catch {
    return fallback;
  }
}

function json(data, init = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type,authorization,x-agentic-product",
      ...(init.headers ?? {})
    }
  });
}

function normalizeAddress(value) {
  const trimmed = String(value ?? "").trim();
  return /^0x[a-fA-F0-9]{40}$/.test(trimmed) ? trimmed.toLowerCase() : "";
}

function normalizeWalletList(payload = {}) {
  const values = Array.isArray(payload.walletAddresses)
    ? payload.walletAddresses
    : [payload.walletAddress, payload.agent];
  return [...new Set(values.map((value) => normalizeAddress(value)).filter(Boolean))];
}

function mergeInternalServiceSnapshots(snapshots = []) {
  const activities = [];
  const evmChains = new Map();
  let walletAddress = "";

  for (const snapshot of snapshots) {
    if (!snapshot || typeof snapshot !== "object") {
      continue;
    }

    walletAddress = walletAddress || normalizeAddress(snapshot.walletAddress ?? snapshot.wallet);
    activities.push(...(Array.isArray(snapshot.activities) ? snapshot.activities : []));

    const rawChains = Array.isArray(snapshot.evmChains)
      ? snapshot.evmChains
      : Array.isArray(snapshot.evmActivity?.chains)
        ? snapshot.evmActivity.chains
        : snapshot.evmActivity?.chains && typeof snapshot.evmActivity.chains === "object"
          ? Object.entries(snapshot.evmActivity.chains).map(([chainId, value]) => ({
              ...(value && typeof value === "object" ? value : {}),
              chainId
            }))
          : [];

    for (const chain of rawChains) {
      const chainId = String(chain.chainId ?? "").trim().toLowerCase();
      if (!chainId) {
        continue;
      }
      const existing = evmChains.get(chainId) ?? {
        chainId,
        txCount: 0,
        agentTxCount: 0,
        subjectType: "",
        subjectId: "",
        lastSeenAt: 0
      };
      existing.txCount += Number(chain.txCount ?? chain.transactions ?? chain.activityCount ?? 0) || 0;
      existing.agentTxCount +=
        Number(chain.agentTxCount ?? chain.qualifyingTxCount ?? chain.verifiedAgentTxCount ?? 0) || 0;
      existing.subjectType = existing.subjectType || String(chain.subjectType ?? "").trim().toUpperCase();
      existing.subjectId = existing.subjectId || String(chain.subjectId ?? chain.agentId ?? chain.agentSlug ?? "").trim();
      existing.lastSeenAt = Math.max(existing.lastSeenAt, Number(chain.lastSeenAt ?? chain.timestamp ?? 0) || 0);
      evmChains.set(chainId, existing);
    }
  }

  return {
    walletAddress,
    activities,
    evmChains: [...evmChains.values()]
  };
}

export async function createServer(options = {}) {
  if (typeof Bun === "undefined") {
    throw new Error("Run the internal service backend with Bun.");
  }

  const database = await loadJson(options.databasePath ?? DEFAULT_DB_PATH, {
    internalServiceActivity: {}
  });
  const snapshots =
    database?.internalServiceActivity && typeof database.internalServiceActivity === "object"
      ? database.internalServiceActivity
      : {};

  const hostname = options.host ?? DEFAULT_HOST;
  const port = Number(options.port ?? DEFAULT_PORT);

  return Bun.serve({
    hostname,
    port,
    async fetch(request) {
      if (request.method === "OPTIONS") {
        return json({}, { status: 204 });
      }

      const url = new URL(request.url);

      if (request.method === "GET" && url.pathname === "/api/internal-service/health") {
        return json({
          status: "ok",
          source: "sample-internal-service-backend",
          databasePath: options.databasePath ?? DEFAULT_DB_PATH,
          wallets: Object.keys(snapshots).length,
          supportedCriteria: [INTERNAL_SERVICE_ACTIVITY_CRITERIA_KIND]
        });
      }

      if (request.method === "POST" && url.pathname === "/api/internal-service/query") {
        let payload = {};
        try {
          payload = await request.json();
        } catch {
          return json({ detail: "Expected JSON request body." }, { status: 400 });
        }

        const walletAddresses = normalizeWalletList(payload);
        if (!walletAddresses.length) {
          return json({ detail: "Provide walletAddress or walletAddresses." }, { status: 400 });
        }

        const snapshot = mergeInternalServiceSnapshots(
          walletAddresses.map((walletAddress) => snapshots[walletAddress] ?? null)
        );
        const criteria = normalizeReusableOracleCriteria(
          "INTERNAL_SERVICE_ACTIVITY",
          payload.criteria && typeof payload.criteria === "object" ? payload.criteria : {}
        );
        const evaluation = evaluateReusableOracleCriteria(
          "INTERNAL_SERVICE_ACTIVITY",
          criteria,
          snapshot
        );

        return json({
          requestId:
            typeof crypto !== "undefined" && crypto.randomUUID
              ? crypto.randomUUID()
              : "internal-service-" + Date.now(),
          requestShape:
            String(payload.requestShape ?? "agentic-poap.internal-service-activity.v1").trim() ||
            "agentic-poap.internal-service-activity.v1",
          walletAddress: payload.walletAddress ?? payload.agent ?? walletAddresses[0],
          walletAddresses,
          snapshot,
          evaluation
        });
      }

      return json({ detail: "Not found." }, { status: 404 });
    }
  });
}

if (import.meta.main) {
  const server = await createServer();
  console.log(
    "internal service backend listening on http://" +
      server.hostname +
      ":" +
      server.port +
      "/api/internal-service/query"
  );
}
