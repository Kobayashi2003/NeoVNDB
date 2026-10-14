/** Starts a user service of its own on the test database, so signed-in tests
 *  never touch real accounts. Without NEOVNDB_USERS_TEST_DB_URL those tests
 *  skip; everything else still runs. */
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const USERS_PORT = 5199;
export const STATE = join(tmpdir(), 'neovndb-e2e-users.json');

export default async function setup() {
  const db = process.env.NEOVNDB_USERS_TEST_DB_URL;
  if (!db) return;
  // The same guard as the store tests: only a database meant to be emptied.
  if (!new URL(db).pathname.endsWith('_test')) {
    throw new Error('NEOVNDB_USERS_TEST_DB_URL must name a database ending in _test');
  }

  // Built rather than `go run`, which would leave the real server behind when
  // the wrapper is stopped.
  const users = join(__dirname, '../../../backend/users');
  const exe = join(
    mkdtempSync(join(tmpdir(), 'neovndb-e2e-')),
    process.platform === 'win32' ? 'users.exe' : 'users',
  );
  execFileSync('go', ['build', '-o', exe, './cmd/users'], { cwd: users, stdio: 'inherit' });

  const child = spawn(exe, [], {
    cwd: users,
    env: {
      ...process.env,
      NEOVNDB_USERS_DB_URL: db,
      NEOVNDB_USERS_PORT: String(USERS_PORT),
      NEOVNDB_USERS_BCRYPT_COST: '4',
      NEOVNDB_USERS_SIGNIN_TRIES: '0',
      NEOVNDB_USERS_SIGNUP_TRIES: '0',
    },
    stdio: 'ignore',
    detached: false,
  });
  writeFileSync(STATE, JSON.stringify({ pid: child.pid }));

  const url = `http://127.0.0.1:${USERS_PORT}`;
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${url}/health`)).ok) {
        process.env.E2E_USERS_URL = url;
        // For the `admin` fixture, which grants with the binary's own command.
        process.env.E2E_USERS_EXE = exe;
        return;
      }
    } catch {
      // not up yet
    }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('the throwaway user service did not start');
}
