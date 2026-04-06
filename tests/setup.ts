import type { DockerTestContainerConfig } from '@stacks/api-test-toolkit';
import { dockerTestUp, dockerTestDown } from '@stacks/api-test-toolkit';

function defaultContainers(): DockerTestContainerConfig[] {
  const postgres: DockerTestContainerConfig = {
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
    await dockerTestUp({ config });
  }
  process.stdout.write(`[testenv:metadata-api] all containers ready\n`);
}

export async function globalTeardown() {
  const containers = defaultContainers();
  for (const config of [...containers].reverse()) {
    await dockerTestDown({ config });
  }
  process.stdout.write(`[testenv:metadata-api] all containers removed\n`);
}
