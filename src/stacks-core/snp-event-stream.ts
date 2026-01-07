import { SERVER_VERSION } from '@hirosystems/api-toolkit';
import { logger as defaultLogger } from '@hirosystems/api-toolkit';
import { StacksEventStream, StacksEventStreamType } from '@hirosystems/salt-n-pepper-client';
import { EventEmitter } from 'node:events';
import { StacksCoreBlockSchema } from './schemas';
import { TypeCompiler } from '@sinclair/typebox/compiler';
import { StacksCoreBlockProcessor } from './stacks-core-block-processor';

const SnpBlockCType = TypeCompiler.Compile(StacksCoreBlockSchema);

export class SnpEventStreamHandler {
  private readonly blockProcessor: StacksCoreBlockProcessor;
  private readonly logger = defaultLogger.child({ name: 'SnpEventStreamHandler' });
  private readonly snpClientStream: StacksEventStream;
  private readonly redisUrl: string;
  private readonly redisStreamPrefix: string | undefined;

  readonly events = new EventEmitter<{
    processedMessage: [{ msgId: string }];
  }>();

  constructor(opts: {
    redisUrl: string;
    redisStreamPrefix: string;
    lastMessageId: string;
    blockProcessor: StacksCoreBlockProcessor;
  }) {
    this.blockProcessor = opts.blockProcessor;
    this.redisUrl = opts.redisUrl;
    this.redisStreamPrefix = opts.redisStreamPrefix;

    this.logger.info(`SNP streaming enabled, lastMsgId: ${opts.lastMessageId}`);
    const appName = `token-metadata-api ${SERVER_VERSION.tag} (${SERVER_VERSION.branch}:${SERVER_VERSION.commit})`;

    this.snpClientStream = new StacksEventStream({
      redisUrl: this.redisUrl,
      redisStreamPrefix: this.redisStreamPrefix,
      eventStreamType: StacksEventStreamType.confirmedChainEvents,
      lastMessageId: opts.lastMessageId,
      appName,
    });
  }

  async start() {
    this.logger.info(`Connecting to SNP event stream at ${this.redisUrl} ...`);
    await this.snpClientStream.connect({ waitForReady: true });
    this.snpClientStream.start(async (messageId, timestamp, path, body) => {
      return this.handleMsg(messageId, timestamp, path, body);
    });
  }

  async handleMsg(messageId: string, _timestamp: string, path: string, body: any) {
    this.logger.debug(`Received SNP stream event ${path}, msgId: ${messageId}`);
    if (path !== '/new_block') {
      this.logger.warn(`Unsupported SNP stream event ${path}, skipping...`);
      return;
    }
    if (!SnpBlockCType.Check(body)) {
      throw new Error(`Failed to parse SNP block body: ${body}`);
    }
    try {
      await this.blockProcessor.process(body);
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
