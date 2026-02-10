/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createTable('blocks', {
    index_block_hash: {
      type: 'text',
      primaryKey: true,
    },
    parent_index_block_hash: {
      type: 'text',
      notNull: true,
    },
    block_height: {
      type: 'int',
      notNull: true,
    },
  });
}
