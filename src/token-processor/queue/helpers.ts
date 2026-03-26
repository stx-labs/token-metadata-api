import { ENV } from '../../env.js';

export enum JobQueueProcessingMode {
  /**
   * If a recoverable processing error occurs, we'll try again until the max retry attempt is
   * reached. See `.env`
   **/
  default,
  /** If a recoverable processing error occurs, we'll try again indefinitely. */
  strict,
}

/**
 * Determines the queue processing mode based on .env values.
 * @returns JobQueueProcessingMode
 */
export function getJobQueueProcessingMode(): JobQueueProcessingMode {
  if (ENV.JOB_QUEUE_STRICT_MODE) {
    return JobQueueProcessingMode.strict;
  }
  return JobQueueProcessingMode.default;
}
