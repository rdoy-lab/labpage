import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["dockerode", "ssh2", "@kubernetes/client-node"],
  allowedDevOrigins: ["172.16.10.72", "localhost", "127.0.0.1", "0.0.0.0"],
};

export default nextConfig;
