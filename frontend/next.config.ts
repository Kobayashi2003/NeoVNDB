import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The site is reached through the edge, never on :3000 directly, and Next
  // refuses its dev resources to any origin but its own. Without this the
  // hot-reload socket is turned away, the dev client never finishes starting,
  // and no page hydrates: images load but stay invisible, and the header never
  // learns who is signed in. Development only; a production build ignores it.
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
