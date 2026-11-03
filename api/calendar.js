import { google } from 'googleapis';
import dotenv from 'dotenv';

dotenv.config();

export async function executeCalendarAction({ task, dueDate, description }) {
  const serviceEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const calendarId = process.env.GOOGLE_CALENDAR_ID;

  // 1. If Google Calendar Service Account credentials are fully configured
  if (serviceEmail && privateKey && calendarId) {
    try {
      const auth = new google.auth.JWT(
        serviceEmail,
        null,
        privateKey,
        ['https://www.googleapis.com/auth/calendar']
      );
      const calendar = google.calendar({ version: 'v3', auth });

      const dateStr = dueDate || new Date().toISOString().split('T')[0];
      const startDateTime = `${dateStr}T09:00:00+05:30`;
      const endDateTime = `${dateStr}T10:00:00+05:30`;

      const response = await calendar.events.insert({
        calendarId,
        requestBody: {
          summary: task,
          description: description || 'Created by Voice AI Assistant',
          start: { dateTime: startDateTime },
          end: { dateTime: endDateTime }
        }
      });

      return {
        success: true,
        apiUsed: 'Google Calendar API (Service Account)',
        eventId: response.data.id,
        htmlLink: response.data.htmlLink,
        status: 'Event created in Google Calendar'
      };
    } catch (err) {
      console.error('Google Calendar API Error:', err.message);
    }
  }

  // 2. High-reliability fallback: Google Calendar Direct Action Link
  const targetDate = dueDate || new Date().toISOString().split('T')[0];
  const cleanDate = targetDate.replace(/-/g, '');
  const start = `${cleanDate}T090000Z`;
  const end = `${cleanDate}T100000Z`;
  const text = encodeURIComponent(task);
  const details = encodeURIComponent(description || `Reminder created by Voice AI Assistant for ${targetDate}`);
  const calendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${start}/${end}&details=${details}`;

  return {
    success: true,
    apiUsed: 'Google Calendar Direct Action Link',
    calendarUrl,
    status: 'Ready to add to Google Calendar'
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    const { task, dueDate, description } = req.body || {};
    if (!task) {
      return res.status(400).json({ error: 'Missing required field: task' });
    }

    const result = await executeCalendarAction({ task, dueDate, description });
    return res.status(200).json(result);
  } catch (error) {
    console.error('Calendar API Handler Error:', error);
    return res.status(500).json({ error: error.message || 'Failed to process calendar action' });
  }
}
