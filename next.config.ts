import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Node-only database drivers stay out of the bundle
  serverExternalPackages: ["pg", "@prisma/adapter-pg"],
};

export default nextConfig;
