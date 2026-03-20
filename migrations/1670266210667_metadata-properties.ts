import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('metadata_properties', {
    id: {
      type: 'serial',
      primaryKey: true,
    },
    metadata_id: {
      type: 'int',
      notNull: true,
      references: 'metadata',
      onDelete: 'CASCADE',
    },
    name: {
      type: 'text',
      notNull: true,
    },
    value: {
      type: 'jsonb',
      notNull: true,
    },
  });
  pgm.createIndex('metadata_properties', ['metadata_id']);
}
