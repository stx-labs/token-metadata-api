/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createType('sip_number', ['sip-009', 'sip-010', 'sip-013']);
  pgm.createTable('smart_contracts', {
    id: {
      type: 'serial',
      primaryKey: true,
    },
    principal: {
      type: 'text',
      notNull: true,
      unique: true,
    },
    sip: {
      type: 'sip_number',
      notNull: true,
    },
    token_count: {
      type: 'numeric',
    },
    fungible_token_name: {
      type: 'text',
    },
    non_fungible_token_name: {
      type: 'text',
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
    tx_id: {
      type: 'text',
      notNull: true,
    },
    tx_index: {
      type: 'int',
      notNull: true,
    },
    created_at: {
      type: 'timestamptz',
      default: pgm.func('(NOW())'),
      notNull: true,
    },
    updated_at: {
      type: 'timestamptz',
    },
  });
  pgm.createIndex('smart_contracts', [{ name: 'block_height', sort: 'DESC' }]);
  pgm.createIndex('smart_contracts', ['index_block_hash']);
}
