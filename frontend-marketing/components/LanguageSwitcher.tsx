import { Globe2 } from "lucide-react";
import { LOCALE_LABELS, LOCALES, type Locale, useI18n } from "../lib/i18n";

export default function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { locale, setLocale } = useI18n();

  function handleChange(nextLocale: Locale) {
    setLocale(nextLocale).catch(() => {});
  }

  return (
    <label
      className={`inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-3 py-2 text-xs font-bold text-slate-200 ${className}`}
    >
      <Globe2 size={14} />
      <span className="sr-only">Language</span>
      <select
        value={locale}
        onChange={(event) => handleChange(event.target.value as Locale)}
        className="bg-transparent text-xs font-bold text-slate-200 outline-none"
        aria-label="Language"
      >
        {LOCALES.map((item) => (
          <option key={item} value={item} className="text-slate-950">
            {LOCALE_LABELS[item]}
          </option>
        ))}
      </select>
    </label>
  );
}
