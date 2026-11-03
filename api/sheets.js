import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const storeFilePath = path.resolve(__dirname, '../data/store.json');

// Local store helpers
function getLocalStore() {
  try {
    if (fs.existsSync(storeFilePath)) {
      return JSON.parse(fs.readFileSync(storeFilePath, 'utf8'));
    }
  } catch (err) {
    console.error('Error reading local store:', err);
  }
  return { expenses: [], reminders: [] };
}

function saveLocalStore(data) {
  try {
    const dir = path.dirname(storeFilePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(storeFilePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing local store:', err);
  }
}

/**
 * Returns an authenticated Google Sheets client or null if env vars are missing.
 */
export function getSheetsClient() {
  const serviceEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  if (serviceEmail && privateKey && spreadsheetId) {
    try {
      const auth = new google.auth.JWT(
        serviceEmail,
        null,
        privateKey,
        ['https://www.googleapis.com/auth/spreadsheets']
      );
      const sheets = google.sheets({ version: 'v4', auth });
      return { sheets, spreadsheetId, serviceEmail };
    } catch (err) {
      console.error('Failed to create Google Auth JWT:', err);
    }
  }
  return null;
}

/**
 * Initializes Expenses and Reminders sheet tabs with styled header rows if they don't exist.
 */
export async function initializeSheetTabs(sheets, spreadsheetId) {
  try {
    // 1. Get existing sheet metadata
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const existingTitles = (meta.data.sheets || []).map((s) => s.properties.title);

    const requests = [];
    if (!existingTitles.includes('Expenses')) {
      requests.push({
        addSheet: {
          properties: {
            title: 'Expenses',
            gridProperties: { frozenRowCount: 1 }
          }
        }
      });
    }
    if (!existingTitles.includes('Reminders')) {
      requests.push({
        addSheet: {
          properties: {
            title: 'Reminders',
            gridProperties: { frozenRowCount: 1 }
          }
        }
      });
    }

    if (requests.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests }
      });
    }

    // 2. Set Header rows
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Expenses!A1:E1',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [['ID', 'Date', 'Item Description', 'Category', 'Amount (INR)']]
      }
    }).catch(() => null);

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Reminders!A1:E1',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [['ID', 'Date Added', 'Reminder Task', 'Due Date', 'Calendar URL']]
      }
    }).catch(() => null);

    return { success: true, message: 'Google Sheet tabs (Expenses, Reminders) initialized with headers.' };
  } catch (err) {
    console.error('Error initializing sheet tabs:', err.message);
    throw err;
  }
}

/**
 * Reads all expenses and reminders from Google Sheets.
 */
export async function readRecordsFromSheet() {
  const clientInfo = getSheetsClient();
  if (!clientInfo) return null;

  const { sheets, spreadsheetId } = clientInfo;

  try {
    const [expRes, remRes] = await Promise.all([
      sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Expenses!A2:E'
      }).catch(() => ({ data: { values: [] } })),
      sheets.spreadsheets.values.get({
        spreadsheetId,
        range: 'Reminders!A2:E'
      }).catch(() => ({ data: { values: [] } }))
    ]);

    const expenses = (expRes.data.values || []).map((row, idx) => ({
      id: row[0] || `gs-exp-${idx}`,
      date: row[1] || '',
      item: row[2] || '',
      category: row[3] || 'General',
      amount: Number(row[4]) || 0
    }));

    const reminders = (remRes.data.values || []).map((row, idx) => ({
      id: row[0] || `gs-rem-${idx}`,
      dateAdded: row[1] || '',
      task: row[2] || '',
      due: row[3] || null,
      calendarUrl: row[4] || null
    }));

    return { expenses, reminders, spreadsheetId };
  } catch (err) {
    console.error('Error reading records from Google Sheet:', err.message);
    throw err;
  }
}

/**
 * Appends new records into Google Sheet tabs.
 */
export async function appendRecordsToSheet(newExpenses = [], newReminders = []) {
  const clientInfo = getSheetsClient();
  if (!clientInfo) return false;

  const { sheets, spreadsheetId } = clientInfo;

  try {
    if (newExpenses.length > 0) {
      const expRows = newExpenses.map((e) => [
        e.id,
        e.date || new Date().toISOString().split('T')[0],
        e.item,
        e.category || 'General',
        e.amount
      ]);

      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Expenses!A:E',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: expRows }
      }).catch(async () => {
        // Fallback to Sheet1 if Expenses tab does not exist
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: 'Sheet1!A:E',
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: expRows }
        });
      });
    }

    if (newReminders.length > 0) {
      const remRows = newReminders.map((r) => [
        r.id,
        r.dateAdded || new Date().toISOString().split('T')[0],
        r.task,
        r.due || '',
        r.calendarUrl || ''
      ]);

      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: 'Reminders!A:E',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: remRows }
      }).catch(async () => {
        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: 'Sheet1!A:E',
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: remRows }
        });
      });
    }

    return true;
  } catch (err) {
    console.error('Error appending records to Google Sheet:', err.message);
    return false;
  }
}

/**
 * Vercel Serverless Function Handler for /api/sheets
 */
export default async function handler(req, res) {
  const clientInfo = getSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  // GET: Health / Status check of Google Sheets Integration
  if (req.method === 'GET') {
    if (!clientInfo) {
      return res.status(200).json({
        connected: false,
        status: 'Unconfigured',
        message: 'Google Sheets Service Account keys missing. Set GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY in .env.',
        sheetId: spreadsheetId || null,
        sheetUrl: spreadsheetId ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` : null
      });
    }

    try {
      const meta = await clientInfo.sheets.spreadsheets.get({ spreadsheetId: clientInfo.spreadsheetId });
      const sheetTitles = (meta.data.sheets || []).map((s) => s.properties.title);

      return res.status(200).json({
        connected: true,
        status: 'Connected',
        sheetTitle: meta.data.properties.title,
        tabs: sheetTitles,
        serviceAccount: clientInfo.serviceEmail,
        sheetId: clientInfo.spreadsheetId,
        sheetUrl: `https://docs.google.com/spreadsheets/d/${clientInfo.spreadsheetId}/edit`
      });
    } catch (err) {
      return res.status(200).json({
        connected: false,
        status: 'Authentication Error',
        error: err.message,
        sheetId: spreadsheetId,
        sheetUrl: spreadsheetId ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` : null,
        hint: 'Ensure you have shared the Google Sheet with your Service Account Email as an Editor.'
      });
    }
  }

  // POST: Specific operations (initialize headers or sync all data)
  if (req.method === 'POST') {
    const { action } = req.query || req.body || {};

    if (!clientInfo) {
      return res.status(400).json({
        error: 'Google Sheets credentials not configured in environment.'
      });
    }

    try {
      if (action === 'init' || action === 'setup-headers') {
        const result = await initializeSheetTabs(clientInfo.sheets, clientInfo.spreadsheetId);
        return res.status(200).json(result);
      }

      if (action === 'sync') {
        const local = getLocalStore();
        await appendRecordsToSheet(local.expenses, local.reminders);
        return res.status(200).json({
          success: true,
          message: `Synced ${local.expenses.length} expenses and ${local.reminders.length} reminders to Google Sheets.`
        });
      }

      return res.status(400).json({ error: 'Unknown action. Supported: init, sync' });
    } catch (err) {
      console.error('Google Sheets Action Error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed. Use GET or POST.' });
}

