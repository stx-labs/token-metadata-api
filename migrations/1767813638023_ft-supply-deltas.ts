import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('ft_supply_deltas', {
    token_id: {
      type: 'int',
      references: 'tokens',
      onDelete: 'CASCADE',
    },
    block_height: {
      type: 'int',
      notNull: true,
    },
    index_block_hash: {
      type: 'text',
      notNull: true,
      references: 'blocks',
      onDelete: 'CASCADE',
    },
    canonical: {
      type: 'boolean',
      notNull: true,
      default: true,
    },
    delta: {
      type: 'numeric',
      notNull: true,
    },
  });
}
