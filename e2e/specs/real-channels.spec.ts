// Real-credential channel tests: configure real OpenClaw channels on an
// OpenClaw+Docker agent and verify outbound delivery where the configured
// credentials match the OpenClaw gateway schema.

import { expect, test } from "@playwright/test";
import { DEFAULT_PASSWORD, createUserSession, uniqueEmail, uniqueName } from "./support/app";
import {
  deployAgent,
  waitForAgentStatus,
  waitForOpenClawGateway,
  deleteAgent,
  createChannel,
  testChannel,
  deleteChannel,
  saveProviderKey,
  getPlatformConfig,
  backendSupported,
} from "./support/agents";
import { real } from "./support/realConfig";

test.describe("Channels — real credentials", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(real.provisionTimeoutMs + 300000);

  /** @type {{email: string, password: string, token: string} | null} */
  let operator = null;
  /** @type {any} */
  let agent = null;

  test.beforeAll(async ({ request }) => {
    test.setTimeout(real.provisionTimeoutMs + 300000);
    test.skip(!real.llmApiKey, "REAL_LLM_API_KEY (or provider-specific key) not set");
    test.skip(
      !real.enableOpenclawDocker,
      "OpenClaw+Docker cell disabled; channels spec needs a host agent",
    );

    operator = await createUserSession(request, {
      email: uniqueEmail("nora-real-channels"),
      password: DEFAULT_PASSWORD,
    });
    await saveProviderKey(request, operator.token, {
      provider: real.llmProviderId,
      apiKey: real.llmApiKey,
      model: real.llmModel || undefined,
    });

    const platform = await getPlatformConfig(request, operator.token);
    test.skip(!backendSupported(platform, "docker"), "Docker backend not enabled");

    agent = await deployAgent(request, operator.token, {
      name: uniqueName("real-channels-host"),
      runtimeFamily: "openclaw",
      backend: "docker",
      sandboxProfile: "standard",
    });
    agent = await waitForAgentStatus(request, operator.token, agent.id, ["running", "warning"], {
      timeoutMs: real.provisionTimeoutMs,
    });
    await waitForOpenClawGateway(request, operator.token, agent.id, {
      timeoutMs: real.provisionTimeoutMs,
    });
  });

  test.afterAll(async ({ request }) => {
    if (agent?.id) {
      await deleteAgent(request, operator.token, agent.id);
    }
  });

  test("[C1] Telegram — real bot token delivers a test message", async ({ request }) => {
    test.skip(
      !real.telegramBotToken || !real.telegramChatId,
      "REAL_TELEGRAM_BOT_TOKEN / REAL_TELEGRAM_CHAT_ID not set",
    );

    const channel = await createChannel(request, operator.token, agent.id, {
      type: "telegram",
      name: uniqueName("Telegram real"),
      config: {
        bot_token: real.telegramBotToken,
        chat_id: real.telegramChatId,
      },
    });
    expect(channel?.id).toBeTruthy();

    const result = await testChannel(request, operator.token, agent.id, channel.id);
    expect(result?.success, JSON.stringify(result)).toBe(true);

    await deleteChannel(request, operator.token, agent.id, channel.id);
  });

  test("[C2] Discord — real bot config delivers a test message", async ({ request }) => {
    test.skip(
      !real.openclawDiscordConfig,
      "REAL_OPENCLAW_DISCORD_CONFIG_JSON not set; REAL_DISCORD_WEBHOOK_URL targets the legacy webhook adapter, not OpenClaw Discord Bot API",
    );

    const channel = await createChannel(request, operator.token, agent.id, {
      type: "discord",
      name: uniqueName("Discord real"),
      config: real.openclawDiscordConfig,
    });
    expect(channel?.id).toBeTruthy();

    const result = await testChannel(request, operator.token, agent.id, channel.id);
    expect(result?.success, JSON.stringify(result)).toBe(true);

    await deleteChannel(request, operator.token, agent.id, channel.id);
  });

  test("[C3] SSRF guard — internal webhook URL is refused", async ({ request }) => {
    test.skip(
      true,
      "Legacy webhook-channel SSRF coverage does not apply to OpenClaw channel schema",
    );

    // Attempt to configure a Discord channel whose webhook URL points at the
    // AWS/GCP cloud-metadata service (169.254.169.254). The PRIVATE_IP_RE
    // guard in backend-api/channels/adapters.ts must refuse the send call.
    // (DNS-name based internal targets like `worker-provisioner` are not
    // blocked by the literal-IP regex — that gap is a known limitation, not
    // something this test exercises.)
    const channel = await createChannel(request, operator.token, agent.id, {
      type: "discord",
      name: uniqueName("Discord SSRF"),
      config: { webhook_url: "http://169.254.169.254/latest/meta-data/" },
    });
    expect(channel?.id).toBeTruthy();

    const result = await testChannel(request, operator.token, agent.id, channel.id);
    expect(result?.success).toBe(false);
    expect(String(result?.error || result?.message || "")).toMatch(
      /internal|private network|must not target|must use http/i,
    );

    await deleteChannel(request, operator.token, agent.id, channel.id);
  });
});
