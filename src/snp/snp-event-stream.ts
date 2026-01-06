import { parseBoolean, SERVER_VERSION } from '@hirosystems/api-toolkit';
import { logger as defaultLogger } from '@hirosystems/api-toolkit';
import { StacksEventStream, StacksEventStreamType } from '@hirosystems/salt-n-pepper-client';
import { EventEmitter } from 'node:events';
import { SnpBlock, SnpBlockSchema } from './schemas';
import { TypeCompiler } from '@sinclair/typebox/compiler';

const SnpBlockCType = TypeCompiler.Compile(SnpBlockSchema);

export class SnpEventStreamHandler {
  // db: PgWriteStore;
  logger = defaultLogger.child({ name: 'SnpEventStreamHandler' });
  snpClientStream: StacksEventStream;
  redisUrl: string;
  redisStreamPrefix: string | undefined;

  readonly events = new EventEmitter<{
    processedMessage: [{ msgId: string }];
  }>();

  constructor(opts: { redisUrl: string; redisStreamPrefix: string; lastMessageId: string }) {
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

  async handleMsg(messageId: string, timestamp: string, path: string, body: any) {
    this.logger.debug(`Received SNP stream event ${path}, msgId: ${messageId}`);
    if (path !== '/new_block') {
      this.logger.warn(`Unsupported SNP stream event ${path}, skipping...`);
      return;
    }
    if (!SnpBlockCType.Check(body)) {
      throw new Error(`Failed to parse SNP block body: ${body}`);
    }
    const block = body;

    // const response = await this.eventServer.fastifyInstance.inject({
    //   method: 'POST',
    //   url: path,
    //   payload: body,
    // });

    // if (response.statusCode < 200 || response.statusCode > 299) {
    //   const errorMessage = `Failed to process SNP message ${messageId} at path ${path}, status: ${response.statusCode}, body: ${response.body}`;
    //   this.logger.error(errorMessage);
    //   throw new Error(errorMessage);
    // }

    // await this.db.updateLastIngestedSnpRedisMsgId(this.db.sql, messageId);
    await Promise.resolve();
    this.events.emit('processedMessage', { msgId: messageId });
  }

  async stop(): Promise<void> {
    await this.snpClientStream.stop();
  }
}
