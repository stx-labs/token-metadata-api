import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('metadata', {
    id: {
      type: 'serial',
      primaryKey: true,
    },
    token_id: {
      type: 'int',
      notNull: true,
      references: 'tokens',
      onDelete: 'CASCADE',
    },
    sip: {
      type: 'int',
      notNull: true,
    },
    name: {
      type: 'text',
      notNull: true,
    },
    l10n_locale: {
      type: 'text',
    },
    l10n_uri: {
      type: 'text',
    },
    l10n_default: {
      type: 'boolean',
    },
    description: {
      type: 'text',
    },
    image: {
      type: 'text',
    },
    cached_image: {
      type: 'text',
    },
    cached_thumbnail_image: {
      type: 'text',
    },
  });
  pgm.createConstraint('metadata', 'metadata_token_id_l10n_locale_unique', {
    unique: ['token_id', 'l10n_locale'],
  });
  pgm.createIndex('metadata', ['token_id']);
  pgm.createIndex('metadata', ['l10n_locale']);
}
