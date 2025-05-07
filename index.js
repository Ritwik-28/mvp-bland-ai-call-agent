// index.js

require('dotenv').config();
const fastify  = require('fastify')({ logger: true });
const Sheets   = require('./lib/sheets');
const Bland    = require('./lib/bland');
const S3       = require('./lib/s3');
const runBatch = require('./batch');

/**
 * Bland AI callback handler
 */
fastify.post('/webhook', async (req, reply) => {
  try {
    const payload = req.body;
    const callId  = payload.call_id;
    if (!callId) throw new Error('Missing call_id');

    // 1) Re-analyze the call
    const analysis = await Bland.analyzeCall(callId);

    // 2) Build HTML report
    const html = Bland.buildReportHtml(payload, analysis);

    // 3) Upload to S3 as public HTML
    const key       = `call-analysis/${callId}.html`;
    const publicUrl = await S3.uploadAndGetPublicUrl(
      key,
      html,
      'text/html'
    );

    // 4) Write full analysis URL back to Google Sheet
    await Sheets.updateRowByCallId(callId, payload, analysis, publicUrl);

    reply.send({ status: 'success', url: publicUrl });
  } catch (err) {
    req.log.error(err);
    reply.code(500).send({ error: err.message });
  }
});

/**
 * Trigger endpoint: enqueue outbound calls.
 * Immediately returns “calls started” (202) then fires runBatch() in the background.
 */
fastify.post('/enqueue-batch', (req, reply) => {
  runBatch()
    .then(count => fastify.log.info({ count }, 'Background batch completed'))
    .catch(err   => fastify.log.error(err,       'Background batch failed'));

  reply.code(202).send({ status: 'calls started' });
});

/**
 * Simple health check.
 */
fastify.get('/', async () => ({ status: 'ok' }));

/**
 * Start the server on the PORT that Caddy will proxy into (default: 3000)
 */
const start = async () => {
  const port = parseInt(process.env.PORT, 10) || 3000;
  await fastify.listen({ port, host: '0.0.0.0' });
  fastify.log.info(`Server listening on port ${port}`);
};

start();