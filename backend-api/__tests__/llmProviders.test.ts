// @ts-nocheck
jest.mock("../db", () => ({ query: jest.fn() }));
jest.mock("../crypto", () => ({
  encrypt: jest.fn(),
  decrypt: jest.fn(),
  ensureEncryptionConfigured: jest.fn(),
}));

const { buildAuthProfiles } = require("../llmProviders");

describe("llmProviders.buildAuthProfiles", () => {
  it("builds a persisted OpenClaw auth profile store", () => {
    expect(
      buildAuthProfiles({
        OPENAI_API_KEY: "sk-live-test",
        GEMINI_API_KEY: "gm-live-test",
      })
    ).toEqual({
      version: 1,
      profiles: {
        "openai:default": {
          type: "api_key",
          provider: "openai",
          key: "sk-live-test",
        },
        "google:default": {
          type: "api_key",
          provider: "google",
          key: "gm-live-test",
          endpoint: "https://generativelanguage.googleapis.com/v1beta",
        },
      },
      order: {
        openai: ["openai:default"],
        google: ["google:default"],
      },
      lastGood: {
        openai: "openai:default",
        google: "google:default",
      },
    });
  });

  it("maps MICROSOFT_FOUNDRY_API_KEY to a microsoft-foundry profile (no shared default endpoint)", () => {
    // Foundry endpoints are per-resource — without a saved override the profile
    // ships no endpoint and the runtime must rely on the per-user base_url.
    expect(
      buildAuthProfiles({
        MICROSOFT_FOUNDRY_API_KEY: "msft-live-test",
      })
    ).toEqual({
      version: 1,
      profiles: {
        "microsoft-foundry:default": {
          type: "api_key",
          provider: "microsoft-foundry",
          key: "msft-live-test",
        },
      },
      order: {
        "microsoft-foundry": ["microsoft-foundry:default"],
      },
      lastGood: {
        "microsoft-foundry": "microsoft-foundry:default",
      },
    });
  });

  it("applies a per-user endpoint override for microsoft-foundry", () => {
    const result = buildAuthProfiles(
      { MICROSOFT_FOUNDRY_API_KEY: "msft-live-test" },
      { "microsoft-foundry": "https://my-foundry.openai.azure.com/openai/v1/" },
    );
    expect(result.profiles["microsoft-foundry:default"]).toEqual({
      type: "api_key",
      provider: "microsoft-foundry",
      key: "msft-live-test",
      endpoint: "https://my-foundry.openai.azure.com/openai/v1/",
    });
  });

  it("writes api_version when a per-user override is supplied", () => {
    const result = buildAuthProfiles(
      { MICROSOFT_FOUNDRY_API_KEY: "msft-live-test" },
      { "microsoft-foundry": "https://my-foundry.openai.azure.com/openai/deployments/my-gpt/" },
      { "microsoft-foundry": "2024-10-21" },
    );
    expect(result.profiles["microsoft-foundry:default"]).toEqual({
      type: "api_key",
      provider: "microsoft-foundry",
      key: "msft-live-test",
      endpoint: "https://my-foundry.openai.azure.com/openai/deployments/my-gpt/",
      api_version: "2024-10-21",
    });
  });

  it("per-user override wins over the catalog endpoint", () => {
    // google has a catalog default (https://generativelanguage.googleapis.com/v1beta)
    // but a user-saved override should win.
    const result = buildAuthProfiles(
      { GEMINI_API_KEY: "gm-live-test" },
      { google: "https://custom-gemini.example.com/v1" },
    );
    expect(result.profiles["google:default"].endpoint).toBe(
      "https://custom-gemini.example.com/v1",
    );
  });
});

describe("llmProviders.buildBaseUrlEnvVars", () => {
  const { buildBaseUrlEnvVars } = require("../llmProviders");

  it("derives <PROVIDER>_BASE_URL env vars from <PROVIDER>_API_KEY-keyed overrides", () => {
    expect(
      buildBaseUrlEnvVars({
        MICROSOFT_FOUNDRY_API_KEY: "https://my-foundry.openai.azure.com/openai/v1/",
      }),
    ).toEqual({
      MICROSOFT_FOUNDRY_BASE_URL: "https://my-foundry.openai.azure.com/openai/v1/",
    });
  });

  it("skips entries without a base URL", () => {
    expect(buildBaseUrlEnvVars({ MICROSOFT_FOUNDRY_API_KEY: "" })).toEqual({});
  });
});

describe("llmProviders.buildApiVersionEnvVars", () => {
  const { buildApiVersionEnvVars } = require("../llmProviders");

  it("derives <PROVIDER>_API_VERSION env vars", () => {
    expect(
      buildApiVersionEnvVars({ MICROSOFT_FOUNDRY_API_KEY: "2024-10-21" }),
    ).toEqual({ MICROSOFT_FOUNDRY_API_VERSION: "2024-10-21" });
  });

  it("skips entries without an api-version", () => {
    expect(buildApiVersionEnvVars({ MICROSOFT_FOUNDRY_API_KEY: "" })).toEqual({});
  });
});
