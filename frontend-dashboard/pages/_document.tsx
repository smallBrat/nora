import Document, { Head, Html, Main, NextScript, type DocumentContext } from "next/document";
import { DEFAULT_LOCALE, normalizeLocale } from "../lib/i18n";

export default class DashboardDocument extends Document {
  static async getInitialProps(ctx: DocumentContext) {
    return Document.getInitialProps(ctx);
  }

  render() {
    const locale = normalizeLocale(this.props.locale || DEFAULT_LOCALE);
    return (
      <Html lang={locale}>
        <Head>
          {/* Paths include the app basePath (/app); Next does not auto-prefix <link href>. */}
          <link rel="icon" href="/app/favicon.ico" sizes="any" />
          <link rel="icon" type="image/png" sizes="32x32" href="/app/favicon-32x32.png" />
          <link rel="icon" type="image/png" sizes="16x16" href="/app/favicon-16x16.png" />
          <link rel="apple-touch-icon" href="/app/apple-touch-icon.png" />
          <meta name="theme-color" content="#071018" />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}
