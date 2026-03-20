import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('metadata_attributes', {
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
    trait_type: {
      type: 'text',
      notNull: true,
    },
    value: {
      type: 'jsonb',
      notNull: true,
    },
    display_type: {
      type: 'text',
    },
  });
  pgm.createIndex('metadata_attributes', ['metadata_id']);
}
