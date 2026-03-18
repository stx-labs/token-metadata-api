import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createIndex('smart_contracts', ['principal'], {
    where: 'canonical = true',
  });
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropIndex('smart_contracts', ['principal']);
}
