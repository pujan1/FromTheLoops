import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@fromtheloop/core",
    "@fromtheloop/db",
    "@fromtheloop/search",
    "@fromtheloop/shared",
  ],
  // The workspace packages use NodeNext TS resolution, so internal imports
  // carry `.js` extensions that point at sibling `.ts` files. Webpack's
  // default resolver doesn't do that remap; this teaches it to.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

// withSentryConfig handles source-map upload (needs SENTRY_AUTH_TOKEN at
// build time) and tunneling. org/project come from env; without them the
// build still succeeds (just no source-map upload). `silent` keeps local
// builds quiet but logs in CI.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
});
