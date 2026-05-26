import { useEffect } from "react";
import { useI18n } from "../../lib/i18n";

// Legacy bridge path retained for stale OAuth redirects from older deploys.
// Current OAuth routes finish at /auth/oauth/:provider/callback and set the
// HttpOnly Nora session cookie server-side before redirecting into /app.
export default function AuthCallback() {
  const { localizePath, t } = useI18n();
  useEffect(() => {
    window.location.href = localizePath("/login?error=OAuthCallbackExpired");
  }, [localizePath]);

  return (
    <div className="site-shell flex min-h-screen items-center justify-center text-brand-ink">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-cyan border-t-transparent"></div>
        <p className="text-sm font-medium text-slate-600">{t("Signing you in...")}</p>
      </div>
    </div>
  );
}
