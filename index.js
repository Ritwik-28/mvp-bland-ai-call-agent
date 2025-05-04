// index.js

require('dotenv').config();
const fastify = require('fastify')({ logger: true });
const Sheets  = require('./lib/sheets');
const Bland   = require('./lib/bland');
const S3      = require('./lib/s3');
const runBatch= require('./batch');

// Webhook: receive Bland AI analysis callbacks
fastify.post('/webhook', async (req, reply) => {
  try {
    const payload = req.body;
    const callId  = payload.call_id;
    if (!callId) throw new Error('Missing call_id');

    // 1) Re-analyze the call
    const analysis = await Bland.analyzeCall(callId);

    // 2) Generate HTML
    const html = Bland.buildReportHtml(payload, analysis);

    // 3) Upload to S3 as HTML, public-read
    const key = `call-analysis/${callId}.html`;
    const publicUrl = await S3.uploadAndGetPublicUrl(
      key,
      html,
      'text/html'
    );

    // 4) Write full analysis URL back to Google Sheet
    await Sheets.updateRowByCallId(callId, payload, analysis, publicUrl);

    reply.send({ status:'success', url: publicUrl });
  } catch (err) {
    req.log.error(err);
    reply.code(500).send({ error: err.message });
  }
});

// Trigger endpoint: enqueue outbound calls
fastify.post('/enqueue-batch', async (req, reply) => {
  try {
    await runBatch();
    reply.send({ status:'batch started' });
  } catch (err) {
    req.log.error(err);
    reply.code(500).send({ error: 'Batch failed: ' + err.message });
  }
});

// Start Fastify on PORT (default 3000)
const start = async () => {
  const port = parseInt(process.env.PORT,10) || 3000;
  await fastify.listen({ port, host:'0.0.0.0' });
  fastify.log.info(`Server listening on port ${port}`);
};
start();
