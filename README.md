# Bland AI Call Agent MVP

The **Bland AI Call Agent MVP** is a minimal proof-of-concept for automating outbound phone calls using [Bland AI](https://www.bland.ai/), an enterprise-grade conversational AI platform. This project demonstrates how to:
- Enqueue calls from a Google Sheet with lead details.
- Initiate calls via Bland AI’s API (`https://api.bland.ai/v1/calls`).
- Record and transcribe conversations.
- Analyze transcripts, generate HTML reports, and upload them to AWS S3.
- Update the Google Sheet with call outcomes and insights.

Built with Node.js, Fastify, Google Sheets API, and AWS S3, it uses Caddy for HTTPS proxying. Ideal for sales, support, or onboarding teams automating outreach.

---

## Table of Contents

1. [What Is Bland AI?](#what-is-bland-ai)
2. [Problem Statement](#problem-statement)
3. [Architecture](#architecture)
4. [Setup](#setup)
   - [Clone the Repository](#clone-the-repository)
   - [Install Dependencies](#install-dependencies)
   - [Configure Cloud Resources](#configure-cloud-resources)
5. [Prerequisites](#prerequisites)
6. [Configuration](#configuration)
7. [Running Locally](#running-locally)
8. [Testing the API](#testing-the-api)
9. [Caddy Reverse Proxy](#caddy-reverse-proxy)
10. [Endpoints](#endpoints)
11. [How It Works](#how-it-works)
12. [Environment Variables](#environment-variables)
13. [Folder Structure](#folder-structure)
14. [Configuration Files](#configuration-files)
15. [Next Steps](#next-steps)
16. [Troubleshooting](#troubleshooting)

---

## What Is Bland AI?

Bland AI, automates inbound and outbound phone calls with hyper-realistic AI agents. Key features:
- **API-Driven Calls**: Initiate calls via `https://api.bland.ai/v1/calls` with customizable prompts and voice IDs.
- **Conversational Pathways**: Dynamic conversation flows with real-time decisions.
- **Recordings & Transcriptions**: Capture audio and transcribe calls.
- **Scalability**: Supports thousands of concurrent calls with 99.99% uptime and sub-400ms latency (Bland Turbo).
- **Integrations**: Connects to CRMs, ERPs, and schedulers via API or Zapier.
- **Knowledge Base (RAG)**: Upload files to create knowledge bases for the AI to query during calls.
- **Memory Base**: Generates memory files for all the calls against phone numbers to have future context.

---

## Problem Statement

High-volume outbound calling challenges:
- **Manual Effort**: Dialing and scripting are time-intensive.
- **Inconsistent Quality**: Agent performance varies.
- **Insight Extraction**: Manual review of recordings is inefficient.
- **Fragmented Data**: Results are scattered.

This MVP automates call enqueuing, recording, transcription, analysis, and reporting for leads.

---

## Architecture

```
+----------------+          +-----------+           +----------------+
| Google Sheet   |  (1)     | Bland AI  |  (2)      | AI Phone Agent |
| (Master Sheet) |--------->|           |---------->|                |
+----------------+          +-----------+           +----------------+
       ^                          |                         |
       |                          |                         v
       |                          |                  +-----------------+
       |                          |                  | Recording &     |
       |                          |                  | Transcript      |
       |                          |                  +-----------------+
       |                          |                         |
       |                          |                         v
       |                          |                  +-----------------+
       |                          |                  | AI Analysis     |
       |                          |                  +-----------------+
       |                          |                         |
       |                          |                         v
       |                          |                  +-----------------+
       |                          |                  | S3-hosted HTML  |
       |                          |                  | Report          |
       |                          |                  +-----------------+
       |                          |
       |                          | (4) /webhook
       |                          v
       |                   +----------------+
       |                   | batch.js        |
       |                   | (enqueue-batch) |
       |                   +----------------+
       | (5) update
       |
       v
+----------------+
| Google Sheet   |
| (Master Sheet) |
+----------------+
```

**Flow**:
1. `batch.js` reads “Pending” rows from `Call Status` and calls Bland AI’s API.
2. Bland AI initiates calls, records, and transcribes.
3. Webhook events hit `/webhook`.
4. The server analyzes transcripts, uploads HTML reports to S3, and updates columns like `Summary`, `Call Recording`.
5. Stakeholders access reports via `Call Recording` URLs.

---

## Setup

### Clone the Repository

Clone (replace with your own):

```bash
git clone https://github.com/Ritwik-28/mvp-bland-ai-call-agent.git
cd mvp-bland-ai-call-agent
```

### Install Dependencies

Requires Node.js ≥ v18:

```bash
npm install
```

Dependencies: `fastify`, `googleapis`, `aws-sdk`, `axios`.

### Configure Cloud Resources

1. **Google Sheets**:
   - Create a “Master Sheet” with the following columns:
     - **Columns A to C (Call Identifiers)**: `Lead Email Id`, `Mobile Number`, `Lead Name`.
     - **Columns D to K (Call Metadata)**: `Working Status`, `Education`, `Current Company`, `Current Role`, `Work Experience`, `Graduation Year`, `Program Interested`, `Source`. Expand these metadata columns as needed.
     - **Column K (API Response Data)**: `Source` also stores API response data from Bland AI.
     - **Columns M and N (Post-API Call Updates)**: `Call Id`, `Voice Id` (updated after Bland AI API call).
     - **Columns O to AA (Webhook Updates)**: `Call Status`, `Start Time`, `Duration (seconds)`, `Call Recording`, `Summary`, `Transcript`, `User agreed to join trial workshop?`, `Has the user mentioned that they will attend the trial workshop?`, `Is the user looking to upskill?`, `Is the user only looking for a job?`, `Did the user ask about the program price?`, `Is the user currently working?`, `Did the call end on a positive note?`. Expand these metadata columns as needed.
   - Share with your GCP service account (read/write).

2. **GCP Service Account**:
   - In Google Cloud Console, create a service account with “Google Sheets API Editor” role.
   - Download JSON key as `gcp-service-account.json` and add to `.gitignore`.

3. **AWS S3 Bucket**:
   - Create a bucket (e.g., `bland-ai-reports`).
   - Enable public read or use pre-signed URLs.
   - Ensure `PutObject` and `GetObject` permissions.

4. **Bland AI Account**:
   - Sign up at [https://app.bland.ai/](https://app.bland.ai/).
   - Get an API key.
   - Set webhook URL to your server’s `/webhook`.
   - Upload knowledge base files (e.g., FAQs, documents) to Bland AI to obtain knowledge base tool IDs for `config/tools.js`.

---

## Prerequisites

- **Node.js** ≥ v18
- **npm** or **yarn**
- **AWS CLI** configured (`aws configure`)
- **Caddy** or **ngrok** (for local testing)
- **Git**

---

## Configuration

1. Copy environment file:

```bash
cp .env.example .env
```

2. Edit `.env`:

```ini
PORT=3000
BLAND_API_KEY=your_bland_api_key
WEBHOOK_URL=https://your-domain.com/webhook
WEBHOOK_SECRET=your_webhook_secret
GOOGLE_APPLICATION_CREDENTIALS=./gcp-service-account.json
SHEET_ID=your_google_sheet_id
SHEET_NAME=Master Sheet
S3_BUCKET=bland-ai-reports
S3_REGION=us-east-1
```

3. Add `gcp-service-account.json` to `.gitignore`.

> **Security Warning**: Never commit `.env` or `gcp-service-account.json`. Use a secret manager in production.

---

## Running Locally

1. **Start Caddy** (or `ngrok`):
   ```bash
   sudo systemctl start cadd
   ```
   Or:
   ```bash
   ngrok http 3000
   ```
   Update `WEBHOOK_URL` in `.env` and Bland AI dashboard with the `ngrok` URL.

2. **Launch server**:
   ```bash
   npm start
   ```

3. **Enqueue calls**:
   See [Testing the API](#testing-the-api).

---

## Testing the API

Test endpoints using `curl`:

1. **Enqueue Batch**:
   ```bash
   curl -v -X POST \
     https://calls.your-domain.com/enqueue-batch \
     -H "Content-Type: application/json" \
     -d '{"foo":"bar"}'
   ```
   Reads rows with `Call Status` as “Pending” and enqueues calls using `Mobile Number`.

2. **Webhook (Simulate Bland AI)**:
   ```bash
   curl -X POST https://calls.your-domain.com/webhook \
     -H "Content-Type: application/json" \
     -d '{"call_id":"<Call_Id>","email":"<User_Email>"}'
   ```
   Simulates a Bland AI webhook, updating columns like `Call Id`, `Summary`, `Call Recording`.

> **Note**: Replace `your-domain.com` with your Caddy domain or `ngrok` URL. Avoid `-k` (insecure SSL) by ensuring Caddy’s TLS certificate is valid. If using `nip.io` (e.g., `calls.<domain>.nip.io`), verify DNS resolution.

---

## Caddy Reverse Proxy

Caddy provides HTTPS and proxies requests.

**Caddyfile**:
```text
# /etc/caddy/Caddyfile

calls.<your-domain>.nip.io {
  # 1) Redirect HTTP → HTTPS
  @insecure {
    protocol http
  }
  redir @insecure https://{host}{uri} permanent

  # 2) Serve any /view/* paths by proxying to your S3 static-hosting endpoint
  handle_path /view/* {
    # Strip the /view prefix so that
    # /view/call-analysis/123.html → /call-analysis/123.html
    uri strip_prefix /view

    # Proxy to your S3 bucket’s Website endpoint
    reverse_proxy https://<your_bucket_name>.s3-website-ap-south-1.amazonaws.com
  }

  # 3) Everything else goes to your Node.js app on port 3000
  handle {
    reverse_proxy localhost:3000
  }
}
```

Run Caddy:
- **Linux**: `sudo systemctl start caddy`
- **macOS**: `caddy run`
- **Windows**: `caddy.exe run`

---

## Endpoints

| Method | Path               | Description                                            |
| ------ | ------------------ | -------------------------------------------------------|
| POST   | `/enqueue-batch`   | Enqueues calls from rows with `Call Status` “Pending”. |
| POST   | `/webhook`         | Handles Bland AI call events, updates sheet.           |

---

## How It Works

1. **Batch Enqueue** (`batch.js`):
   - Reads rows with `Call Status` (column O) as “Pending”.
   - Uses identifiers (`Lead Email Id`, `Mobile Number`, `Lead Name`) and metadata (`Working Status`, ..., `Program Interested`, `Source`) to initiate calls via Bland AI.
   - Stores API response data in `Source` (column K).
   - Updates `Call Id` (column M) and `Voice Id` (column N) after the API call.

2. **Outbound Call** (Bland AI):
   - Initiates calls, plays prompts, records responses.
   - Uses knowledge base tool IDs from `config/tools.js` to query uploaded knowledge bases.
   - Sends webhook with `Call Id`, `Transcript`, `Call Recording`.

3. **Webhook Handler** (`index.js`):
   - Verifies `WEBHOOK_SECRET`.
   - Analyzes `Transcript`, uploads HTML reports to S3, updates columns O to AA (`Call Status`, `Start Time`, `Duration (seconds)`, `Call Recording`, `Summary`, `Transcript`, `User agreed to join trial workshop?`, ..., `Did the call end on a positive note?`).

4. **Stakeholders**:
   - Access reports via `Call Recording` URLs in the Google Sheet.

---

## Environment Variables

| Variable                        | Description                                    | Example                                 | Required |
| ------------------------------- | ---------------------------------------------- | --------------------------------------- | -------- |
| `PORT`                          | Node.js server port                            | `3000`                                  | Yes      |
| `BLAND_API_KEY`                 | Bland AI API key                               | `your_bland_api_key`                    | Yes      |
| `WEBHOOK_URL`                   | Public URL for webhooks                        | `https://calls.your-domain.com/webhook` | Yes      |
| `WEBHOOK_SECRET`                | Webhook verification secret                    | `your_webhook_secret`                   | Yes      |
| `GOOGLE_APPLICATION_CREDENTIALS`| Path to GCP JSON                               | `./gcp-service-account.json`            | Yes      |
| `SHEET_ID`                      | Google Sheet ID                                | `1AbCDefGhIJkLmNoPqRsTuVwXyZ`           | Yes      |
| `SHEET_NAME`                    | Sheet tab name                                 | `Master Sheet`                          | Yes      |
| `S3_BUCKET`                     | S3 bucket for reports                          | `bland-ai-reports`                      | Yes      |
| `S3_REGION`                     | AWS region                                     | `us-east-1`                             | Yes      |

---

## Folder Structure

```text
mvp-bland-ai-call-agent/
├── .env.example              # Environment variable template
├── Caddyfile                 # Caddy configuration
├── batch.js                  # Enqueues calls
├── index.js                  # Fastify server
├── lib/
│   ├── bland.js             # Bland AI API wrapper
│   ├── sheets.js            # Google Sheets utilities
│   ├── s3.js                # S3 upload utilities
├── config/
│   ├── tasks.js             # Conversational prompts
│   ├── summaryPrompt.js     # Analysis prompt
│   ├── tools.js             # Knowledge base tool IDs
│   ├── voices.js            # Voice IDs
├── package.json              # Dependencies
└── gcp-service-account.json  # GCP credentials (gitignored)
```

---

## Configuration Files (Templates to be updated as per use case)

### `config/tasks.js`
```javascript
module.exports = (metadata) => ({
  task: `
    You are a sales agent for ${metadata.company || 'Acme Corp'}.
    Greet warmly using ${metadata.leadName || 'the recipient'}.
    Introduce as ${metadata.agentName || 'Alex'}.
    Pitch: "Our ${metadata.programInterested || 'program'} helps professionals upskill."
    Ask: "Are you looking to upskill or explore new roles?"
    Suggest a trial workshop if interested.
    Stay friendly, professional.
  `
});
```

### `config/summaryPrompt.js`
```javascript
module.exports = `
  Analyze transcript:
  - 2-3 sentence summary.
  - Insights: Did user agree to trial workshop? Looking to upskill? Job-focused? Asked about price?
  - Next steps: Follow-up call, email, or workshop invite.
  Use bullet points, professional tone.
`;
```

### `config/tools.js`
```javascript
  /**
 * Array of all Knowledge Base IDs your AI task should use.
 */
module.exports = [
    "KB-00e740e1-...........................",
    "KB-75e7ffcd-..........................."
];
```
> **Note**: `tool_id` values (e.g., `kb-12345-.............`) are obtained by uploading files to Bland AI via their API or dashboard. These IDs enable the AI Phone Agent to query the knowledge base during calls.

### `config/voices.js`
```javascript
module.exports = [
  { name: 'Alex', voice_id: 123 },
  { name: 'Emma', voice_id: 124 }
];
```

---

## Next Steps

- **Retries**: Add exponential backoff for API failures.
- **Monitoring**: Use Prometheus or Datadog.
- **Styling**: Apply Tailwind CSS to reports.
- **Dynamic Flows**: Load prompts from a UI.
- **Security**: Implement OAuth for endpoints.

---

## Troubleshooting

- **Calls Not Enqueuing**: Verify `SHEET_ID`, `SHEET_NAME`, `BLAND_API_KEY`. Check `Mobile Number` format (column B).
- **Webhook Errors**: Ensure `WEBHOOK_SECRET` matches, check logs.
- **S3 Issues**: Confirm `s3:PutObject` permissions.
- **Caddy/SSL Errors**: Run `caddy run --config Caddyfile`. Fix TLS for `nip.io` (e.g., `calls.<your-domain>.nip.io`).
- **Local Testing**: Use `ngrok` for webhooks.
- **Rate Limits**: Check [Bland AI Enterprise Rate Limits](https://docs.bland.ai/enterprise-features/enterprise-rate-limits) if API calls fail.

---

## License

MIT License. See [LICENSE](LICENSE.md).

---

For issues or contributions, open a GitHub issue or pull request. Visit [https://www.bland.ai/](https://www.bland.ai/) for more.