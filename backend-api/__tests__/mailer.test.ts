// @ts-nocheck
/**
 * __tests__/mailer.test.ts — platform-wide email sender. Exercises the
 * never-throws contract, the not-configured short-circuit, and the
 * transporter wiring (port 465 → secure regardless of flag, password
 * decryption flows through). Mocks `nodemailer` so no real SMTP server
 * is required.
 */

const mockSendMail = jest.fn();
const mockVerify = jest.fn();
const mockCreateTransport = jest.fn(() => ({
  sendMail: mockSendMail,
  verify: mockVerify,
}));

jest.mock("nodemailer", () => ({ createTransport: mockCreateTransport }), { virtual: true });

const mockGetSmtpDeliveryConfig = jest.fn();
jest.mock("../platformSettings", () => ({
  getSmtpDeliveryConfig: mockGetSmtpDeliveryConfig,
}));

const mailer = require("../mailer");

beforeEach(() => {
  mockCreateTransport.mockClear();
  mockSendMail.mockReset().mockResolvedValue({ messageId: "msg-1" });
  mockVerify.mockReset().mockResolvedValue(true);
  mockGetSmtpDeliveryConfig.mockReset();
  mailer.bustCache();
});

describe("isConfigured", () => {
  it("returns false when host is empty", async () => {
    mockGetSmtpDeliveryConfig.mockResolvedValueOnce(null);
    expect(await mailer.isConfigured()).toBe(false);
  });

  it("returns true when host + port + from are populated", async () => {
    mockGetSmtpDeliveryConfig.mockResolvedValueOnce({
      host: "smtp.test",
      port: 587,
      fromAddress: "n@x.com",
    });
    expect(await mailer.isConfigured()).toBe(true);
  });

  it("caches the result for repeated calls", async () => {
    mockGetSmtpDeliveryConfig.mockResolvedValueOnce({
      host: "smtp.test",
      port: 587,
      fromAddress: "n@x.com",
    });
    await mailer.isConfigured();
    await mailer.isConfigured();
    await mailer.isConfigured();
    expect(mockGetSmtpDeliveryConfig).toHaveBeenCalledTimes(1);
  });

  it("bustCache forces a refetch", async () => {
    mockGetSmtpDeliveryConfig
      .mockResolvedValueOnce({ host: "smtp.test", port: 587, fromAddress: "n@x.com" })
      .mockResolvedValueOnce(null);
    expect(await mailer.isConfigured()).toBe(true);
    mailer.bustCache();
    expect(await mailer.isConfigured()).toBe(false);
  });
});

describe("sendMail — input validation", () => {
  it("rejects missing 'to'", async () => {
    expect(await mailer.sendMail({ subject: "S", text: "T" })).toEqual({
      delivered: false,
      error: "to address required",
    });
  });

  it("rejects missing subject or text", async () => {
    expect(await mailer.sendMail({ to: "a@b.com", text: "T" })).toMatchObject({
      delivered: false,
    });
    expect(await mailer.sendMail({ to: "a@b.com", subject: "S" })).toMatchObject({
      delivered: false,
    });
  });

  it("rejects empty 'to' array", async () => {
    expect(await mailer.sendMail({ to: [], subject: "S", text: "T" })).toMatchObject({
      delivered: false,
      error: "to address required",
    });
  });
});

describe("sendMail — delivery", () => {
  it("returns not_configured when SMTP not set", async () => {
    mockGetSmtpDeliveryConfig.mockResolvedValueOnce(null);
    const result = await mailer.sendMail({
      to: "a@b.com",
      subject: "S",
      text: "T",
    });
    expect(result).toEqual({ delivered: false, error: "not_configured" });
    expect(mockCreateTransport).not.toHaveBeenCalled();
  });

  it("delivers and returns messageId on success", async () => {
    mockGetSmtpDeliveryConfig.mockResolvedValueOnce({
      host: "smtp.test",
      port: 587,
      secure: false,
      username: "u",
      password: "p",
      fromAddress: "n@x.com",
      fromName: "Nora",
    });
    const result = await mailer.sendMail({
      to: "a@b.com",
      subject: "S",
      text: "T",
    });
    expect(result.delivered).toBe(true);
    expect(result.messageId).toBe("msg-1");
    expect(mockCreateTransport).toHaveBeenCalledWith({
      host: "smtp.test",
      port: 587,
      secure: false,
      auth: { user: "u", pass: "p" },
    });
    const sendCall = mockSendMail.mock.calls[0][0];
    expect(sendCall.from).toMatch(/<n@x\.com>/);
    expect(sendCall.to).toBe("a@b.com");
    expect(sendCall.subject).toBe("S");
  });

  it("port 465 forces secure=true", async () => {
    mockGetSmtpDeliveryConfig.mockResolvedValueOnce({
      host: "smtp.test",
      port: 465,
      secure: false, // admin set false but 465 should override
      fromAddress: "n@x.com",
      fromName: "Nora",
    });
    await mailer.sendMail({ to: "a@b.com", subject: "S", text: "T" });
    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({ port: 465, secure: true }),
    );
  });

  it("never throws when transporter rejects", async () => {
    mockGetSmtpDeliveryConfig.mockResolvedValueOnce({
      host: "smtp.test",
      port: 587,
      fromAddress: "n@x.com",
      fromName: "Nora",
    });
    mockSendMail.mockRejectedValueOnce(new Error("connection refused"));
    const result = await mailer.sendMail({
      to: "a@b.com",
      subject: "S",
      text: "T",
    });
    expect(result).toEqual({ delivered: false, error: "connection refused" });
  });

  it("omits auth when username is empty", async () => {
    mockGetSmtpDeliveryConfig.mockResolvedValueOnce({
      host: "smtp.test",
      port: 25,
      fromAddress: "n@x.com",
      fromName: "Nora",
      username: "",
      password: "",
    });
    await mailer.sendMail({ to: "a@b.com", subject: "S", text: "T" });
    const transportCfg = mockCreateTransport.mock.calls[0][0];
    expect(transportCfg.auth).toBeUndefined();
  });
});

describe("verifyConnection", () => {
  it("returns ok=false when not configured", async () => {
    mockGetSmtpDeliveryConfig.mockResolvedValueOnce(null);
    expect(await mailer.verifyConnection()).toEqual({ ok: false, error: "not_configured" });
  });

  it("returns ok=true on transporter.verify success", async () => {
    mockGetSmtpDeliveryConfig.mockResolvedValueOnce({
      host: "smtp.test",
      port: 587,
      fromAddress: "n@x.com",
      fromName: "Nora",
    });
    expect(await mailer.verifyConnection()).toEqual({ ok: true });
  });

  it("never throws on verify failure", async () => {
    mockGetSmtpDeliveryConfig.mockResolvedValueOnce({
      host: "smtp.test",
      port: 587,
      fromAddress: "n@x.com",
      fromName: "Nora",
    });
    mockVerify.mockRejectedValueOnce(new Error("auth failed"));
    expect(await mailer.verifyConnection()).toEqual({ ok: false, error: "auth failed" });
  });
});
