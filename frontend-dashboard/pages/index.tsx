import { useEffect } from "react";
import { useI18n } from "../lib/i18n";
export default function Home() {
  const { localizePath } = useI18n();
  useEffect(() => {
    window.location.href = localizePath("/app/agents");
  }, [localizePath]);
  return null;
}
