import "../styles/globals.css";
import { ToastProvider } from "../components/Toast";
import { I18nProvider } from "../lib/i18n";

function MyApp({ Component, pageProps: { session, ...pageProps } }) {
  return (
    <I18nProvider>
      <ToastProvider>
        <Component {...pageProps} />
      </ToastProvider>
    </I18nProvider>
  );
}

export default MyApp;
