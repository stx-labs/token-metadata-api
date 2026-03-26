import type { ContainerConfig } from './docker-container.ts';
import { runDown, runUp } from './docker-container.ts';

function defaultContainers(): ContainerConfig[] {
  const postgres: ContainerConfig = {
    image: 'postgres:17',
    name: `metadata-api-test-postgres`,
    ports: [{ host: 5432, container: 5432 }],
    env: [
      'POSTGRES_USER=postgres',
      'POSTGRES_PASSWORD=postgres',
      'POSTGRES_DB=postgres',
    ],
    // waitPort: 5432,
    healthcheck: 'pg_isready -U postgres',
  };
  return [postgres];
}

export async function globalSetup() {
  const containers = defaultContainers();
  for (const config of containers) {
    await runUp(config);
  }
  process.stdout.write(`[testenv:metadata-api] all containers ready\n`);
}

export async function globalTeardown() {
  const containers = defaultContainers();
  for (const config of [...containers].reverse()) {
    await runDown(config);
  }
  process.stdout.write(`[testenv:metadata-api] all containers removed\n`);
}
