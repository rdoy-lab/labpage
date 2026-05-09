import type { NextConfig } from "next";
import { execSync } from "child_process";

function getGitHash(): string {
  if (process.env.NEXT_PUBLIC_GIT_HASH) {
    return process.env.NEXT_PUBLIC_GIT_HASH;
  }
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "unknown";
  }
}

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["dockerode", "ssh2", "@kubernetes/client-node"],
  allowedDevOrigins: ["172.16.10.72", "localhost", "127.0.0.1", "0.0.0.0"],
  env: {
    NEXT_PUBLIC_GIT_HASH: getGitHash(),
    NEXT_PUBLIC_DOCKER_IMAGE_VERSION:
      process.env.NEXT_PUBLIC_DOCKER_IMAGE_VERSION || "dev",
  },
};

export default nextConfig;
