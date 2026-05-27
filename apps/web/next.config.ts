import type { NextConfig } from "next";

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

export default nextConfig;
