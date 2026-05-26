import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useI18n } from "../lib/i18n";

export default function Marketing404() {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-[#071018] text-white font-sans flex flex-col items-center justify-center">
      <img
        src="/logo-mark.png"
        alt="Nora"
        width={72}
        height={72}
        className="mb-6 h-[72px] w-[72px]"
      />
      <h1 className="text-6xl font-black mb-2">404</h1>
      <p className="text-lg text-slate-400 mb-8">
        {t("This page doesn't exist or has been moved.")}
      </p>
      <Link
        href="/"
        className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-sm font-bold rounded-xl transition-all"
      >
        <ArrowLeft size={16} />
        {t("Back to Home")}
      </Link>
    </div>
  );
}
