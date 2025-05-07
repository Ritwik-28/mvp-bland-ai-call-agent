// batch.js

require('dotenv').config();
const Sheets = require('./lib/sheets');
const Bland  = require('./lib/bland');
const pino   = require('pino');
const logger = pino();

/**
 * Main batch function: reads all pending rows, enqueues calls, and writes back status.
 * @returns {Promise<number>} number of rows processed
 */
async function runBatch() {
  try {
    // 1) Load all rows
    const rows = await Sheets.readRows();

    // 2) Filter only those not yet queued
    const pending = rows.filter(r => r.status !== 'success: Call successfully queued.');
    if (pending.length === 0) {
      logger.info('runBatch: no pending rows');
      return 0;
    }

    let processed = 0;
    for (const row of pending) {
      const { rowNumber, raw } = row;

      // Validate phoneSuffix (col B)
      const phoneSuffix = String(raw[1] || '').trim();
      if (!/^\d{10}$/.test(phoneSuffix)) {
        const msg = 'error: Invalid phone number';
        await Sheets.updateQueueResult(rowNumber, msg, 'N/A', 'N/A');
        logger.warn({ rowNumber, phoneSuffix }, 'runBatch: invalid phone number');
        processed++;
        continue;
      }

      try {
        // Enqueue the call
        const result     = await Bland.enqueueCall(row);
        const callId     = result.call_id   || 'N/A';
        const statusMsg  = `${result.status}: ${result.message || 'Call successfully queued'}`;
        const voiceId    = result.voiceId   || result._voiceId || 'N/A';

        // Write back
        await Sheets.updateQueueResult(rowNumber, statusMsg, callId, voiceId);
        logger.info({ rowNumber, callId, voiceId }, 'runBatch: enqueued call');
      } catch (err) {
        // On any error, mark it so we won’t retry infinitely
        const errorMsg = `error: ${err.message}`;
        await Sheets.updateQueueResult(rowNumber, errorMsg, 'N/A', 'N/A');
        logger.error({ rowNumber, err }, 'runBatch: failed to enqueue call');
      }

      processed++;
      // small delay to avoid hammering the API
      await new Promise(r => setTimeout(r, 200));
    }

    logger.info(`runBatch: processed ${processed} rows`);
    return processed;
  } catch (err) {
    logger.error({ err }, 'runBatch failed');
    throw err;
  }
}

// Allow `node batch.js` to run as a one-off
if (require.main === module) {
  runBatch()
    .then(n => {
      console.log(`Processed ${n} row(s)`);
      process.exit(0);
    })
    .catch(err => {
      console.error('Batch job failed:', err);
      process.exit(1);
    });
}

module.exports = runBatch;