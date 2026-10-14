import { existsSync, readFileSync, rmSync } from 'node:fs';
import { STATE } from './setup';

export default async function teardown() {
  if (!existsSync(STATE)) return;
  const { pid } = JSON.parse(readFileSync(STATE, 'utf8')) as { pid: number };
  try {
    process.kill(pid);
  } catch {
    // already gone
  }
  rmSync(STATE);
}
