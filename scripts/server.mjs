// Lists or stops the Vite servers (`npm run dev` and `npm run serve`) running
// from this folder. Several agents can work here at once, so they check for a
// running server before starting one, and stop only the server they started.
//
//   npm run server:status -- [dev|preview] [--wait]
//   npm run server:stop -- [dev|preview|<pid>]
//
// Needs lsof and ps (macOS and Linux).

import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = realpathSync(fileURLToPath(new URL('..', import.meta.url)));

/** Runs a command and returns its output. lsof exits 1 when nothing matches, so failures return ''. */
function output(command, args) {
  try {
    return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (error) {
    return error.stdout ?? '';
  }
}

/** Runs lsof and groups its `-F` output by process: the pid and the names (addresses or paths). */
function lsof(args) {
  const records = [];
  for (const line of output('lsof', [...args, '-Fpn']).split('\n')) {
    if (line.startsWith('p')) records.push({ pid: Number(line.slice(1)), names: [] });
    else if (line.startsWith('n')) records.at(-1)?.names.push(line.slice(1));
  }
  return records;
}

/** 'dev' or 'preview' if the command line runs a Vite server, otherwise undefined. */
function viteKind(command) {
  const args = command.split(/\s+/);
  const index = args.findIndex((arg) => /(^|\/)vite(\.js)?$/.test(arg));
  if (index === -1) return undefined;
  const next = args[index + 1];
  if (next === 'preview') return 'preview';
  if (next === undefined || next.startsWith('-') || next === 'dev' || next === 'serve') return 'dev';
  return undefined;
}

/** This project's running Vite servers, optionally only those of one kind. */
function findServers(kind) {
  const commands = new Map(
    output('ps', ['-Ao', 'pid=,command='])
      .split('\n')
      .flatMap((line) => {
        const match = /^\s*(\d+)\s+(.*)$/.exec(line);
        return match ? [[Number(match[1]), match[2]]] : [];
      }),
  );
  const servers = [];
  for (const { pid, names } of lsof(['-nP', '-iTCP', '-sTCP:LISTEN'])) {
    const serverKind = viteKind(commands.get(pid) ?? '');
    if (!serverKind || (kind && serverKind !== kind)) continue;
    const cwd = lsof(['-a', '-p', String(pid), '-d', 'cwd'])[0]?.names[0];
    if (cwd !== root) continue;
    const port = Math.min(...names.map((name) => Number(name.slice(name.lastIndexOf(':') + 1))));
    servers.push({ kind: serverKind, pid, url: `http://localhost:${port}` });
  }
  return servers;
}

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const describe = (server) => `${server.kind} server at ${server.url} (pid ${server.pid})`;

const [command, ...args] = process.argv.slice(2);
const kind = args.find((arg) => arg === 'dev' || arg === 'preview');
const noServer = `No ${kind ?? 'Vite'} server is running for this project.`;

if (command === 'status') {
  let servers = findServers(kind);
  const deadline = Date.now() + 30_000;
  while (servers.length === 0 && args.includes('--wait') && Date.now() < deadline) {
    await sleep(500);
    servers = findServers(kind);
  }
  if (servers.length === 0) {
    console.log(noServer);
    process.exitCode = 1;
  }
  for (const server of servers) console.log(describe(server));
} else if (command === 'stop') {
  const pid = args.find((arg) => /^\d+$/.test(arg));
  const servers = findServers(kind).filter((server) => !pid || server.pid === Number(pid));
  if (servers.length === 0) {
    console.log(pid ? `No server for this project has pid ${pid}.` : noServer);
    process.exitCode = 1;
  }
  for (const server of servers) {
    process.kill(server.pid, 'SIGTERM');
    for (let i = 0; i < 25 && isRunning(server.pid); i++) await sleep(200);
    if (isRunning(server.pid)) process.kill(server.pid, 'SIGKILL');
    console.log(`Stopped the ${describe(server)}.`);
  }
} else {
  console.error(
    'Usage: npm run server:status -- [dev|preview] [--wait]\n' +
      '       npm run server:stop -- [dev|preview|<pid>]',
  );
  process.exitCode = 2;
}
