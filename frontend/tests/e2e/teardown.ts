import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { STATE } from './setup';

export default async function teardown() {
  if (!existsSync(STATE)) return;
  const { pids, dirs = [] } = JSON.parse(readFileSync(STATE, 'utf8')) as {
    pids: number[];
    dirs?: string[];
  };
  for (const pid of pids) {
    try {
      // The whole tree on Windows: a command found through a shim (Chocolatey's
      // caddy) runs as the shim's child, which outlived the shim and held its
      // port into every later run.
      if (process.platform === 'win32') {
        execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        process.kill(pid);
      }
    } catch {
      // already gone
    }
  }
  // After the processes: Windows keeps a running binary's file. The retries
  // cover the moment it takes to let go once killed.
  for (const dir of dirs) {
    try {
      rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch (err) {
      console.warn(`could not remove ${dir}: ${String(err)}`);
    }
  }
  rmSync(STATE);
}
