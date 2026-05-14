#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "../..");
const REVIEW_SCRIPT = resolve(SCRIPT_DIR, "gpt-review-pr.mjs");
const DEPLOY_SCRIPT = resolve(SCRIPT_DIR, "staging-deploy.sh");

function usage() {
  console.error("Usage: node scripts/agent/pr-watch.mjs <ISSUE_NUMBER> [--auto]");
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

function parseArgs() {
  const issueNumber = process.argv[2];
  const flags = process.argv.slice(3);
  const auto = flags.includes("--auto");
  const unknownFlags = flags.filter((flag) => flag !== "--auto");

  if (!issueNumber || !/^\d+$/.test(issueNumber) || unknownFlags.length > 0) {
    usage();
    process.exit(1);
  }

  return { issueNumber, auto };
}

function listOpenPrs() {
  const output = runCommand("gh", [
    "pr",
    "list",
    "--state",
    "open",
    "--json",
    "number,title,body,url,updatedAt,headRefName,baseRefName",
  ]);
  return JSON.parse(output);
}

function isPrLinkedToIssue(pr, issueNumber) {
  const title = pr.title ?? "";
  const body = pr.body ?? "";
  const bodyHasIssueNumber = new RegExp(`(^|\\D)#${issueNumber}(?!\\d)`).test(body);
  const bodyHasClosingKeyword = new RegExp(
    `\\b(?:Closes|Fixes)\\s+#${issueNumber}\\b`,
    "i",
  ).test(body);
  const titleOrBodyHasIssueText = new RegExp(
    `\\bIssue\\s+#?${issueNumber}\\b`,
    "i",
  ).test(`${title}\n${body}`);

  return bodyHasIssueNumber || bodyHasClosingKeyword || titleOrBodyHasIssueText;
}

function selectLinkedPr(prs, issueNumber) {
  const matches = prs.filter((pr) => isPrLinkedToIssue(pr, issueNumber));
  if (matches.length === 0) {
    return { pr: null, count: 0 };
  }

  matches.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  return { pr: matches[0], count: matches.length };
}

function runGptReview(prNumber) {
  return runCommand(process.execPath, [REVIEW_SCRIPT, String(prNumber)], {
    maxBuffer: 1024 * 1024 * 20,
  }).trim();
}

function getFirstLine(text) {
  return text.trim().split(/\r?\n/)[0] ?? "";
}

function mergeAndDeploy(prNumber, issueNumber, body) {
  runCommand("gh", ["pr", "merge", String(prNumber), "--merge"]);
  runCommand("bash", [DEPLOY_SCRIPT], { maxBuffer: 1024 * 1024 * 20 });
  runCommand("gh", ["issue", "comment", issueNumber, "--body", body]);
}

function commentCodexFixRequest(prNumber, reviewResult) {
  const body = `@codex GPT review returned C. Please fix the following issues:\n\n${reviewResult}`;
  runCommand("gh", ["pr", "comment", String(prNumber), "--body", body]);
}

function main() {
  const { issueNumber, auto } = parseArgs();
  ensureGh();

  const prs = listOpenPrs();
  const { pr, count } = selectLinkedPr(prs, issueNumber);

  if (!pr) {
    console.log(`No PR found for Issue #${issueNumber}`);
    return;
  }

  if (count > 1) {
    console.warn(
      `WARNING: Found ${count} PRs linked to Issue #${issueNumber}; using latest updated PR #${pr.number}.`,
    );
  }

  const reviewResult = runGptReview(pr.number);
  console.log(reviewResult);

  const firstLine = getFirstLine(reviewResult);
  if (firstLine.startsWith("A 类")) {
    if (!auto) {
      console.log("A 类，等待 Eric/Agent 合并");
      return;
    }
    mergeAndDeploy(
      pr.number,
      issueNumber,
      `PR #${pr.number} merged and staging deployed. Waiting for Eric staging verification.`,
    );
    return;
  }

  if (firstLine.startsWith("B 类")) {
    if (!auto) {
      console.log("B 类，等待 Eric/Agent 合并");
      return;
    }
    mergeAndDeploy(
      pr.number,
      issueNumber,
      `PR #${pr.number} merged and staging deployed. Follow-up may be needed. Waiting for Eric staging verification.`,
    );
    return;
  }

  if (firstLine.startsWith("C 类")) {
    commentCodexFixRequest(pr.number, reviewResult);
    return;
  }

  throw new Error(`Unexpected GPT review first line: ${firstLine}`);
}

try {
  main();
} catch (error) {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
}
