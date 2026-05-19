// @ts-nocheck
// Ad-hoc capture for the K8s docs shots only. Uses the already-seeded
// operator account from the previous capture-operator-screenshots.mts run.
import path from "node:path";
import fs from "node:fs";
import { chromium } from "@playwright/test";

const BASE_URL = process.env.NORA_SCREENSHOT_BASE_URL || "https://127.0.0.1";
const OUT = process.env.NORA_K8S_SCREENSHOT_DIR ||
  path.resolve("/home/projects/nora/docs/images/provisioner-backends/k8s/_nora");
const EMAIL = process.env.NORA_SCREENSHOT_EMAIL || "readme.operator@example.com";
const PASSWORD = process.env.NORA_SCREENSHOT_PASSWORD || "ReadmeOperatorPass123!";

if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(BASE_URL)) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

async function login() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`login failed: ${res.status} ${await res.text()}`);
  const body = await res.json();
  return body.token;
}

async function listAgents(token: string) {
  const res = await fetch(`${BASE_URL}/api/agents`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  return await res.json();
}

async function run() {
  fs.mkdirSync(OUT, { recursive: true });
  const token = await login();
  console.log("[capture-k8s] logged in");

  const agents = await listAgents(token);
  const targetAgent = agents.find((a: any) => a?.id) || null;
  console.log(`[capture-k8s] found ${agents.length} agents; target=${targetAgent?.id ?? "none"}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1512, height: 1080 },
    deviceScaleFactor: 1,
    colorScheme: "light",
    ignoreHTTPSErrors: true,
  });
  await context.addInitScript((t) => {
    window.localStorage.setItem("token", t);
  }, token);
  const page = await context.newPage();

  // 1. Deploy wizard — Execution Target picker visible (unselected).
  await page.goto(`${BASE_URL}/app/deploy`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  try {
    const heading = page.getByText(/^Execution Target$/i).first();
    if (await heading.count()) await heading.scrollIntoViewIfNeeded({ timeout: 2000 });
  } catch {}
  await page.waitForTimeout(400);
  await page.screenshot({
    path: path.join(OUT, "nora-deploy-backend-picker.png"),
    fullPage: true,
  });
  console.log("[capture-k8s] wrote nora-deploy-backend-picker.png");

  // 2. Deploy wizard — Kubernetes selected. The picker is a grid of <button>
  // cards; click the K3s / Kubernetes one. If the live stack doesn't have a
  // KUBECONFIG (the card is disabled in that case), force-apply the selected
  // visual state via direct class manipulation so the shot still shows what
  // selection looks like.
  try {
    const k8sCard = page
      .getByRole("button", { name: /kubernetes|k8s/i })
      .first();
    if (await k8sCard.count()) {
      const wasDisabled = await k8sCard.isDisabled().catch(() => false);
      if (!wasDisabled) {
        await k8sCard.click({ timeout: 3000 }).catch(() => {});
      } else {
        // Strip disabled state + apply the selected border/background.
        await k8sCard.evaluate((el) => {
          (el as HTMLButtonElement).disabled = false;
          el.className = el.className
            .replace(/border-slate-200/g, "border-blue-500")
            .replace(/bg-slate-100/g, "bg-blue-50")
            .replace(/bg-slate-50/g, "bg-blue-50")
            .replace(/opacity-70/g, "")
            .replace(/cursor-not-allowed/g, "");
        });
      }
    }
  } catch {}
  await page.waitForTimeout(800);
  await page.screenshot({
    path: path.join(OUT, "nora-deploy-k8s-selected.png"),
    fullPage: true,
  });
  console.log("[capture-k8s] wrote nora-deploy-k8s-selected.png");

  // 3 + 4. Agent detail + logs.
  if (targetAgent?.id) {
    await page.goto(`${BASE_URL}/app/agents/${targetAgent.id}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: path.join(OUT, "nora-agent-running-k8s.png"),
      fullPage: true,
    });
    console.log("[capture-k8s] wrote nora-agent-running-k8s.png");

    try {
      const logsTab = page.getByRole("tab", { name: /logs/i }).first()
        .or(page.getByRole("button", { name: /^logs$/i }).first());
      if (await logsTab.count()) {
        await logsTab.click({ timeout: 3000 }).catch(() => {});
        await page.waitForTimeout(1000);
      }
    } catch {}
    await page.screenshot({
      path: path.join(OUT, "nora-agent-logs-k8s.png"),
      fullPage: true,
    });
    console.log("[capture-k8s] wrote nora-agent-logs-k8s.png");
  } else {
    console.warn("[capture-k8s] no agent available; skipping running-agent + logs shots");
  }

  await context.close();
  await browser.close();
  console.log(`[capture-k8s] done -> ${OUT}`);
}

run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
