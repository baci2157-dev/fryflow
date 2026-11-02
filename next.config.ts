import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: [
    "https://preview-chat-7c3d43ce-af1f-43a2-a8d7-b878a0612e8f.space-z.ai",
    "https://*.space-z.ai",
  ],
};

export default nextConfig;
