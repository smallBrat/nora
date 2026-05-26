// Privacy-light analytics (Plausible).
//
// Fully opt-in: every export below no-ops unless NEXT_PUBLIC_ANALYTICS_DOMAIN is
// set at build time, so self-hosted deployments ship zero tracking by default.
// NEXT_PUBLIC_ANALYTICS_SRC lets operators point at a self-hosted Plausible
// instance instead of the hosted plausible.io script.

export const ANALYTICS_DOMAIN = process.env.NEXT_PUBLIC_ANALYTICS_DOMAIN || "";
export const ANALYTICS_SRC =
  process.env.NEXT_PUBLIC_ANALYTICS_SRC || "https://plausible.io/js/script.js";
export const ANALYTICS_ENABLED = Boolean(ANALYTICS_DOMAIN);

type AnalyticsProps = Record<string, string | number | boolean>;

declare global {
  interface Window {
    plausible?: (event: string, options?: { props?: AnalyticsProps }) => void;
  }
}

/**
 * Fire a custom analytics event. Safe to call anywhere — it silently no-ops on
 * the server or when analytics is disabled / the script hasn't loaded.
 */
export function trackEvent(event: string, props?: AnalyticsProps): void {
  if (typeof window === "undefined" || typeof window.plausible !== "function") return;
  window.plausible(event, props ? { props } : undefined);
}
