/** Starts what the tests need beside the running site.
 *
 *  With NEOVNDB_USERS_TEST_DB_URL set: a user service of its own on the test
 *  database, so signed-in tests never touch real accounts. Without it those
 *  tests skip; everything else still runs.
 *
 *  With E2E_DEPLOYED set (playwright.deployed.config.mts): a whole second site
 *  configured as a deployment is -- the read API with the ceilings in its
 *  .env.sample instead of the lifted ones a checkout runs with, a production
 *  build of the frontend, and an edge of its own built from the same Caddyfile
 *  -- so the tests show what the limits a deployment sets do to the pages. It
 *  shares the live mirror's database and images, and only reads them. */
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { isAbsolute, join, resolve } from 'node:path';

/** NeoVNDB's slot (project/README.md) is 17030-17039; the tests take the top of it. */
export const USERS_PORT = 17035;
export const DEPLOYED = { edge: 17036, api: 17037, web: 17038 };
export const STATE = join(tmpdir(), 'neovndb-e2e.json');

const ROOT = join(__dirname, '../../..');
const exe = (name: string) => (process.platform === 'win32' ? `${name}.exe` : name);

/** KEY=value lines, comments and blanks skipped; a trailing comment dropped. */
function readEnv(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)=([^#]*)/.exec(line);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

async function answers(url: string): Promise<boolean> {
  try {
    return (await fetch(url)).status < 500;
  } catch {
    return false;
  }
}

async function waitFor(name: string, url: string, tries = 150) {
  for (let i = 0; i < tries; i++) {
    if (await answers(url)) return;
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`${name} did not start (${url})`);
}

/** Whether a command runs at all, for a message that says what to install.
 *  Through the shell, because pnpm on Windows is a .cmd script. */
function onPath(cmd: string, versionArg: string): boolean {
  try {
    execFileSync(cmd, [versionArg], { stdio: 'ignore', shell: true });
    return true;
  } catch {
    return false;
  }
}

/** A port something else holds would answer the readiness checks for a
 *  process that never started -- a run left behind, say -- and the tests would
 *  run against it. */
function free(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const probe = createServer()
      .once('error', () => resolve(false))
      .once('listening', () => probe.close(() => resolve(true)))
      .listen(port, '127.0.0.1');
  });
}

async function prerequisites(deployed: boolean) {
  const tools: [string, string, string][] = [['go', 'version', 'Go, to build the services']];
  if (deployed)
    tools.push(['caddy', 'version', 'Caddy, for the edge'], ['pnpm', '--version', 'pnpm']);
  for (const [cmd, arg, what] of tools) {
    if (!onPath(cmd, arg)) throw new Error(`${cmd} is not on PATH: install ${what}`);
  }
  const ports = deployed ? [USERS_PORT, DEPLOYED.edge, DEPLOYED.api, DEPLOYED.web] : [USERS_PORT];
  for (const port of ports) {
    if (!(await free(port))) {
      throw new Error(`port ${port} is taken: stop what holds it (a run left behind?) and retry`);
    }
  }
}

