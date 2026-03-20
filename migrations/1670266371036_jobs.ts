import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export function up(pgm: MigrationBuilder): void {
  pgm.createType('job_status', ['pending', 'queued', 'done', 'failed', 'invalid']);
  pgm.createTable('jobs', {
    id: {
      type: 'serial',
      primaryKey: true,
    },
    token_id: {
      type: 'int',
      references: 'tokens',
      onDelete: 'CASCADE',
    },
    token_supply_id: {
      type: 'int',
      references: 'tokens',
      onDelete: 'CASCADE',
    },
    smart_contract_id: {
      type: 'int',
      references: 'smart_contracts',
      onDelete: 'CASCADE',
    },
    status: {
      type: 'job_status',
      default: 'pending',
    },
    retry_count: {
      type: 'int',
      default: 0,
    },
    created_at: {
      type: 'timestamptz',
      default: pgm.func('(NOW())'),
      notNull: true,
    },
    updated_at: {
      type: 'timestamptz',
    },
    invalid_reason: {
      type: 'int',
    },
    retry_after: {
      type: 'timestamptz',
    },
  });
  pgm.createConstraint(
    'jobs',
    'jobs_job_type_check',
    'CHECK (NUM_NONNULLS(token_id, token_supply_id, smart_contract_id) = 1)'
  );

  pgm.createIndex('jobs', ['token_id'], {
    where: 'smart_contract_id IS NULL AND token_supply_id IS NULL',
    unique: true,
  });
  pgm.createIndex('jobs', ['token_supply_id'], {
    where: 'smart_contract_id IS NULL AND token_id IS NULL',
    unique: true,
  });
  pgm.createIndex('jobs', ['smart_contract_id'], {
    where: 'token_id IS NULL AND token_supply_id IS NULL',
    unique: true,
  });

  pgm.createIndex('jobs', ['status'], { name: 'jobs_status_all_index' });
  pgm.createIndex('jobs', ['status'], { where: "status = 'pending'" });
  pgm.createIndex('jobs', ['status', { name: 'updated_at', sort: 'ASC' }], {
    where: "status = 'queued'",
  });
}
