// batch.js

require('dotenv').config();
const Sheets = require('./lib/sheets');
const Bland  = require('./lib/bland');
const pino   = require('pino');
const logger = pino();

/**
 * Main batch function: reads pending rows, enqueues calls, and writes back status.
 * @returns {Promise<number>} number of rows processed
 */
async function runBatch() {
  try {
    const rows = await Sheets.readRows();
    // filter only rows not yet successfully queued
    const pending = rows.filter(r => r.status !== 'success: Call successfully queued.');
    if (pending.length === 0) {
      logger.info('runBatch: no pending rows');
      return 0;
    }

    let processed = 0;
    for (const row of pending) {
      const { rowNumber } = row;
      try {
        const result    = await Bland.enqueueCall(row);
        const callId    = result.call_id   || 'N/A';
        const statusMsg = `${result.status}: ${result.message || 'Call successfully queued'}`;
        const voiceId   = result.voiceId   || result._voiceId || 'N/A';

        await Sheets.updateQueueResult(rowNumber, statusMsg, callId, voiceId);
        logger.info({ rowNumber, callId, voiceId }, 'enqueued call');
        processed++;
        // small back‐off
        await new Promise(r => setTimeout(r, 200));
      } catch (err) {
        const errorMsg = `error: ${err.message}`;
        await Sheets.updateQueueResult(rowNumber, errorMsg, 'N/A', 'N/A');
        logger.error({ rowNumber, err }, 'Failed to enqueue call');
      }
    }

    logger.info(`runBatch: processed ${processed} rows`);
    return processed;
  } catch (err) {
    logger.error({ err }, 'runBatch failed');
    throw err;
  }
}

// allow standalone invocation
if (require.main === module) {
  runBatch()
    .catch(err => {
      console.error('Batch job failed:', err);
      process.exit(1);
    });
}

module.exports = runBatch;