const axios = require('axios');
const fetch = require('node-fetch');
const PQueue = require('p-queue').default;

const mvp16April2025 = require('../config/tasks');
const tools = require('../config/tools');
const summaryPrompt = require('../config/summaryPrompt');
const voices = require('../config/voices');

const queue = new PQueue({ concurrency: 100 });
axios.defaults.headers.common['authorization'] = process.env.BLAND_API_KEY;

/**
 * Utility function to retry an async operation with exponential backoff.
 * @param {Function} operation - The async function to retry.
 * @param {number} maxRetries - Maximum number of retries.
 * @param {number} baseDelay - Base delay in milliseconds.
 * @returns {Promise} - Resolves with the operation's result or rejects with the last error.
 */
async function retryOperation(operation, maxRetries = 3, baseDelay = 1000) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const isSocketHangup = error.code === 'ECONNRESET' ||
                            error.code === 'ECONNABORTED' ||
                            error.code === 'ECONNREFUSED' ||
                            error.message.includes('socket hang up');
      const isServerError = error.response && error.response.status >= 500;
      const isRateLimit = error.response && error.response.status === 429;

      // Retry on socket hangup, server errors (5xx), or rate limit (429)
      if (!(isSocketHangup || isServerError || isRateLimit)) {
        throw error; // Don't retry on other errors (e.g., 4xx except 429)
      }

      if (attempt === maxRetries) {
        console.error(`Max retries (${maxRetries}) reached: ${error.message}`);
        throw error;
      }

      // Exponential backoff: baseDelay * 2^(attempt-1)
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.warn(`Retry attempt ${attempt} failed: ${error.message} (Socket hangup: ${isSocketHangup}). Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

/**
 * Build a plain-text report (shared by both text and HTML).
 */
function buildPlainReport(payload, analysis) {
  const {
    call_id: callId, email: leadEmail,
    status = '', started_at: startedAt = '',
    corrected_duration: correctedDuration = '',
    recording_url: recordingUrl = '',
    summary = '', transcripts = []
  } = payload;

  const durationMinutes = correctedDuration
    ? (parseInt(correctedDuration, 10) / 60).toFixed(2)
    : '';
  let istStart = startedAt;
  try {
    istStart = new Date(startedAt)
      .toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }) + ' IST';
  } catch (error) {
    console.warn(`Invalid date format for startedAt: ${startedAt}`);
  }

  const formattedTranscript = Array.isArray(transcripts)
    ? transcripts.map(t=>`${t.user==='assistant'?'AI':t.user}: ${t.text}`).join('\n')
    : 'No transcript available';

  const questions = [
    "Has the user mentioned that they will attend the trial workshop?",
    "Is the user looking to upskill?",
    "Is the user only looking for a job?",
    "Did the user ask about the program price?",
    "Is the user currently working?",
    "Did the call end on a positive note?"
  ];
  let analysisText = 'No analysis data available';
  if (Array.isArray(analysis.answers) && analysis.answers.length===questions.length) {
    analysisText = questions.map((q,i)=>`${q}: ${analysis.answers[i]}`).join('\n');
  }

  return `
Call Analysis Report
_______________________________________________________

Basic Information
Lead Email: ${leadEmail}
Call ID: ${callId}
Call Start Time: ${istStart}
Duration (minutes): ${durationMinutes}
Call Status: ${status}
Recording: ${recordingUrl||'N/A'}

Call Summary
${summary||'No summary available'}

Call Analysis
${analysisText}

Call Transcript
${formattedTranscript}

Generated automatically by AI Call Agent Analyzer
`.trim();
}

/**
 * Wraps the plain-text report into a modern HTML page.
 */
function buildReportHtml(payload, analysis) {
  const {
    call_id: callId, email: leadEmail,
    status = '', started_at: startedAt = '',
    corrected_duration: correctedDuration = '',
    recording_url: recordingUrl = '',
    summary = '', transcripts = []
  } = payload;

  const durationMinutes = correctedDuration
    ? (parseInt(correctedDuration, 10) / 60).toFixed(2)
    : '';
  let istStart = startedAt;
  try {
    istStart = new Date(startedAt)
      .toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }) + ' IST';
  } catch (error) {
    console.warn(`Invalid date format for startedAt: ${startedAt}`);
  }

  const formattedTranscript = Array.isArray(transcripts)
    ? transcripts.map(t => `${t.user === 'assistant' ? 'AI' : t.user}: ${t.text}`).join('\n')
    : 'No transcript available';

  const questions = [
    "Has the user mentioned that they will attend the trial workshop?",
    "Is the user looking to upskill?",
    "Is the user only looking for a job?",
    "Did the user ask about the program price?",
    "Is the user currently working?",
    "Did the call end on a positive note?"
  ];

  // Escape HTML special characters to prevent XSS
  const escapeHtml = (text) => {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Call Analysis Report</title>
  <style>
    :root {
      --primary: #2563eb;
      --primary-light: #dbeafe;
      --gray-100: #f3f4f6;
      --gray-200: #e5e7eb;
      --gray-700: #374151;
      --gray-800: #1f2937;
      --gray-900: #111827;
    }
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: var(--gray-800);
      line-height: 1.6;
      max-width: 900px;
      margin: 0 auto;
      padding: 2rem;
      background-color: #fafafa;
    }
    
    .report-container {
      background-color: white;
      border-radius: 12px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
      overflow: hidden;
    }
    
    .report-header {
      padding: 1.5rem 2rem;
      background-color: var(--primary);
      color: white;
    }
    
    .report-header h1 {
      font-weight: 600;
      font-size: 1.5rem;
      letter-spacing: -0.025em;
    }
    
    .report-body {
      padding: 2rem;
    }
    
    .report-section {
      margin-bottom: 2rem;
      border-bottom: 1px solid var(--gray-200);
      padding-bottom: 1.5rem;
    }
    
    .report-section:last-child {
      border-bottom: none;
      margin-bottom: 0;
      padding-bottom: 0;
    }
    
    .section-title {
      color: var(--gray-900);
      font-size: 1.125rem;
      font-weight: 600;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
    }
    
    .section-title::before {
      content: "";
      display: inline-block;
      width: 0.25rem;
      height: 1.125rem;
      background-color: var(--primary);
      margin-right: 0.5rem;
      border-radius: 1px;
    }
    
    .info-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 0.75rem;
    }
    
    @media (min-width: 640px) {
      .info-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }
    
    .info-item {
      background-color: var(--gray-100);
      border-radius: 6px;
      padding: 0.75rem 1rem;
    }
    
    .info-label {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--gray-700);
      margin-bottom: 0.25rem;
    }
    
    .info-value {
      font-weight: 500;
      word-break: break-word;
    }
    
    .recording-link {
      color: var(--primary);
      text-decoration: none;
    }
    
    .recording-link:hover {
      text-decoration: underline;
    }
    
    .analysis-list {
      background-color: var(--primary-light);
      border-radius: 6px;
      padding: 1rem;
    }
    
    .analysis-item {
      display: flex;
      align-items: flex-start;
      margin-bottom: 0.75rem;
    }
    
    .analysis-item:last-child {
      margin-bottom: 0;
    }
    
    .analysis-question {
      flex: 1;
    }
    
    .analysis-answer {
      font-weight: 600;
      min-width: 40px;
      text-align: right;
    }
    
    .transcript-box {
      background-color: var(--gray-100);
      border-radius: 6px;
      padding: 1rem;
      white-space: pre-wrap;
      font-family: monospace;
      font-size: 0.875rem;
      max-height: 400px;
      overflow-y: auto;
    }
    
    .footer {
      text-align: center;
      color: var(--gray-700);
      font-size: 0.75rem;
      margin-top: 1.5rem;
    }
  </style>
</head>
<body>
  <div class="report-container">
    <div class="report-header">
      <h1>Call Analysis Report</h1>
    </div>
    
    <div class="report-body">
      <!-- Basic Information Section -->
      <div class="report-section">
        <h2 class="section-title">Basic Information</h2>
        <div class="info-grid">
          <div class="info-item">
            <div class="info-label">Lead Email</div>
            <div class="info-value">${escapeHtml(leadEmail)}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Call ID</div>
            <div class="info-value">${escapeHtml(callId)}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Call Start Time</div>
            <div class="info-value">${escapeHtml(istStart)}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Duration</div>
            <div class="info-value">${escapeHtml(durationMinutes)} minutes</div>
          </div>
          <div class="info-item">
            <div class="info-label">Call Status</div>
            <div class="info-value">${escapeHtml(status)}</div>
          </div>
          <div class="info-item">
            <div class="info-label">Recording</div>
            <div class="info-value">
              ${recordingUrl ? `<a href="${escapeHtml(recordingUrl)}" class="recording-link" target="_blank">Listen to recording</a>` : 'N/A'}
            </div>
          </div>
        </div>
      </div>
      
      <!-- Call Summary Section -->
      <div class="report-section">
        <h2 class="section-title">Call Summary</h2>
        <p>${escapeHtml(summary) || 'No summary available'}</p>
      </div>
      
      <!-- Call Analysis Section -->
      <div class="report-section">
        <h2 class="section-title">Call Analysis</h2>
        <div class="analysis-list">
          ${questions.map((q, i) => `
            <div class="analysis-item">
              <div class="analysis-question">${escapeHtml(q)}</div>
              <div class="analysis-answer">${Array.isArray(analysis.answers) && analysis.answers.length === questions.length ? escapeHtml(analysis.answers[i]) : 'N/A'}</div>
            </div>
          `).join('')}
        </div>
      </div>
      
      <!-- Call Transcript Section -->
      <div class="report-section">
        <h2 class="section-title">Call Transcript</h2>
        <div class="transcript-box">
          ${escapeHtml(formattedTranscript)}
        </div>
      </div>
    </div>
  </div>
  
  <div class="footer">
    Generated automatically by AI Call Agent Analyzer
  </div>
</body>
</html>`;
}

