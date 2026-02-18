import { SERVER_VERSION } from '@stacks/api-toolkit';
import { logger as defaultLogger } from '@stacks/api-toolkit';
import { EventEmitter } from 'node:events';
import { decodeStacksCoreBlock, StacksCoreBlockProcessor } from './stacks-core-block-processor';
import { StacksMessageStream, MessagePath, Message } from '@stacks/node-publisher-client';
import { PgStore } from '../pg/pg-store';

/**
 * Handles the SNP event stream and processes Stacks Core blocks.
 * This is used to index the Stacks Core blockchain and write blocks to the database.
 */
export class SnpEventStreamHandler {
  private readonly blockProcessor: StacksCoreBlockProcessor;
  private readonly logger = defaultLogger.child({ name: 'SnpEventStreamHandler' });
  private readonly snpClientStream: StacksMessageStream;
  private readonly redisUrl: string;
  private readonly redisStreamPrefix: string | undefined;
  private readonly db: PgStore;

  readonly events = new EventEmitter<{
    processedMessage: [{ msgId: string }];
  }>();

  constructor(opts: {
    redisUrl: string;
    redisStreamPrefix: string | undefined;
    db: PgStore;
    blockProcessor: StacksCoreBlockProcessor;
  }) {
    this.blockProcessor = opts.blockProcessor;
    this.redisUrl = opts.redisUrl;
    this.redisStreamPrefix = opts.redisStreamPrefix;
    this.db = opts.db;

    this.logger.info(`SNP streaming enabled`);
    const appName = `token-metadata-api ${SERVER_VERSION.tag} (${SERVER_VERSION.branch}:${SERVER_VERSION.commit})`;

    this.snpClientStream = new StacksMessageStream({
      appName,
      redisUrl: this.redisUrl,
      redisStreamPrefix: this.redisStreamPrefix,
      options: {
        selectedMessagePaths: [MessagePath.NewBlock],
      },
    });
  }

  async start() {
    this.logger.info(`Connecting to SNP event stream at ${this.redisUrl} ...`);
    await this.snpClientStream.connect({ waitForReady: true });
    this.snpClientStream.start(
      async () => {
        const chainTip = await this.db.getChainTip();
        if (chainTip) {
          this.logger.info(
            `Starting SNP event stream at block ${chainTip.block_height} ${chainTip.index_block_hash}`
          );
          return {
            indexBlockHash: chainTip.index_block_hash,
            blockHeight: chainTip.block_height,
          };
        } else {
          this.logger.info(`No chain tip found, starting SNP event stream at genesis`);
          return null;
        }
      },
      async (messageId, timestamp, message) => {
        return this.handleMsg(messageId, timestamp, message);
      }
    );
  }

  async handleMsg(messageId: string, _timestamp: string, message: Message) {
    this.logger.info(`Received SNP stream event ${message.path}, msgId: ${messageId}`);
    if (message.path !== MessagePath.NewBlock) {
      this.logger.warn(`Unsupported SNP stream event ${message.path}, skipping...`);
      return;
    }
    try {
      const decodedBlock = decodeStacksCoreBlock(message.payload);
      await this.blockProcessor.processBlock(decodedBlock);
      this.events.emit('processedMessage', { msgId: messageId });
    } catch (error) {
      this.logger.error(error, `Failed to process block`);
      throw new Error(`Failed to process block: ${error}`);
    }
  }

  async stop(): Promise<void> {
    await this.snpClientStream.stop();
  }
}

export function buildSnpEventStreamHandler(opts: {
  redisUrl: string;
  redisStreamPrefix: string | undefined;
  db: PgStore;
}) {
  const blockProcessor = new StacksCoreBlockProcessor({ db: opts.db.core });
  return new SnpEventStreamHandler({
    redisUrl: opts.redisUrl,
    redisStreamPrefix: opts.redisStreamPrefix,
    db: opts.db,
    blockProcessor,
  });
}
