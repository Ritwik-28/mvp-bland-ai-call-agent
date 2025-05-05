// index.js
require('dotenv').config();

const fastify = require('fastify')({ logger: true });
const Sheets  = require('./lib/sheets');
const Bland   = require('./lib/bland');
const S3      = require('./lib/s3');
const runBatch = require('./batch');

let pollHandle = null;

/**
 * Webhook: receive Bland AI callbacks, generate HTML report, upload it,
 * and write the public URL back into your Google Sheet.
 */
fastify.post('/webhook', async (request, reply) => {
  try {
    const payload = request.body;
    const callId  = payload.call_id;
    if (!callId) throw new Error('Missing call_id');

    // 1) Re-analyze the call
    const analysis = await Bland.analyzeCall(callId);

    // 2) Build your HTML report
    const html = Bland.buildReportHtml(payload, analysis);

    // 3) Upload as public HTML
    const key       = `call-analysis/${callId}.html`;
    const publicUrl = await S3.uploadAndGetPublicUrl(
      key,
      html,
      'text/html'
    );

    // 4) Write the URL (and other analysis) back to Sheets
    await Sheets.updateRowByCallId(callId, payload, analysis, publicUrl);

    reply.send({ status: 'success', url: publicUrl });
  } catch (err) {
    request.log.error(err);
    reply.code(500).send({ error: err.message });
  }
});

/**
 * Trigger endpoint: enqueue outbound calls.
 * - Immediately returns “calls started” (202)
 * - Kicks off a background polling loop that calls `runBatch()`
 *   every minute until there are no pending rows left.
 */
fastify.post('/enqueue-batch', (request, reply) => {
  // If already running, reply accordingly
  if (pollHandle) {
    return reply.code(200).send({ status: 'already running' });
  }

  // Reply immediately
  reply.code(202).send({ status: 'calls started' });

  // Run the first pass right away
  (async () => {
    try {
      const firstCount = await runBatch();
      fastify.log.info({ firstCount }, 'initial batch run');

      // Then schedule repeats
      const intervalMs = parseInt(process.env.BATCH_INTERVAL_MS, 10) || 60_000;
      pollHandle = setInterval(async () => {
        try {
          const n = await runBatch();
          fastify.log.info({ processed: n }, 'scheduled batch run');
          // stop when there's nothing left to do
          if (n === 0) {
            fastify.log.info('no more pending rows, stopping loop');
            clearInterval(pollHandle);
            pollHandle = null;
          }
        } catch (err) {
          fastify.log.error(err, 'scheduled batch run failed');
        }
      }, intervalMs);
    } catch (err) {
      fastify.log.error(err, 'initial batch run failed');
      pollHandle = null;
    }
  })();
});

/**
 * Simple health check.
 */
fastify.get('/', async () => {
  return { status: 'ok' };
});

/**
 * Start the server on the PORT caddy will proxy into (default: 3000)
 */
const start = async () => {
  const port = parseInt(process.env.PORT, 10) || 3000;
  await fastify.listen({ port, host: '0.0.0.0' });
  fastify.log.info(`Server listening on port ${port}`);
};

start();