/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createType('token_update_mode', ['standard', 'frozen', 'dynamic']);
  pgm.createTable('update_notifications', {
    token_id: {
      type: 'int',
      notNull: true,
      references: 'tokens',
      onDelete: 'CASCADE',
    },
    update_mode: {
      type: 'token_update_mode',
      default: 'standard',
      notNull: true,
    },
    ttl: {
      type: 'numeric',
    },
    block_height: {
      type: 'int',
      notNull: true,
    },
    index_block_hash: {
      type: 'text',
      notNull: true,
    },
    tx_id: {
      type: 'text',
      notNull: true,
    },
    tx_index: {
      type: 'int',
      notNull: true,
    },
    event_index: {
      type: 'int',
    },
  });
  pgm.createIndex('update_notifications', ['token_id', 'block_height', 'tx_index', 'event_index'], {
    unique: true,
  });
  pgm.createIndex(
    'update_notifications',
    [
      'update_mode',
      'token_id',
      { name: 'block_height', sort: 'DESC' },
      { name: 'tx_index', sort: 'DESC' },
      { name: 'event_index', sort: 'DESC' },
    ],
    { where: "update_mode = 'dynamic'" }
  );
}
