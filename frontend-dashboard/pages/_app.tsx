import "../styles/globals.css";
import "@xterm/xterm/css/xterm.css";
import { ToastProvider } from "../components/Toast";
import { I18nProvider } from "../lib/i18n";

function MyApp({ Component, pageProps }) {
  return (
    <I18nProvider>
      <ToastProvider>
        <Component {...pageProps} />
      </ToastProvider>
    </I18nProvider>
  );
}

export default MyApp;
