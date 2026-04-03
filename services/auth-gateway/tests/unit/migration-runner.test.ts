import { describe, expect, it } from 'vitest';

import {
  classifyMigrations,
  deriveMigrationVersion,
  hasExplicitTransactionControl,
  parseCliArgs,
} from '../../run-migration.mjs';

describe('run-migration helpers', () => {
  it('derives a stable version from the filename', () => {
    expect(deriveMigrationVersion('017_add_api_key_context.sql')).toBe(
      '017_add_api_key_context'
    );
  });

  it('detects explicit transaction control in migration SQL', () => {
    expect(hasExplicitTransactionControl('BEGIN;\nCREATE TABLE test(id int);\nCOMMIT;')).toBe(
      true
    );
    expect(hasExplicitTransactionControl('CREATE TABLE test(id int);')).toBe(false);
  });

  it('parses status and baseline args', () => {
    expect(parseCliArgs(['--status']).mode).toBe('status');

    expect(
      parseCliArgs([
        '--baseline',
        '003_create_api_keys_table.sql,006_api_key_management_service.sql',
        '--applied-by',
        'vps-baseline',
      ])
    ).toMatchObject({
      mode: 'baseline',
      baselineFilenames: [
        '003_create_api_keys_table.sql',
        '006_api_key_management_service.sql',
      ],
      appliedBy: 'vps-baseline',
    });
  });

  it('rejects unknown args', () => {
    expect(() => parseCliArgs(['--wat'])).toThrow('Unknown argument: --wat');
  });

  it('classifies pending, applied, and drifted migrations by checksum', () => {
    const migrations = [
      {
        version: '001_init',
        filename: '001_init.sql',
        checksum: 'aaa',
      },
      {
        version: '002_second',
        filename: '002_second.sql',
        checksum: 'bbb',
      },
      {
        version: '003_third',
        filename: '003_third.sql',
        checksum: 'ccc',
      },
    ];

    const appliedRows = [
      {
        version: '001_init',
        filename: '001_init.sql',
        checksum: 'aaa',
      },
      {
        version: '002_second',
        filename: '002_second.sql',
        checksum: 'stale',
      },
    ];

    const summary = classifyMigrations(migrations, appliedRows);

    expect(summary.applied).toHaveLength(1);
    expect(summary.drift).toHaveLength(1);
    expect(summary.pending).toHaveLength(1);
    expect(summary.pending[0]?.filename).toBe('003_third.sql');
    expect(summary.drift[0]?.migration.filename).toBe('002_second.sql');
  });
});
