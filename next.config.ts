import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /**
   * Enables React <ViewTransition> during App Router navigations.
   * @see https://nextjs.org/docs/app/guides/view-transitions
   */
  experimental: {
    viewTransition: true,
  },
};

export default nextConfig;
