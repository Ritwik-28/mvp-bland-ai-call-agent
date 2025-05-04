// batch.js

require('dotenv').config();
const Sheets = require('./lib/sheets');
const Bland  = require('./lib/bland');
const pino   = require('pino');
const logger = pino();

/**
 * Main batch function: reads pending rows, enqueues calls, and writes back status.
 */
async function runBatch() {
  try {
    const rows = await Sheets.readRows();
    const tasks = rows.map(async (row) => {
      const { rowNumber, status } = row;
      if (status === 'success: Call successfully queued.') {
        logger.info({ rowNumber }, 'Already queued, skipping');
        return;
      }

      try {
        const result    = await Bland.enqueueCall(row);
        const callId    = result.call_id   || 'N/A';
        const statusMsg = `${result.status}: ${result.message || 'Call successfully queued'}`;
        const voiceId   = result.voiceId   || 'N/A'; // <— now correct

        await Sheets.updateQueueResult(rowNumber, statusMsg, callId, voiceId);
        logger.info({ rowNumber, statusMsg, callId, voiceId }, 'Row updated');
      } catch (err) {
        const errorMsg = `error: ${err.message}`;
        await Sheets.updateQueueResult(rowNumber, errorMsg, 'N/A', 'N/A');
        logger.error({ rowNumber, err }, 'Failed to enqueue call');
      }
    });

    await Promise.all(tasks);
    logger.info('Batch job completed successfully');
  } catch (err) {
    logger.error({ err }, 'Batch job failed');
    throw err;
  }
}

if (require.main === module) {
  runBatch().catch(err => {
    console.error('Batch job failed:', err);
    process.exit(1);
  });
}

module.exports = runBatch;