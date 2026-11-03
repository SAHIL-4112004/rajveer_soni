import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { readRecordsFromSheet, appendRecordsToSheet, getSheetsClient } from './sheets.js';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const storeFilePath = path.resolve(__dirname, '../data/store.json');

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

export default async function handler(req, res) {
  const clientInfo = getSheetsClient();

  // GET: Retrieve records
  if (req.method === 'GET') {
    let localData = readLocalStore();

    if (clientInfo) {
      try {
        const sheetData = await readRecordsFromSheet();
        if (sheetData && (sheetData.expenses.length > 0 || sheetData.reminders.length > 0)) {
          localData = {
            expenses: sheetData.expenses,
            reminders: sheetData.reminders
          };
          writeLocalStore(localData);
        }

        return res.status(200).json({
          expenses: localData.expenses,
          reminders: localData.reminders,
          storageType: 'Google Sheets (Live Connected)',
          sheetId: clientInfo.spreadsheetId,
          sheetUrl: `https://docs.google.com/spreadsheets/d/${clientInfo.spreadsheetId}/edit`
        });
      } catch (err) {
        console.warn('Google Sheets read fallback:', err.message);
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
          localData.expenses.unshift(entry);
        }
      }

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

      // Append to Google Sheets via dedicated Sheets API function
      if (clientInfo && (newExpenseEntries.length > 0 || newReminderEntries.length > 0)) {
        await appendRecordsToSheet(newExpenseEntries, newReminderEntries);
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
