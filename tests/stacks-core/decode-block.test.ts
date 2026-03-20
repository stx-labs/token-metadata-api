import { strict as assert } from 'node:assert';
import * as path from 'path';
import * as fs from 'fs';
import { NewBlockMessage } from '@stacks/node-publisher-client';
import { decodeStacksCoreBlock } from '../../src/stacks-core/stacks-core-block-processor';
import { describe, test } from 'node:test';

describe('decode block', () => {
  test('decodes stacks 2.x block with burnchain op tx', () => {
    const blockMessage = JSON.parse(
      fs.readFileSync(path.join(__dirname, 'fixtures', 'block-120.json'), 'utf8')
    ) as NewBlockMessage;

    const block = decodeStacksCoreBlock(blockMessage);

    assert.partialDeepStrictEqual(block, {
      block_height: 120,
      index_block_hash: '0x5829b98300cee6369f79d09665608e081098b83a838f79b7f433c534bddb23d0',
      parent_index_block_hash: '0x93e3711d8266a42875e1ea4b5482a76d026de88a0f9858604da2906c19f74d03',
    });
    assert.strictEqual(block.transactions.length, 2);
    assert.deepStrictEqual(
      block.transactions.map(tx => tx.tx.tx_index),
      [1, 2]
    );
    assert.deepStrictEqual(
      block.transactions.map(tx => tx.tx.txid),
      [
        '0x4ad2f9ef1e0d0cbd368a762074ab42bdbf908cd6f614e83f4ebb1ee6a6622f3e',
        '0xa00bb953a2d6c1249ada32233973d21ff6ef00e9b4a7d199fb3edf28b4fdde57',
      ]
    );
    assert.deepStrictEqual(block.transactions[0].events, []);
    assert.deepStrictEqual(
      block.transactions[1].events.map(event => event.event_index),
      [1]
    );
  });
});
