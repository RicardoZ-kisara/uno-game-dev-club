import type { NextConfig } from "next";
import {resolve} from 'node:path';

const nextConfig: NextConfig = {
  // npm's Node deployment is separate from Vinext/Workers and their output.
  distDir: '.next-node',
  poweredByHeader: false,
  webpack(config,{webpack}) {
    config.plugins.push(new webpack.NormalModuleReplacementPlugin(/^@uno\/runtime$/,resolve('db/runtime.node.ts')));
    return config;
  },
};

export default nextConfig;
