/* eslint-disable @typescript-eslint/no-unsafe-return */
import { strict as assert } from 'node:assert';
import * as net from 'node:net';
import Docker from 'dockerode';

const IMAGE = 'postgres:17';
const CONTAINER_NAME = 'token-metadata-api-test-postgres';
const HOST = '127.0.0.1';
const PORT = 5432;
const USER = 'postgres';
const PASSWORD = 'postgres';
const DATABASE = 'postgres';
const STARTUP_TIMEOUT_MS = 120_000;

function createDockerClient(): Docker {
  if (process.env.DOCKER_HOST) {
    const dockerHost = new URL(process.env.DOCKER_HOST);
    return new Docker({
      host: dockerHost.hostname,
      port: Number(dockerHost.port),
      protocol: dockerHost.protocol.replace(':', '') as 'http' | 'https' | 'ssh',
    });
  }
  return new Docker({ socketPath: process.env.DOCKER_SOCKET_PATH ?? '/var/run/docker.sock' });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function streamToPromise(stream: NodeJS.ReadableStream): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.on('end', () => resolve());
    stream.on('error', reject);
  });
}

async function pullImageIfMissing(docker: Docker): Promise<void> {
  const images = (await docker.listImages()) as { RepoTags?: string[] }[];
  const hasImage = images.some(image => image.RepoTags?.includes(IMAGE));
  if (hasImage) return;

  process.stdout.write(`[testenv] pulling image ${IMAGE}\n`);
  const stream = await docker.pull(IMAGE);
  await new Promise<void>((resolve, reject) => {
    docker.modem.followProgress(stream, err => {
      if (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      resolve();
    });
  });
}

async function getContainer(docker: Docker) {
  const containers = await docker.listContainers({
    all: true,
    filters: { name: [CONTAINER_NAME] },
  });
  if (containers.length === 0) return undefined;
  const [containerInfo] = containers;
  assert.ok(containerInfo.Id);
  return docker.getContainer(containerInfo.Id);
}

async function ensureContainerRunning(docker: Docker) {
  const existing = await getContainer(docker);
  if (existing) {
    const inspect = await existing.inspect();
    if (!inspect.State.Running) {
      process.stdout.write(`[testenv] starting existing container ${CONTAINER_NAME}\n`);
      await existing.start();
    } else {
      process.stdout.write(`[testenv] container ${CONTAINER_NAME} already running\n`);
    }
    return existing;
  }

  process.stdout.write(`[testenv] creating container ${CONTAINER_NAME}\n`);
  const container = await docker.createContainer({
    name: CONTAINER_NAME,
    Image: IMAGE,
    Env: [
      `POSTGRES_USER=${USER}`,
      `POSTGRES_PASSWORD=${PASSWORD}`,
      `POSTGRES_DB=${DATABASE}`,
      `POSTGRES_PORT=${PORT}`,
    ],
    ExposedPorts: {
      '5432/tcp': {},
    },
    HostConfig: {
      PortBindings: {
        '5432/tcp': [{ HostPort: String(PORT), HostIp: HOST }],
      },
      AutoRemove: false,
    },
    Labels: {
      'com.hiro.token-metadata-api.testenv': 'postgres',
    },
    Healthcheck: {
      Test: ['CMD-SHELL', `pg_isready -U ${USER} -d ${DATABASE}`],
      Interval: 2_000_000_000,
      Timeout: 2_000_000_000,
      Retries: 30,
      StartPeriod: 2_000_000_000,
    },
  });
  await container.start();
  return container;
}

async function waitForPort(): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < STARTUP_TIMEOUT_MS) {
    const ok = await new Promise<boolean>(resolve => {
      const socket = net.createConnection(PORT, HOST);
      socket.setTimeout(1_000);
      socket.on('connect', () => {
        socket.end();
        resolve(true);
      });
      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      socket.on('error', () => resolve(false));
    });
    if (ok) return;
    await sleep(500);
  }
  throw new Error(`timed out waiting for postgres on ${HOST}:${PORT}`);
}

export async function runUp(): Promise<void> {
  const docker = createDockerClient();
  await pullImageIfMissing(docker);
  await ensureContainerRunning(docker);
  await waitForPort();
  process.stdout.write(`[testenv] postgres ready on ${HOST}:${PORT}\n`);
}

export async function runDown(): Promise<void> {
  const docker = createDockerClient();
  const container = await getContainer(docker);
  if (!container) {
    process.stdout.write(`[testenv] container ${CONTAINER_NAME} is already absent\n`);
    return;
  }
  const inspect = await container.inspect();
  if (inspect.State.Running) {
    process.stdout.write(`[testenv] stopping ${CONTAINER_NAME}\n`);
    await container.stop({ t: 0 });
  }
  process.stdout.write(`[testenv] removing ${CONTAINER_NAME}\n`);
  await container.remove({ force: true, v: true });
}

async function runLogs(argv: string[]): Promise<void> {
  const follow = argv.includes('-f') || argv.includes('--follow') || !argv.includes('--once');
  const docker = createDockerClient();
  const container = await getContainer(docker);
  if (!container) {
    throw new Error(`container ${CONTAINER_NAME} not found`);
  }
  if (follow) {
    const logStream = await container.logs({
      stdout: true,
      stderr: true,
      follow: true,
      timestamps: true,
      tail: 200,
    });
    container.modem.demuxStream(logStream, process.stdout, process.stderr);
    await streamToPromise(logStream);
    return;
  }
  const output = await container.logs({
    stdout: true,
    stderr: true,
    follow: false,
    timestamps: true,
    tail: 200,
  });
  process.stdout.write(output.toString('utf8'));
}

async function main(): Promise<void> {
  const [command = 'up', ...args] = process.argv.slice(2);
  if (command === 'up') {
    await runUp();
    return;
  }
  if (command === 'down') {
    await runDown();
    return;
  }
  if (command === 'logs') {
    await runLogs(args);
    return;
  }
  throw new Error(`unsupported command: ${command}`);
}

// Only run CLI when invoked directly (not when loaded via --import)
if (process.argv[1]?.includes('setup.ts') || process.argv[1]?.includes('setup.js')) {
  void main().catch(error => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[testenv] ${message}\n`);
    process.exitCode = 1;
  });
}