export default async function setup() {
  const children: ChildProcess[] = [];
  const keep = () =>
    writeFileSync(STATE, JSON.stringify({ pids: children.map(c => c.pid).filter(Boolean) }));
  const start = (cmd: string, args: string[], cwd: string, env: Record<string, string>) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: 'ignore' });
    children.push(child);
    keep();
    return child;
  };
  // Built rather than `go run`, which would leave the real server behind when
  // the wrapper is stopped.
  const bin = mkdtempSync(join(tmpdir(), 'neovndb-e2e-'));
  const build = (dir: string, pkg: string, name: string) => {
    const out = join(bin, exe(name));
    execFileSync('go', ['build', '-o', out, pkg], { cwd: dir, stdio: 'inherit' });
    return out;
  };

  const db = process.env.NEOVNDB_USERS_TEST_DB_URL;
  const deployed = !!process.env.E2E_DEPLOYED;
  if (deployed && !db) {
    throw new Error('the deployment check needs NEOVNDB_USERS_TEST_DB_URL for its user service');
  }
  if (db || deployed) await prerequisites(deployed);

  if (db) {
    // The same guard as the store tests: only a database meant to be emptied.
    if (!new URL(db).pathname.endsWith('_test')) {
      throw new Error('NEOVNDB_USERS_TEST_DB_URL must name a database ending in _test');
    }
    const users = join(ROOT, 'backend/users');
    const usersExe = build(users, './cmd/users', 'users');
    // A deployment's page and list ceilings when checking one. Sign-in and
    // sign-up stay unlimited either way: every test registers an account of
    // its own from this one address, and the limits have tests of their own.
    const sample = readEnv(join(users, '.env.sample'));
    start(usersExe, [], users, {
      ...(deployed
        ? {
            NEOVNDB_USERS_PAGE_SIZE: sample.NEOVNDB_USERS_PAGE_SIZE,
            NEOVNDB_USERS_MAX_PAGE_SIZE: sample.NEOVNDB_USERS_MAX_PAGE_SIZE,
            NEOVNDB_USERS_MAX_ITEMS: sample.NEOVNDB_USERS_MAX_ITEMS,
            NEOVNDB_USERS_MAX_SEARCHES: sample.NEOVNDB_USERS_MAX_SEARCHES,
          }
        : {}),
      NEOVNDB_USERS_DB_URL: db,
      NEOVNDB_USERS_PORT: String(USERS_PORT),
      NEOVNDB_USERS_BCRYPT_COST: '4',
      NEOVNDB_USERS_SIGNIN_TRIES: '0',
      NEOVNDB_USERS_SIGNUP_TRIES: '0',
      NEOVNDB_USERS_BACKUP_EVERY: '0',
    });
    const url = `http://127.0.0.1:${USERS_PORT}`;
    await waitFor('the throwaway user service', `${url}/health`);
    process.env.E2E_USERS_URL = url;
    // For the `admin` fixture, which grants with the binary's own command.
    process.env.E2E_USERS_EXE = usersExe;
  }

  if (!deployed) return;

  // The read API with every ceiling its sample sets; its .env still supplies
  // the database, and a real environment variable outranks the file.
  const vndb = join(ROOT, 'backend/vndb');
  const sample = readEnv(join(vndb, '.env.sample'));
  const ceilings = Object.fromEntries(
    Object.entries(sample).filter(([k]) =>
      /^NEOVNDB_(PAGE_SIZE|MAX_.+|GRAPH_DEPTH|REQUEST_TIMEOUT)$/.test(k),
    ),
  );
  start(build(vndb, './cmd/neovndb', 'neovndb'), ['serve'], vndb, {
    ...ceilings,
    NEOVNDB_PORT: String(DEPLOYED.api),
    // A second process must never import or crawl alongside the real one.
    NEOVNDB_UPDATE_EVERY: '0',
    NEOVNDB_IMAGE_CRAWL_EVERY: '0',
  });

  // A production build, served the way a deployment serves it.
  const web = join(ROOT, 'frontend');
  if (!process.env.E2E_SKIP_BUILD)
    execFileSync('pnpm', ['build'], { cwd: web, stdio: 'inherit', shell: true });
  start(
    process.execPath,
    [require.resolve('next/dist/bin/next'), 'start', '-p', String(DEPLOYED.web)],
    web,
    {
      NEOVNDB_API_BASE: `http://127.0.0.1:${DEPLOYED.edge}/vndbserve`,
    },
  );

  // The edge, from the same Caddyfile, pointed at the above; images come from
  // the running mirror and its store, read-only.
  const vndbEnv = readEnv(join(vndb, '.env'));
  const imageDir = vndbEnv.NEOVNDB_IMAGE_DIR ?? '../../data/images';
  const edge = join(ROOT, 'edge');
  start('caddy', ['run', '--config', 'Caddyfile', '--adapter', 'caddyfile'], edge, {
    // A host in a Caddy site address means https; http:// keeps it plain and
    // on the loopback.
    NEOVNDB_BIND: `http://127.0.0.1:${DEPLOYED.edge}`,
    VNDBSERVE_UPSTREAM: `127.0.0.1:${DEPLOYED.api}`,
    IMGSERVE_UPSTREAM: `127.0.0.1:${vndbEnv.NEOVNDB_IMAGE_PORT ?? '17032'}`,
    USERSERVE_UPSTREAM: `127.0.0.1:${USERS_PORT}`,
    NEXT_UPSTREAM: `127.0.0.1:${DEPLOYED.web}`,
    NEOVNDB_IMAGE_DIR: isAbsolute(imageDir) ? imageDir : resolve(vndb, imageDir),
  });

  const base = `http://127.0.0.1:${DEPLOYED.edge}`;
  await waitFor('the deployment check read API', `http://127.0.0.1:${DEPLOYED.api}/health`);
  await waitFor('the deployment check site', `http://127.0.0.1:${DEPLOYED.web}/`);
  await waitFor('the deployment check edge', `${base}/vndbserve/health`);
}
