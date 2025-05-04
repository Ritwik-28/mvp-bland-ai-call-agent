// lib/sheets.js

// lib/sheets.js

const { google } = require('googleapis');
const creds = require(process.env.GOOGLE_APPLICATION_CREDENTIALS);
const sheets = google.sheets({
  version: 'v4',
  auth: new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  })
});

const SPREADSHEET_ID = process.env.SHEET_ID;
const SHEET_NAME     = process.env.SHEET_NAME;

module.exports = {
  /**
   * Read rows A3:L from the sheet.
   */
  readRows: async () => {
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!A3:L`
    });
    const rows = resp.data.values || [];
    return rows.map((r, i) => ({
      rowNumber:   i + 3,      // actual sheet row
      email:       r[0] || '',
      name:        r[2] || '',
      status:      r[11] || '',
      phoneSuffix: r[1] || '',
      raw:         r
    }));
  },

  /**
   * Update columns L (status), M (call_id), and N (voice_id).
   */
  updateQueueResult: async (rowNumber, statusMsg, callId, voiceId) => {
    const range  = `${SHEET_NAME}!L${rowNumber}:N${rowNumber}`;
    const values = [[ statusMsg, callId, voiceId ]];

    await sheets.spreadsheets.values.update({
      spreadsheetId:  SPREADSHEET_ID,
      range,
      valueInputOption: 'RAW',
      requestBody: { values }
    });
  },

  /**
   * Update the full analysis for the row matching callId.
   */
  updateRowByCallId: async (callId, payload, analysis, presignedUrl) => {
    // 1) Find the row
    const getResp = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: `${SHEET_NAME}!M3:M`
    });
    const callIds = getResp.data.values ? getResp.data.values.flat() : [];
    const idx     = callIds.indexOf(callId);
    if (idx === -1) throw new Error(`Call ID ${callId} not found`);
    const rowNumber = idx + 3;

    // 2) Extract payload fields
    const status            = payload.status             || '';
    const startedAt         = payload.started_at         || '';
    // **Convert to Number so Sheets sees it as numeric**
    const correctedDuration = payload.corrected_duration != null
      ? Number(payload.corrected_duration)
      : '';
    const recordingUrl      = payload.recording_url      || '';
    const summary           = payload.summary            || '';
    const trialBooking      = Array.isArray(analysis.answers) && analysis.answers.length > 0
                              ? analysis.answers[0]
                              : '';

    // 3) Build the two ranges (O–U and V–AA)
    const data = [
      {
        range: `${SHEET_NAME}!O${rowNumber}:U${rowNumber}`,
        values: [[
          status,
          startedAt,
          correctedDuration,
          recordingUrl,
          summary,
          presignedUrl,
          trialBooking
        ]]
      },
      {
        range: `${SHEET_NAME}!V${rowNumber}:AA${rowNumber}`,
        values: [ Array.isArray(analysis.answers) ? analysis.answers : [] ]
      }
    ];

    // 4) Send in one batchUpdate
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        valueInputOption: 'RAW',
        data
      }
    });
  }
};
