import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async redirects() {
    return [
      { source: "/console", destination: "/account", permanent: false },
      { source: "/console/keys", destination: "/account/keys", permanent: false },
      { source: "/console/usage", destination: "/account/usage", permanent: false },
      { source: "/console/wallet", destination: "/account/wallet", permanent: false },
      { source: "/console/api", destination: "/account/api", permanent: false },
      { source: "/console/team", destination: "/account/team", permanent: false },
      { source: "/console/personalization", destination: "/account/personalization", permanent: false },
      { source: "/community", destination: "/account/community", permanent: false },
    ];
  },
  /**
   * Enables React <ViewTransition> during App Router navigations.
   * @see https://nextjs.org/docs/app/guides/view-transitions
   */
  experimental: {
    viewTransition: true,
  },
};

export default nextConfig;
