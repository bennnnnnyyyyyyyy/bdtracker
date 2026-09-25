import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // XLSX reads local operator-provided reports on the server; keep its Node file
  // reader external to the server bundle so development and deployment use fs.
  serverExternalPackages: ['xlsx'],
};

export default nextConfig;
