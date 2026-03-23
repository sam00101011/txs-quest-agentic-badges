import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { Receipt } from "mppx";
import { Mppx, tempo as tempoMethod } from "mppx/client";
import { createWalletClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  tempo,
  tempoAndantino,
  tempoDevnet,
  tempoLocalnet,
  tempoModerato,
  tempoTestnet
} from "viem/chains";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const deploymentPath = join(projectRoot, "web", "public", "local", "anvil-deployment.json");
const serviceUrl = process.env.SERVICE_URL ?? "http://127.0.0.1:8787/api/mint/claim";
const knownTempoChains = [
  tempo,
  tempoAndantino,
  tempoDevnet,
  tempoLocalnet,
  tempoModerato,
  tempoTestnet
];

function randomAgentAddress() {
  return `0x${randomBytes(20).toString("hex")}`;
}

function resolveTempoChain(chainId) {
  return (
    knownTempoChains.find((chain) => chain.id === chainId) ??
    defineChain({
      id: chainId,
      name: `Tempo ${chainId}`,
      nativeCurrency: {
        name: "Tempo",
        symbol: "TEMPO",
        decimals: 18
      },
      rpcUrls: {
        default: {
          http: [process.env.TEMPO_RPC_URL ?? "https://rpc.tempo.xyz"]
        }
      }
    })
  );
}

function readTempoWallet() {
  const result = spawnSync("tempo", ["wallet", "-j", "whoami"], {
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(result.stderr?.trim() || "Could not read the Tempo wallet state.");
  }

  const parsed = JSON.parse(result.stdout);
  if (!parsed.ready || !parsed.key?.key) {
    throw new Error("Tempo wallet is not ready for paid requests.");
  }

  return parsed;
}

async function main() {
  const deployment = JSON.parse(await readFile(deploymentPath, "utf8"));
  const tempoWallet = readTempoWallet();
  const account = privateKeyToAccount(tempoWallet.key.key);
  const definitionId = Number(process.env.DEFINITION_ID ?? deployment.seeded?.definitionId ?? 0);
  const amount = Number(process.env.AMOUNT ?? 0.05);
  const agent = process.env.AGENT ?? randomAgentAddress();

  const mppx = Mppx.create({
    methods: [
      tempoMethod.charge({
        account,
        getClient: ({ chainId }) =>
          createWalletClient({
            account,
            chain: resolveTempoChain(chainId ?? tempoWallet.key.chain_id),
            transport: http(
              resolveTempoChain(chainId ?? tempoWallet.key.chain_id).rpcUrls.default.http[0]
            )
          }),
        mode: "pull"
      })
    ]
  });

  const payload = {
    amount,
    agent,
    badgeRegistryAddress: deployment.badgeRegistryAddress,
    chainId: deployment.chainId,
    definitionId,
    description: `Mint badge #${definitionId} via Tempo wallet verification`,
    rpcUrl: deployment.rpcUrl
  };

  const response = await mppx.fetch(serviceUrl, {
    body: JSON.stringify(payload),
    context: {
      account,
      mode: "pull"
    },
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  });

  if (!response.ok) {
    throw new Error((await response.text()) || `MPP mint failed with ${response.status}.`);
  }

  const receipt = Receipt.fromResponse(response);
  const data = await response.json();

  process.stdout.write(
    `${JSON.stringify(
      {
        agent,
        claimName: data.claim?.name ?? "",
        claimUriLength: data.claimUri?.length ?? 0,
        definitionId,
        payer: account.address,
        receipt: {
          method: receipt.method,
          status: receipt.status
        },
        txHash: data.txHash
      },
      null,
      2
    )}\n`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
