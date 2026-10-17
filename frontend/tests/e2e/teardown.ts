import { existsSync, readFileSync, rmSync } from 'node:fs';
import { STATE } from './setup';

export default async function teardown() {
  if (!existsSync(STATE)) return;
  const { pids } = JSON.parse(readFileSync(STATE, 'utf8')) as { pids: number[] };
  for (const pid of pids) {
    try {
      process.kill(pid);
    } catch {
      // already gone
    }
  }
  rmSync(STATE);
}
