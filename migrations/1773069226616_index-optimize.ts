import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.dropIndex('metadata', ['token_id']);
  pgm.dropIndex('rate_limited_hosts', ['hostname']);
  pgm.dropIndex('tokens', ['smart_contract_id']);

  pgm.createIndex('blocks', [{ name: 'block_height', sort: 'DESC' }], {
    where: 'canonical = true',
  });
  pgm.createIndex('tokens', ['type'], { where: 'canonical = true' });
}

export function down(pgm: MigrationBuilder): void {
  pgm.createIndex('metadata', ['token_id']);
  pgm.createIndex('rate_limited_hosts', ['hostname']);
  pgm.createIndex('tokens', ['smart_contract_id']);

  pgm.dropIndex('blocks', [{ name: 'block_height', sort: 'DESC' }]);
  pgm.dropIndex('tokens', ['type']);
}
