/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.dropIndex('update_notifications', ['token_id', 'block_height', 'tx_index', 'event_index']);
  pgm.createIndex(
    'update_notifications',
    ['token_id', 'index_block_hash', 'tx_index', 'event_index'],
    {
      unique: true,
    }
  );
}

export function down(pgm: MigrationBuilder): void {
  pgm.dropIndex('update_notifications', [
    'token_id',
    'index_block_hash',
    'tx_index',
    'event_index',
  ]);
  pgm.createIndex('update_notifications', ['token_id', 'block_height', 'tx_index', 'event_index'], {
    unique: true,
  });
}
