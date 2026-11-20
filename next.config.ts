import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Dev-only "N" button: keep it away from the sidebar's Sign out
  devIndicators: { position: "bottom-right" },
  // Node-only database / SMTP libraries stay out of the bundle
  serverExternalPackages: ["pg", "@prisma/adapter-pg", "nodemailer"],
};

export default nextConfig;
