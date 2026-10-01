import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // node:sqlite 是 Node 内置模块，交给 Node 运行时直接加载，不参与打包
  serverExternalPackages: ["node:sqlite"],
};

export default nextConfig;
