import crypto from "node:crypto";
import type { GetServerSidePropsContext } from "next";

const API_INTERNAL = process.env.API_INTERNAL_URL || "http://backend-api:4000";
const OAUTH_STATE_COOKIE = "nora_oauth_state";
const AUTH_COOKIE = "nora_auth";
const OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;
const AUTH_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export const SUPPORTED_OAUTH_PROVIDERS = new Set(["google", "github"]);

type OAuthProvider = "google" | "github";

function normalizeProvider(value: unknown): OAuthProvider | null {
  const provider = typeof value === "string" ? value.toLowerCase() : "";
  return SUPPORTED_OAUTH_PROVIDERS.has(provider) ? (provider as OAuthProvider) : null;
}

function isSecureRequest(ctx: GetServerSidePropsContext) {
  const proto = String(ctx.req.headers["x-forwarded-proto"] || "");
  return proto.split(",")[0]?.trim() === "https" || publicBaseUrl(ctx).startsWith("https://");
}

function cookieFlags(ctx: GetServerSidePropsContext, maxAge: number) {
  return [
    "HttpOnly",
    "SameSite=Lax",
    "Path=/",
    `Max-Age=${maxAge}`,
    isSecureRequest(ctx) ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

function setCookie(ctx: GetServerSidePropsContext, name: string, value: string, maxAge: number) {
  const serialized = `${name}=${encodeURIComponent(value)}; ${cookieFlags(ctx, maxAge)}`;
  const current = ctx.res.getHeader("Set-Cookie");
  const next = Array.isArray(current)
    ? [...current, serialized]
    : current
      ? [String(current), serialized]
      : [serialized];
  ctx.res.setHeader("Set-Cookie", next);
}

function clearCookie(ctx: GetServerSidePropsContext, name: string) {
  setCookie(ctx, name, "", 0);
}

function readCookies(ctx: GetServerSidePropsContext) {
  return String(ctx.req.headers.cookie || "")
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((cookies, entry) => {
      const separator = entry.indexOf("=");
      if (separator === -1) return cookies;
      const key = entry.slice(0, separator).trim();
      const raw = entry.slice(separator + 1).trim();
      try {
        cookies[key] = decodeURIComponent(raw);
      } catch {
        cookies[key] = raw;
      }
      return cookies;
    }, {});
}

function publicBaseUrl(ctx: GetServerSidePropsContext) {
  const configured = process.env.NEXTAUTH_URL || process.env.NORA_PUBLIC_URL;
  if (configured) return configured.replace(/\/+$/, "");

  const proto =
    String(ctx.req.headers["x-forwarded-proto"] || "http")
      .split(",")[0]
      ?.trim() || "http";
  const host = String(
    ctx.req.headers["x-forwarded-host"] || ctx.req.headers.host || "localhost:8080",
  )
    .split(",")[0]
    ?.trim();
  return `${proto}://${host}`;
}

function redirectUri(ctx: GetServerSidePropsContext, provider: OAuthProvider) {
  return `${publicBaseUrl(ctx)}/auth/oauth/${provider}/callback`;
}

function oauthClientConfig(provider: OAuthProvider) {
  if (provider === "google") {
    return {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    };
  }
  return {
    clientId: process.env.GITHUB_CLIENT_ID || "",
    clientSecret: process.env.GITHUB_CLIENT_SECRET || "",
  };
}

export function startOAuthRedirect(ctx: GetServerSidePropsContext) {
  const provider = normalizeProvider(ctx.params?.provider);
  if (!provider || process.env.OAUTH_LOGIN_ENABLED !== "true") {
    return { redirect: { destination: "/login?error=OAuthDisabled", permanent: false } };
  }

  const { clientId, clientSecret } = oauthClientConfig(provider);
  if (!clientId || !clientSecret) {
    return { redirect: { destination: "/login?error=OAuthMisconfigured", permanent: false } };
  }

  const state = crypto.randomBytes(32).toString("base64url");
  setCookie(ctx, OAUTH_STATE_COOKIE, `${provider}:${state}`, OAUTH_STATE_MAX_AGE_SECONDS);

  if (provider === "google") {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri(ctx, provider));
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", state);
    return { redirect: { destination: url.toString(), permanent: false } };
  }

  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri(ctx, provider));
  url.searchParams.set("scope", "read:user user:email");
  url.searchParams.set("state", state);
  return { redirect: { destination: url.toString(), permanent: false } };
}

async function exchangeOAuthCode(
  ctx: GetServerSidePropsContext,
  provider: OAuthProvider,
  code: string,
) {
  const { clientId, clientSecret } = oauthClientConfig(provider);
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri(ctx, provider),
  });

  if (provider === "google") {
    body.set("grant_type", "authorization_code");
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok)
      throw new Error(data.error_description || data.error || "Google token exchange failed");
    return { accessToken: data.access_token, idToken: data.id_token };
  }

  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json" },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error(data.error_description || data.error || "GitHub token exchange failed");
  }
  return { accessToken: data.access_token, idToken: null };
}

async function backendOAuthLogin(
  provider: OAuthProvider,
  accessToken: string,
  idToken?: string | null,
) {
  const res = await fetch(`${API_INTERNAL}/auth/oauth-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider,
      oauthAccessToken: accessToken,
      oauthIdToken: idToken,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.token) throw new Error(data.error || "OAuth login failed");
  return data.token as string;
}

async function routeAfterLogin(token: string) {
  try {
    const headers = { Authorization: `Bearer ${token}` };
    const [providersRes, agentsRes] = await Promise.all([
      fetch(`${API_INTERNAL}/llm-providers`, { headers }),
      fetch(`${API_INTERNAL}/agents`, { headers }),
    ]);
    const [providers, agents] = await Promise.all([
      providersRes.ok ? providersRes.json() : [],
      agentsRes.ok ? agentsRes.json() : [],
    ]);
    return (Array.isArray(providers) && providers.length > 0) ||
      (Array.isArray(agents) && agents.length > 0)
      ? "/app/dashboard"
      : "/app/getting-started";
  } catch {
    return "/app/dashboard";
  }
}

export async function finishOAuthRedirect(ctx: GetServerSidePropsContext) {
  const provider = normalizeProvider(ctx.params?.provider);
  const state = typeof ctx.query.state === "string" ? ctx.query.state : "";
  const code = typeof ctx.query.code === "string" ? ctx.query.code : "";
  const expectedState = provider ? `${provider}:${state}` : "";
  const storedState = readCookies(ctx)[OAUTH_STATE_COOKIE];
  clearCookie(ctx, OAUTH_STATE_COOKIE);

  if (!provider || !code || !state || storedState !== expectedState) {
    return { redirect: { destination: "/login?error=OAuthState", permanent: false } };
  }

  try {
    const tokens = await exchangeOAuthCode(ctx, provider, code);
    const platformToken = await backendOAuthLogin(provider, tokens.accessToken, tokens.idToken);
    setCookie(ctx, AUTH_COOKIE, platformToken, AUTH_MAX_AGE_SECONDS);
    return { redirect: { destination: await routeAfterLogin(platformToken), permanent: false } };
  } catch (error) {
    console.error(error);
    return { redirect: { destination: "/login?error=OAuth", permanent: false } };
  }
}