module.exports = {
  /**
   * Analyze a completed call via Bland AI.
   */
  analyzeCall: async (callId) => {
    return queue.add(async () => {
      return retryOperation(async () => {
        const resp = await axios.post(
          `https://api.bland.ai/v1/calls/${callId}/analyze`,
          {
            goal: 'To analyse whether or not the lead will attend the trial workshop',
            questions: [
              ["Has the user mentioned that they will attend the trial workshop?", "boolean"],
              ["Is the user looking to upskill?",                   "boolean"],
              ["Is the user only looking for a job?",               "boolean"],
              ["Did the user ask about the program price?",         "boolean"],
              ["Is the user currently working?",                    "boolean"],
              ["Did the call end on a positive note?",              "boolean"]
            ]
          },
          { timeout: 45_000 } // Increased timeout to 45 seconds
        );
        return resp.data;
      });
    });
  },

  /**
   * Build the HTML report for a call.
   */
  buildReportHtml,

  /**
   * Enqueue an outbound call via Bland AI.
   * Returns the response JSON with `.voiceId` attached.
   */
  enqueueCall: async (row) => {
    return queue.add(async () => {
      const [
        email, phoneSuffix, , workingStatus,
        education, currentCompany, currentRole,
        workExperience, graduationYear,
        programInterested, source
      ] = row.raw;

      const phone_number = '+91' + String(phoneSuffix).trim();
      const { name: advisorName, voiceId } = voices[
        Math.floor(Math.random()*voices.length)
      ];

      const requestData = {
        phone_number, voice: voiceId,
        wait_for_greeting: true, record: true, amd: false,
        answered_by_enabled: true, noise_cancellation: true,
        interruption_threshold: 100, block_interruptions: false,
        max_duration: 15, model:"base",
        memory_id: process.env.BLAND_MEMORY_ID,
        language:"en", background_track:"office",
        endpoint:"https://api.bland.ai", voicemail_action:"hangup",
        temperature:0.6, task:mvp16April2025(advisorName),
        timezone: process.env.BLAND_Timezone,
        tools, summary_prompt:summaryPrompt,
        webhook:process.env.WEBHOOK_URL,
        analysis_schema:{
          trial_booking:"boolean",
          email:"string",
          phone_number:"string",
          name:"string"
        },
        request_data:{
          Name:row.raw[2],
          "Working Status":workingStatus,
          Education:education,
          "Current Company":currentCompany,
          "Current Role":currentRole,
          "Work Experience":workExperience,
          "Graduation Year":graduationYear,
          "Program Interested":programInterested,
          Source:source,
          email,
          Day:new Date().toLocaleString('en-US',{weekday:'long'})
        },
        json_mode_enabled:false
      };

      return retryOperation(async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45_000); // 45 seconds timeout
        try {
          const resp = await fetch('https://api.bland.ai/v1/calls', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'authorization': process.env.BLAND_API_KEY
            },
            body: JSON.stringify(requestData),
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          if (!resp.ok) {
            const errText = await resp.text().catch(() => '');
            console.error('Bland enqueue error:', resp.status, errText);
            throw new Error(`Bland enqueue failed: ${resp.status}`);
          }

          const data = await resp.json();
          data.voiceId = voiceId;
          return data;
        } catch (error) {
          clearTimeout(timeoutId);
          throw error;
        }
      });
    });
  }
};