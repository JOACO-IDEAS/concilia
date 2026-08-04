import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Default es 1MB — insuficiente para un PDF de extracto bancario real
    // (ver src/app/conciliacion/statement-actions.ts, ingesta de extractos).
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
