import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  PAYMENT_HISTORY_CRITERIA_KIND,
  X402_HISTORY_CRITERIA_KIND,
  evaluatePaymentHistory,
  evaluateX402History,
  normalizePaymentHistoryRecord
} from "../web/x402History.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_HOST = process.env.HOST ?? "127.0.0.1";
const DEFAULT_PORT = Number(process.env.PORT ?? 8789);
const DEFAULT_HISTORY_PATH =
  process.env.PAYMENT_HISTORY_DB ??
  process.env.X402_HISTORY_DB ??
  join(__dirname, "..", "config", "x402-history.sample.json");

async function loadJson(pathname, fallback) {
  try {
    const raw = await readFile(pathname, "utf8");
    return JSON.parse(raw);
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

function normalizeWalletList(payload = {}) {
  const values = Array.isArray(payload.walletAddresses)
    ? payload.walletAddresses
    : [payload.walletAddress, payload.agent];

  return [...new Set(values.map((value) => String(value ?? "").trim().toLowerCase()).filter(Boolean))];
}

function filterRecords(records, walletAddresses) {
  if (!walletAddresses.length) {
    return [];
  }

  return records.filter((record) => walletAddresses.includes(String(record.payer ?? "").trim().toLowerCase()));
}

function evaluateForPayload(payload, records) {
  const criteria = payload.criteria && typeof payload.criteria === "object" ? payload.criteria : {};
  const walletAddresses = normalizeWalletList(payload);
  const walletAddress = walletAddresses[0] ?? "";

  if (String(criteria.kind ?? "").trim() === X402_HISTORY_CRITERIA_KIND) {
    return evaluateX402History(criteria, records, { walletAddress });
  }

  return evaluatePaymentHistory(criteria, records, { walletAddress, walletAddresses });
}

export async function createServer(options = {}) {
  if (typeof Bun === "undefined") {
    throw new Error("Run the payment history backend with Bun.");
  }

  const database = await loadJson(options.historyPath ?? DEFAULT_HISTORY_PATH, { records: [] });
  const records = Array.isArray(database?.records)
    ? database.records.map((entry) => normalizePaymentHistoryRecord(entry)).filter((entry) => entry.payer)
    : [];

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

      if (request.method === "GET" && url.pathname === "/api/payment-history/health") {
        return json({
          status: "ok",
          source: "sample-http-backend",
          historyPath: options.historyPath ?? DEFAULT_HISTORY_PATH,
          records: records.length,
          supportedCriteria: [PAYMENT_HISTORY_CRITERIA_KIND, X402_HISTORY_CRITERIA_KIND]
        });
      }

      if (request.method === "POST" && url.pathname === "/api/payment-history/query") {
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

        const filteredRecords = filterRecords(records, walletAddresses);
        const evaluation = evaluateForPayload(payload, filteredRecords);

        return json({
          requestId:
            typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `payment-backend-${Date.now()}`,
          walletAddress: payload.walletAddress ?? payload.agent ?? walletAddresses[0],
          walletAddresses,
          records: filteredRecords,
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
    `payment history backend listening on http://${server.hostname}:${server.port}/api/payment-history/query`
  );
}
