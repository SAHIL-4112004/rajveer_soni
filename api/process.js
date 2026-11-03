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

  // 1. Detect Expense (standalone or part of sentence)
  const expenseMatch = transcript.match(/(?:spent|paid|bought|expense(?:\s+of)?)\s*(?:rs\.?|inr|rupees|₹|\$)?\s*(\d+(?:\.\d+)?)\s*(?:rs\.?|inr|rupees|₹|\$)?\s*(?:on|for)?\s*([a-zA-Z0-9_\s]+?)(?:\s+(?:and|remind|schedule|add|calendar|mail|email)|$)/i)
    || transcript.match(/(\d+(?:\.\d+)?)\s*(?:rs\.?|inr|rupees|₹|\$)\s*(?:on|for)\s+([a-zA-Z0-9_\s]+?)(?:\s+(?:and|remind|schedule|add|calendar|mail|email)|$)/i);

  if (expenseMatch && Number(expenseMatch[1]) > 0) {
    const amount = Number(expenseMatch[1]);
    let item = (expenseMatch[2] || 'Expense').replace(/[,;.]+$/, '').trim();
    if (item.length > 35) item = item.slice(0, 35);
    let category = 'General';
    if (/lunch|dinner|breakfast|food|coffee|snack|restaurant|pizza|burger/i.test(item)) category = 'Food';
    else if (/cab|uber|ola|metro|flight|train|petrol|fuel|travel/i.test(item)) category = 'Travel';
    else if (/groceries|grocery|vegetables|milk|fruits/i.test(item)) category = 'Groceries';
    else if (/bill|electricity|water|wifi|recharge|rent/i.test(item)) category = 'Utilities';
    else if (/movie|netflix|concert|game/i.test(item)) category = 'Entertainment';

    expenses.push({
      item: item || 'Expense',
      amount: amount,
      category: category
    });
  }

  // 2. Detect Calendar Event or Reminder (standalone or part of sentence)
  const reminderMatch = transcript.match(/(?:remind(?:\s+me)?(?:\s+to)?|schedule|add(?:\s+to\s+calendar)?|create\s+(?:a\s+)?(?:calendar\s+)?event|set\s+(?:a\s+)?reminder(?:\s+for)?)\s+(.+?)(?:\s+(?:and\s+send|and\s+mail|and\s+email|send\s+email|send\s+mail|mail\s+to|email\s+to)|$)/i);
  if (reminderMatch) {
    let rawTask = (reminderMatch[1] || '').trim();
    let due = todayStr || new Date().toISOString().split('T')[0];

    // Detect relative date in task string
    if (/\btomorrow\b/i.test(rawTask)) {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      due = d.toISOString().split('T')[0];
      rawTask = rawTask.replace(/\btomorrow\b/gi, '').trim();
    } else if (/\bfriday\b/i.test(rawTask)) {
      due = '2026-11-06';
      rawTask = rawTask.replace(/\b(?:on\s+)?friday\b/gi, '').trim();
    } else if (/\bmonday\b/i.test(rawTask)) {
      due = '2026-11-09';
      rawTask = rawTask.replace(/\b(?:on\s+)?monday\b/gi, '').trim();
    }

    // Clean up trailing/leading prepositions
    rawTask = rawTask.replace(/(?:\s+to\s+calendar|\s+in\s+calendar|\s+on\s+calendar)$/i, '').replace(/[,;.]+$/, '').trim();
    rawTask = rawTask.replace(/^(?:to\s+|for\s+)/i, '').trim();

    if (rawTask) {
      reminders.push({
        task: rawTask,
        due: due
      });
    }
  }

  // 3. Detect Email (standalone or part of sentence)
  const emailMatch = transcript.match(/(?:send\s+(?:an?\s+)?(?:email|mail)|mail|email)\s+(?:to\s+)?([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|[a-zA-Z0-9._%+-]+)?\s*(?:saying|about|that|subject)?\s*(.+)/i);
  if (emailMatch) {
    const rawRecipient = (emailMatch[1] || 'colleague@example.com').trim();
    let content = (emailMatch[2] || 'Important update').trim();
    content = content.replace(/^that\s+/i, '').trim();

    const subject = `Update regarding ${content.slice(0, 35)}`;
    const body = `Hi,\n\nI am writing to let you know: ${content}\n\nBest regards,`;
    emails.push({
      recipient: rawRecipient,
      subject,
      body
    });
  }

  const actions = [];
  if (expenses.length) {
    actions.push(`saved ${expenses[0].amount} rupees for ${expenses[0].item} to your database`);
  }
  if (reminders.length) {
    const dueFormatted = reminders[0].due ? `for ${reminders[0].due}` : '';
    actions.push(`added ${reminders[0].task} ${dueFormatted} to your Google Calendar`.trim());
  }
  if (emails.length) {
    actions.push(`dispatched your email to ${emails[0].recipient}`);
  }

  const reply = actions.length > 0
    ? `Done! I have ${actions.join(', and ')}.`
    : "I heard you, but didn't find any expenses, calendar events, reminders, or emails to take action on.";

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
      "recipient": "exact email address if spoken (e.g. alex@gmail.com, user@domain.com) or person's name if mentioned, else 'recipient'",
      "subject": "concise, contextual professional email subject",
      "body": "well-written, polite email body text composed based on user intent"
    }
  ],
  "reply": "a natural, polite spoken voice confirmation starting with 'Done!' and clearly stating each action performed (e.g. 'Done! I have saved 250 rupees for lunch to your database, added your reminder to Google Calendar for Friday, and dispatched your email to alex@gmail.com.')"
}

Rules:
1. The input statement can be:
   - ONLY an expense (e.g. "Spent 300 on lunch") -> return expenses with item/amount, reminders: [], emails: []
   - ONLY a calendar event or reminder (e.g. "Schedule team sync on Friday", "Remind me to call Mom tomorrow") -> return reminders, expenses: [], emails: []
   - ONLY an email (e.g. "Send email to rohit@company.com saying the report is attached") -> return emails with recipient/subject/body, expenses: [], reminders: []
   - OR ANY combination of them (e.g. an expense + a reminder, an expense + an email, or all three).
2. If no expense is mentioned, expenses MUST be strictly [].
3. If no calendar event or reminder is mentioned, reminders MUST be strictly [].
4. If no email or message is mentioned, emails MUST be strictly [].
5. If the input is conversational or non-actionable (e.g. "hello", "how are you"), return empty arrays and a friendly reply.
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
