import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  i18n: {
    locales: ["en", "es", "fr", "zh-Hans", "zh-Hant"],
    defaultLocale: "en",
    localeDetection: false,
  },
  env: {
    NEXT_PUBLIC_PLATFORM_MODE: process.env.PLATFORM_MODE || "selfhosted",
  },
  turbopack: {
    root: path.resolve(process.cwd(), ".."),
  },
};

export default nextConfig;
