#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "../..");
const DIFF_LIMIT = 60000;
const DEFAULT_MODEL = "gpt-4.1-mini";

function usage() {
  console.error("Usage: node scripts/agent/gpt-review-pr.mjs <PR_NUMBER>");
}

function truncateText(value, limit) {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit)}\n\n[TRUNCATED: original length ${value.length}, sent first ${limit} characters]`;
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? REPO_ROOT,
    encoding: "utf8",
    maxBuffer: options.maxBuffer ?? 1024 * 1024 * 20,
  });

  if (result.error) {
    if (result.error.code === "ENOENT") {
      throw new Error(`${command} not found. Please install it and try again.`);
    }
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();
    const output = stderr || stdout || `exit code ${result.status}`;
    throw new Error(`Command failed: ${command} ${args.join(" ")}\n${output}`);
  }

  return result.stdout ?? "";
}

function ensureGh() {
  runCommand("gh", ["--version"]);
}

function parsePrNumber() {
  const prNumber = process.argv[2];
  if (!prNumber || !/^\d+$/.test(prNumber)) {
    usage();
    process.exit(1);
  }
  return prNumber;
}

function getPrInfo(prNumber) {
  const output = runCommand("gh", [
    "pr",
    "view",
    prNumber,
    "--json",
    "number,title,body,url,files,headRefName,baseRefName,isDraft,mergeable,statusCheckRollup",
  ]);
  return JSON.parse(output);
}

function getPrDiff(prNumber) {
  return runCommand("gh", ["pr", "diff", prNumber], {
    maxBuffer: 1024 * 1024 * 60,
  });
}

function summarizeChangedFiles(files) {
  if (!Array.isArray(files) || files.length === 0) {
    return "(no files reported by gh)";
  }

  return files
    .map((file) => {
      const path = file.path ?? file.filename ?? file.name ?? "(unknown path)";
      const additions = Number.isFinite(file.additions) ? ` +${file.additions}` : "";
      const deletions = Number.isFinite(file.deletions) ? ` -${file.deletions}` : "";
      return `- ${path}${additions}${deletions}`;
    })
    .join("\n");
}

function collectRiskPrecheck(pr) {
  const files = Array.isArray(pr.files)
    ? pr.files.map((file) => file.path ?? file.filename ?? file.name ?? "").filter(Boolean)
    : [];

  const forbiddenPattern =
    /(^|\/)(\.env|node_modules|dist|cache|\.cache)(\/|$)|\.(zip|db|sqlite|sqlite3|dump|bak|tar|gz)$/i;
  const runtimePattern =
    /(^|\/)(runtime|runtime_data|runtime_state|backend\/data|data\/runtime)(\/|\.|$)/i;
  const productionPattern =
    /(^|\/)(prod|production|secrets?|deploy|service|systemd|nginx|cloud|terraform|k8s|kubernetes)(\/|\.|-|_|$)/i;

  return {
    associatedIssueEvidence:
      `${pr.title ?? ""}\n${pr.body ?? ""}`.match(
        /\b(?:closes|fixes|resolves)\s+#\d+\b|#\d+|\bIssue\s+#?\d+\b/gi,
      ) ?? [],
    touchesFrontend: files.some((path) => path.startsWith("frontend_") || path.endsWith(".js") || path.endsWith(".jsx") || path.endsWith(".ts") || path.endsWith(".tsx")),
    touchesBackend: files.some((path) => path.startsWith("backend/")),
    touchesPos: files.some((path) => /(^|\/)(pos|cashier|sale|terminal)/i.test(path)),
    touchesBarcode: files.some((path) => /barcode|resolver|STORE_ITEM|raw_bale|sdb|lpk|sdo/i.test(path)),
    possibleForbiddenFiles: files.filter((path) => forbiddenPattern.test(path) || runtimePattern.test(path)),
    possibleProductionConfig: files.filter((path) => productionPattern.test(path)),
  };
}

function buildReviewPrompt(pr, diff) {
  const limitedDiff = truncateText(diff, DIFF_LIMIT);
  const riskPrecheck = collectRiskPrecheck(pr);

  return `You are GPT Reviewer for the FW-ERP repository.

Review PR #${pr.number} and decide whether it can be merged to main for staging.

You MUST inspect:
- changed files
- PR body
- diff summary
- whether the PR links an Issue
- whether it changes frontend
- whether it changes backend
- whether it affects POS
- whether it affects barcode rules
- whether it contains forbidden files
- whether it changes production configuration
- whether staging deployment is needed
- whether it violates scope
- whether it can enter staging testing

Output format is strict. The first line MUST be exactly one of these conclusion patterns:

A 类：可以直接合并 PR #${pr.number} 到 main

B 类：可以合并 PR #${pr.number} 到 main，并记录 follow-up

C 类：禁止合并 PR #${pr.number}，退回 Codex 修改

You may add short reasons after the first line.

A class criteria:
- No business red-line violation
- No obvious scope expansion
- No production configuration change
- No forbidden files
- No breakage to POS, barcode, store receiving, or inventory core rules
- PR solves the main Issue target
- Can enter staging testing

B class criteria:
- PR solves the main target
- Small issues exist but do not block staging
- Small issues can become follow-up

C class criteria:
- Modifies POS scan red lines
- Makes POS accept RAW_BALE, SDB, LPK, or SDO
- Makes store receiving accept SDB or LPK as formal receiving codes
- Modifies STORE_ITEM barcode generation
- Modifies barcode resolver core red lines
- Modifies inventory counting rules when the Issue did not request it
- Modifies production configuration
- Uploads secret, .env, database backup, runtime data, zip, node_modules, cache, or dist
- Large refactor or obvious scope expansion
- Frontend-only change while backend issue is not closed
- Backend-only change while frontend page or button remains unusable
- Build or test clearly failed
- PR is not linked to an Issue
- PR description is unclear

PR metadata:
${JSON.stringify(
    {
      number: pr.number,
      title: pr.title,
      body: pr.body,
      url: pr.url,
      headRefName: pr.headRefName,
      baseRefName: pr.baseRefName,
      isDraft: pr.isDraft,
      mergeable: pr.mergeable,
      statusCheckRollup: pr.statusCheckRollup,
    },
    null,
    2,
  )}

Changed files:
${summarizeChangedFiles(pr.files)}

Local risk precheck:
${JSON.stringify(riskPrecheck, null, 2)}

Diff excerpt, limited to first ${DIFF_LIMIT} characters:
${limitedDiff}
`;
}

async function callOpenAi(prompt) {
  if (typeof fetch !== "function") {
    throw new Error("Node.js fetch is unavailable. Use Node.js 18 or newer.");
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required.");
  }

  const model = process.env.OPENAI_REVIEW_MODEL || DEFAULT_MODEL;
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "You are a strict pull request reviewer. Follow the required output format exactly.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `OpenAI API failed (${response.status}): ${truncateText(errorText, 2000)}`,
    );
  }

  const data = await response.json();
  const result = data?.choices?.[0]?.message?.content?.trim();
  if (!result) {
    throw new Error("OpenAI API returned an empty review result.");
  }
  return result;
}

function commentOnPr(prNumber, body) {
  runCommand("gh", ["pr", "comment", prNumber, "--body", body]);
}

async function main() {
  const prNumber = parsePrNumber();
  ensureGh();

  const pr = getPrInfo(prNumber);
  const diff = getPrDiff(prNumber);
  const prompt = buildReviewPrompt(pr, diff);
  const reviewResult = await callOpenAi(prompt);

  process.stdout.write(`${reviewResult}\n`);
  commentOnPr(prNumber, reviewResult);
}

main().catch((error) => {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
});
