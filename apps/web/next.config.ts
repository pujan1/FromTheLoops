import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    "@fromtheloop/core",
    "@fromtheloop/db",
    "@fromtheloop/search",
    "@fromtheloop/shared",
  ],
};

export default nextConfig;
