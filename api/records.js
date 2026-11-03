import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const storeFilePath = path.resolve(__dirname, '../data/store.json');

// Ensure data file exists
function readLocalStore() {
  try {
    if (fs.existsSync(storeFilePath)) {
      const raw = fs.readFileSync(storeFilePath, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('Error reading local store:', err);
  }
  return { expenses: [], reminders: [] };
}

function writeLocalStore(data) {
  try {
    const dir = path.dirname(storeFilePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(storeFilePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing local store:', err);
  }
}

// Google Sheets Auth helper
function getGoogleSheetsClient() {
  const serviceEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  if (serviceEmail && privateKey && spreadsheetId) {
    const auth = new google.auth.JWT(
      serviceEmail,
      null,
      privateKey,
      ['https://www.googleapis.com/auth/spreadsheets']
    );
    const sheets = google.sheets({ version: 'v4', auth });
    return { sheets, spreadsheetId };
  }
  return null;
}

export default async function handler(req, res) {
  const clientInfo = getGoogleSheetsClient();

  // GET: Retrieve all shared records
  if (req.method === 'GET') {
    let localData = readLocalStore();

    if (clientInfo) {
      try {
        const { sheets, spreadsheetId } = clientInfo;

        // Try reading Expenses sheet
        const expRes = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: 'Expenses!A2:E'
        }).catch(() => null);

        // Try reading Reminders sheet
        const remRes = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: 'Reminders!A2:E'
        }).catch(() => null);

        const sheetExpenses = (expRes?.data?.values || []).map((row, idx) => ({
          id: row[0] || `gs-exp-${idx}`,
          date: row[1] || '',
          item: row[2] || '',
          category: row[3] || 'General',
          amount: Number(row[4]) || 0
        }));

        const sheetReminders = (remRes?.data?.values || []).map((row, idx) => ({
          id: row[0] || `gs-rem-${idx}`,
          dateAdded: row[1] || '',
          task: row[2] || '',
          due: row[3] || null,
          calendarUrl: row[4] || null
        }));

        if (sheetExpenses.length > 0 || sheetReminders.length > 0) {
          localData = {
            expenses: sheetExpenses,
            reminders: sheetReminders
          };
          writeLocalStore(localData);
        }

        return res.status(200).json({
          expenses: localData.expenses,
          reminders: localData.reminders,
          storageType: 'Google Sheets (Live Connected)',
          sheetId: spreadsheetId,
          sheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
        });
      } catch (err) {
        console.warn('Google Sheets read error, using persistent store fallback:', err.message);
      }
    }

    return res.status(200).json({
      expenses: localData.expenses,
      reminders: localData.reminders,
      storageType: clientInfo ? 'Google Sheets (Syncing)' : 'Shared Database (Persistent Storage)',
      sheetId: process.env.GOOGLE_SHEET_ID || null
    });
  }

  // POST: Append new records
  if (req.method === 'POST') {
    try {
      const { expenses = [], reminders = [] } = req.body || {};
      const localData = readLocalStore();
      const today = new Date().toISOString().split('T')[0];

      const newExpenseEntries = [];
      const newReminderEntries = [];

      // Format expenses
      for (const exp of expenses) {
        if (exp && exp.item && !isNaN(Number(exp.amount))) {
          const entry = {
            id: `exp-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            date: exp.date || today,
            item: String(exp.item).trim(),
            category: String(exp.category || 'General').trim(),
            amount: Number(exp.amount)
          };
          newExpenseEntries.push(entry);
          localData.expenses.unshift(entry); // newest first
        }
      }

      // Format reminders
      for (const rem of reminders) {
        if (rem && rem.task) {
          const entry = {
            id: `rem-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            dateAdded: today,
            task: String(rem.task).trim(),
            due: rem.due || null,
            calendarUrl: rem.calendarUrl || null
          };
          newReminderEntries.push(entry);
          localData.reminders.unshift(entry);
        }
      }

      // Save locally
      writeLocalStore(localData);

      // Append to Google Sheets if configured
      if (clientInfo && (newExpenseEntries.length > 0 || newReminderEntries.length > 0)) {
        try {
          const { sheets, spreadsheetId } = clientInfo;

          if (newExpenseEntries.length > 0) {
            const expRows = newExpenseEntries.map((e) => [e.id, e.date, e.item, e.category, e.amount]);
            await sheets.spreadsheets.values.append({
              spreadsheetId,
              range: 'Expenses!A:E',
              valueInputOption: 'USER_ENTERED',
              requestBody: { values: expRows }
            }).catch(async () => {
              // Fallback to Sheet1 if Expenses sheet tab doesn't exist
              await sheets.spreadsheets.values.append({
                spreadsheetId,
                range: 'Sheet1!A:E',
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: expRows }
              });
            });
          }

          if (newReminderEntries.length > 0) {
            const remRows = newReminderEntries.map((r) => [r.id, r.dateAdded, r.task, r.due || '', r.calendarUrl || '']);
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
        } catch (sheetAppendErr) {
          console.warn('Google Sheets append error:', sheetAppendErr.message);
        }
      }

      return res.status(200).json({
        success: true,
        savedExpenses: newExpenseEntries,
        savedReminders: newReminderEntries,
        allExpenses: localData.expenses,
        allReminders: localData.reminders
      });
    } catch (postError) {
      console.error('Error saving records:', postError);
      return res.status(500).json({ error: postError.message || 'Failed to save records' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed. Use GET or POST.' });
}
