import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import { executeCalendarAction } from './calendar.js';
import { executeMailAction } from './mail.js';

dotenv.config();

// Fallback heuristic parser if ANTHROPIC_API_KEY is not yet configured
function heuristicFallbackParse(transcript, todayStr) {
  const lower = (transcript || '').toLowerCase();
  const expenses = [];
  const reminders = [];
  const emails = [];

  // 1. Detect expense
  const expenseMatch = transcript.match(/(?:spent|paid|bought)?\s*(?:rs\.?|inr|rupees|₹|\$)?\s*(\d+(?:\.\d+)?)\s*(?:rs\.?|inr|rupees|₹|\$)?\s*(?:on|for)\s+([a-zA-Z0-9_\s]+?)(?=\s+(?:and|remind|mail|email|$))/i) 
    || transcript.match(/(?:spent|paid|bought)\s+(\d+(?:\.\d+)?)\s*(?:rs\.?|inr|rupees|₹|\$)?\s*(?:on|for)?\s*([a-zA-Z0-9_\s]+?)(?=\s+(?:and|remind|mail|email|$))/i);
  if (expenseMatch && Number(expenseMatch[1]) > 0) {
    const amount = Number(expenseMatch[1]);
    let item = (expenseMatch[2] || 'Expense').trim();
    if (item.length > 30) item = item.slice(0, 30);
    expenses.push({
      item: item || 'Expense',
      amount: amount,
      category: lower.includes('lunch') || lower.includes('dinner') || lower.includes('food') ? 'Food' : 'General'
    });
  }

  // 2. Detect reminder / calendar
  const reminderMatch = transcript.match(/remind(?:\s+me)?\s+(?:to\s+)?(.+?)(?:on\s+([a-zA-Z]+|\d{4}-\d{2}-\d{2})|tomorrow|today|$)/i);
  if (reminderMatch) {
    const task = (reminderMatch[1] || 'Reminder task').trim();
    const due = todayStr || new Date().toISOString().split('T')[0];
    reminders.push({
      task: task,
      due: due
    });
  }

  // 3. Detect email
  const emailMatch = transcript.match(/(?:send\s+(?:an?\s+)?(?:email|mail)|mail)\s+(?:to\s+)?([a-zA-Z0-9._%+-]+|[a-zA-Z]+)?\s*(?:saying|about|that)?\s*(.+)/i);
  if (emailMatch) {
    const recipient = (emailMatch[1] || 'Colleague').trim();
    const content = (emailMatch[2] || 'Important update').trim();
    const subject = `Update regarding ${content.slice(0, 35)}`;
    const body = `Hi ${recipient},\n\nI am writing to let you know: ${content}\n\nBest regards,`;
    emails.push({
      recipient,
      subject,
      body
    });
  }

  const actions = [];
  if (expenses.length) actions.push(`logged ${expenses[0].amount} for ${expenses[0].item}`);
  if (reminders.length) actions.push(`added reminder to ${reminders[0].task} to calendar`);
  if (emails.length) actions.push(`sent an email to ${emails[0].recipient}`);

  const reply = actions.length > 0
    ? `I have ${actions.join(', and ')}.`
    : "I heard you, but didn't find any expenses, calendar reminders, or emails to take action on.";

  return { expenses, reminders, emails, reply };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    const { transcript, today } = req.body || {};

    if (!transcript || typeof transcript !== 'string' || !transcript.trim()) {
      return res.status(400).json({
        error: 'Missing required field: transcript must be a non-empty string.'
      });
    }

    const todayDate = today || new Date().toISOString().split('T')[0];
    const dayOfWeek = new Date().toLocaleDateString('en-US', { weekday: 'long' });

    let rawParsedData;
    let usedClaude = false;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey && apiKey !== 'your_anthropic_api_key_here') {
      try {
        const anthropic = new Anthropic({ apiKey });

        const systemPrompt = `You are an expert voice action parser for an assistant that handles expenses, calendar events/reminders, and email dispatching.
Current reference date: ${todayDate} (${dayOfWeek}).

Analyze the user's spoken input and return STRICT JSON with this exact schema:
{
  "expenses": [
    {
      "item": "string description",
      "amount": number (positive numeric value),
      "category": "Food | Travel | Groceries | Utilities | Entertainment | Shopping | Health | Other"
    }
  ],
  "reminders": [
    {
      "task": "string task or calendar event title",
      "due": "YYYY-MM-DD" or null (resolve relative dates like 'tomorrow', 'Friday', 'next week' relative to ${todayDate})
    }
  ],
  "emails": [
    {
      "recipient": "person's name or email address if mentioned, else 'recipient'",
      "subject": "concise, contextual professional email subject",
      "body": "well-written, polite email body text composed based on user intent"
    }
  ],
  "reply": "a short 1-2 sentence spoken voice confirmation summarizing what was done (suitable for speech synthesis)"
}

Rules:
1. Handle messy, compound sentences containing multiple actions (e.g. an expense + a reminder + an email).
2. If no expense is mentioned, expenses MUST be [].
3. If no reminder or calendar event is mentioned, reminders MUST be [].
4. If no email or message is mentioned, emails MUST be [].
5. If the user statement has no actionable items (e.g. "what is the time", "hello"), return empty arrays and a friendly reply.
6. Output raw JSON only. Do NOT enclose in markdown code fences (\`\`\`json). No preamble.`;

        const message = await anthropic.messages.create({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 1024,
          temperature: 0,
          system: systemPrompt,
          messages: [{ role: 'user', content: transcript.trim() }]
        });

        const rawOutput = message.content[0]?.text || '';

        // Strip code fences defensively
        let cleanedOutput = rawOutput.trim();
        if (cleanedOutput.startsWith('```json')) {
          cleanedOutput = cleanedOutput.replace(/^```json\s*/, '').replace(/\s*```$/, '');
        } else if (cleanedOutput.startsWith('```')) {
          cleanedOutput = cleanedOutput.replace(/^```\s*/, '').replace(/\s*```$/, '');
        }

        rawParsedData = JSON.parse(cleanedOutput);
        usedClaude = true;
      } catch (claudeErr) {
        console.error('Claude API call error:', claudeErr.message);
        rawParsedData = heuristicFallbackParse(transcript, todayDate);
      }
    } else {
      console.warn('⚠️ ANTHROPIC_API_KEY not found in environment. Using fallback parser.');
      rawParsedData = heuristicFallbackParse(transcript, todayDate);
    }

    // Defensive field normalization
    const expenses = Array.isArray(rawParsedData.expenses)
      ? rawParsedData.expenses
          .filter((e) => e && typeof e.item === 'string' && !isNaN(Number(e.amount)))
          .map((e) => ({
            item: String(e.item).trim(),
            amount: Math.abs(Number(e.amount)),
            category: String(e.category || 'General').trim()
          }))
      : [];

    const rawReminders = Array.isArray(rawParsedData.reminders)
      ? rawParsedData.reminders
          .filter((r) => r && typeof r.task === 'string')
          .map((r) => ({
            task: String(r.task).trim(),
            due: r.due && /^\d{4}-\d{2}-\d{2}$/.test(r.due) ? r.due : null
          }))
      : [];

    const rawEmails = Array.isArray(rawParsedData.emails)
      ? rawParsedData.emails
          .filter((m) => m && typeof m.body === 'string')
          .map((m) => ({
            recipient: String(m.recipient || '').trim(),
            subject: String(m.subject || 'Note from Voice Assistant').trim(),
            body: String(m.body || '').trim()
          }))
      : [];

    // EXECUTE CALENDAR API ACTIONS
    const executedReminders = await Promise.all(
      rawReminders.map(async (r) => {
        try {
          const calendarExecution = await executeCalendarAction({
            task: r.task,
            dueDate: r.due,
            description: `Reminder created by Voice AI Assistant for: ${r.task}`
          });
          return {
            ...r,
            calendarUrl: calendarExecution.calendarUrl || calendarExecution.htmlLink,
            execution: calendarExecution
          };
        } catch (calErr) {
          console.error('Error executing calendar action for reminder:', calErr);
          return {
            ...r,
            execution: { success: false, error: calErr.message }
          };
        }
      })
    );

    // EXECUTE MAIL API ACTIONS
    const executedEmails = await Promise.all(
      rawEmails.map(async (m) => {
        try {
          const mailExecution = await executeMailAction({
            to: m.recipient,
            subject: m.subject,
            body: m.body
          });
          return {
            ...m,
            execution: mailExecution,
            mailtoUrl: mailExecution.mailtoUrl,
            previewUrl: mailExecution.previewUrl
          };
        } catch (mailErr) {
          console.error('Error executing email action:', mailErr);
          return {
            ...m,
            execution: { success: false, error: mailErr.message }
          };
        }
      })
    );

    const reply = typeof rawParsedData.reply === 'string' && rawParsedData.reply.trim()
      ? rawParsedData.reply.trim()
      : 'Processed your voice input successfully.';

    return res.status(200).json({
      expenses,
      reminders: executedReminders,
      emails: executedEmails,
      reply,
      _executionSummary: {
        usedClaude,
        calendarEventsProcessed: executedReminders.length,
        emailsDispatched: executedEmails.length
      }
    });
  } catch (error) {
    console.error('Error in /api/process:', error);
    return res.status(500).json({
      error: 'Failed to process voice command',
      details: error.message || 'Internal server error'
    });
  }
}
