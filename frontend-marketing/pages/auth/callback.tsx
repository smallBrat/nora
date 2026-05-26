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
    <div className="min-h-screen bg-[#071018] text-white flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm text-slate-400 font-medium">{t("Signing you in...")}</p>
      </div>
    </div>
  );
}
