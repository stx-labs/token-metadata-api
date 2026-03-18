import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('rate_limited_hosts', {
    id: {
      type: 'serial',
      primaryKey: true,
    },
    hostname: {
      type: 'text',
      notNull: true,
      unique: true,
    },
    created_at: {
      type: 'timestamptz',
      default: pgm.func('(NOW())'),
      notNull: true,
    },
    retry_after: {
      type: 'timestamptz',
      notNull: true,
    },
  });
  pgm.createIndex('rate_limited_hosts', ['hostname']);
}
