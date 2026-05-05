// @ts-nocheck

function loadPlatformSettings() {
  jest.resetModules();

  const mockDb = { query: jest.fn() };
  jest.doMock("../db", () => mockDb);
  jest.doMock("../crypto", () => ({
    decrypt: jest.fn((value) => value),
    encrypt: jest.fn((value) => `encrypted:${value}`),
    ensureEncryptionConfigured: jest.fn(),
  }));

  const platformSettings = require("../platformSettings");
  return { platformSettings, mockDb };
}

describe("platform language settings", () => {
  it("normalizes supported locale settings and falls back to English", () => {
    const { platformSettings } = loadPlatformSettings();

    expect(platformSettings.normalizeLanguageSettings({ default_locale: "fr" })).toEqual({
      defaultLocale: "fr",
    });
    expect(platformSettings.normalizeLanguageSettings({ default_locale: "de" })).toEqual({
      defaultLocale: "en",
    });
    expect(platformSettings.resolvePreferredLocale(null, "zh-Hans")).toBe("zh-Hans");
    expect(platformSettings.resolvePreferredLocale("zh-Hant", "es")).toBe("zh-Hant");
  });

  it("reads language settings with the supported locale list", async () => {
    const { platformSettings, mockDb } = loadPlatformSettings();
    mockDb.query.mockResolvedValueOnce({ rows: [{ default_locale: "es" }] });

    await expect(platformSettings.getLanguageSettings()).resolves.toEqual({
      defaultLocale: "es",
      supportedLocales: ["en", "es", "fr", "zh-Hans", "zh-Hant"],
    });
  });

  it("updates the platform default language", async () => {
    const { platformSettings, mockDb } = loadPlatformSettings();
    mockDb.query.mockResolvedValueOnce({ rows: [{ default_locale: "zh-Hant" }] });

    await expect(
      platformSettings.updateLanguageSettings({ defaultLocale: "zh-Hant" }),
    ).resolves.toEqual({
      defaultLocale: "zh-Hant",
      supportedLocales: ["en", "es", "fr", "zh-Hans", "zh-Hant"],
    });
    expect(mockDb.query).toHaveBeenCalledWith(expect.stringContaining("default_locale"), [
      "zh-Hant",
    ]);
  });

  it("rejects unsupported platform default languages", () => {
    const { platformSettings } = loadPlatformSettings();

    expect(() => platformSettings.parseRequiredLanguageSettings({ defaultLocale: "de" })).toThrow(
      /defaultLocale must be one of/,
    );
  });
});
