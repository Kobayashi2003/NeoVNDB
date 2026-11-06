import { networkInterfaces } from 'node:os';
import type { NextConfig } from 'next';

/** Every address of this machine, so another device on the network -- a
 *  phone opening http://192.168.x.y:17030 -- is let in too. */
function ownAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flatMap(list => list ?? [])
    .filter(a => !a.internal)
    .map(a => a.address);
}

const nextConfig: NextConfig = {
  // A build for checking (the deployment e2e, a hand-off) goes beside the one
  // the running site serves: next start reads its build as it goes, and one
  // replaced under it serves pages whose scripts are gone.
  distDir: process.env.NEOVNDB_NEXT_DIR || '.next',
  // The site is reached through the edge, never on :17034 directly, and Next
  // refuses its dev resources to any origin but its own. Without this the
  // hot-reload socket is turned away, the dev client never finishes starting,
  // and no page hydrates: the text arrives from the server, but images stay
  // invisible and nothing that needs the browser -- signing in, lists -- works.
  // NEOVNDB_DEV_ORIGINS adds hosts beyond this machine's own (a name it is
  // reached by, say), comma-separated. Development only; a production build
  // ignores it.
  allowedDevOrigins: [
    '127.0.0.1',
    'localhost',
    ...ownAddresses(),
    ...(process.env.NEOVNDB_DEV_ORIGINS ?? '')
      .split(',')
      .map(h => h.trim())
      .filter(Boolean),
  ],
};

export default nextConfig;
