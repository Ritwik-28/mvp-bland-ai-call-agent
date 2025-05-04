# Crio Bland Agent

This repository provides:
- **Webhook** (`index.js`): Receives Bland AI call webhooks, analyzes calls, generates text reports, uploads to S3 with 1-year presigned URLs, and writes back to Google Sheets.
- **Batch Caller** (`batch.js`): Reads rows from a Google Sheet, enqueues Bland AI outbound calls (up to 100 concurrent), and updates call status back to the sheet.

## Setup

1. Copy `.env.example` to `.env` and fill in your credentials.
2. `npm install`
3. `node index.js` to start the webhook server.
4. `node batch.js` to run the batch caller job.
