import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

dotenv.config();

// Helper to generate Google Calendar event link
function createGoogleCalendarUrl(task, dueDate) {
  if (!dueDate) return null;
  const cleanDate = dueDate.replace(/-/g, '');
  const start = `${cleanDate}T090000Z`;
  const end = `${cleanDate}T100000Z`;
  const text = encodeURIComponent(task);
  const details = encodeURIComponent(`Created by Voice AI Tracker on ${dueDate}`);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${start}/${end}&details=${details}`;
}

// Helper to generate mailto URL
function createMailtoUrl(recipient, subject, body) {
  const encTo = encodeURIComponent(recipient && recipient !== 'recipient' ? recipient : '');
  const encSubject = encodeURIComponent(subject || '');
  const encBody = encodeURIComponent(body || '');
  return `mailto:${encTo}?subject=${encSubject}&body=${encBody}`;
}

// Fallback heuristic parser if ANTHROPIC_API_KEY is not yet configured
function heuristicFallbackParse(transcript, todayStr) {
  const lower = (transcript || '').toLowerCase();
  const expenses = [];
  const reminders = [];
  const emails = [];

  // 1. Detect expense: look for number followed or preceded by rupees, rs, bucks, dollars
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
    // Default to today + 3 days or today
    const due = todayStr || new Date().toISOString().split('T')[0];
    reminders.push({
      task: task,
      due: due,
      calendarUrl: createGoogleCalendarUrl(task, due)
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
      body,
      mailtoUrl: createMailtoUrl(recipient, subject, body)
    });
  }

  const actions = [];
  if (expenses.length) actions.push(`logged ${expenses[0].amount} for ${expenses[0].item}`);
  if (reminders.length) actions.push(`added reminder to ${reminders[0].task}`);
  if (emails.length) actions.push(`drafted an email to ${emails[0].recipient}`);

  const reply = actions.length > 0
    ? `I have ${actions.join(', and ')}.`
    : "I heard you, but didn't find any expenses, calendar reminders, or emails to take action on.";

  return { expenses, reminders, emails, reply };
}

export default async function handler(req, res) {
  // Only accept POST
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

    // Check for Anthropic API Key
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey || apiKey === 'your_anthropic_api_key_here') {
      console.warn('⚠️ ANTHROPIC_API_KEY not found in environment. Using robust heuristic fallback parser.');
      const parsedFallback = heuristicFallbackParse(transcript, todayDate);
      return res.status(200).json({
        ...parsedFallback,
        _notice: 'Processed via offline fallback parser. Add ANTHROPIC_API_KEY to .env to use Claude 3.5.'
      });
    }

    // Call Anthropic Claude API
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
      messages: [
        {
          role: 'user',
          content: transcript.trim()
        }
      ]
    });

    const rawOutput = message.content[0]?.text || '';

    // Defensive parsing: strip code fences and trim whitespace
    let cleanedOutput = rawOutput.trim();
    if (cleanedOutput.startsWith('```json')) {
      cleanedOutput = cleanedOutput.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleanedOutput.startsWith('```')) {
      cleanedOutput = cleanedOutput.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    let parsedData;
    try {
      parsedData = JSON.parse(cleanedOutput);
    } catch (parseError) {
      console.error('Claude output JSON parse error:', parseError, 'Raw output:', rawOutput);
      // Fallback extraction
      parsedData = heuristicFallbackParse(transcript, todayDate);
    }

    // Defensive validation & enrichment
    const expenses = Array.isArray(parsedData.expenses)
      ? parsedData.expenses
          .filter((e) => e && typeof e.item === 'string' && !isNaN(Number(e.amount)))
          .map((e) => ({
            item: String(e.item).trim(),
            amount: Math.abs(Number(e.amount)),
            category: String(e.category || 'General').trim()
          }))
      : [];

    const reminders = Array.isArray(parsedData.reminders)
      ? parsedData.reminders
          .filter((r) => r && typeof r.task === 'string')
          .map((r) => {
            const task = String(r.task).trim();
            const due = r.due && /^\d{4}-\d{2}-\d{2}$/.test(r.due) ? r.due : null;
            return {
              task,
              due,
              calendarUrl: createGoogleCalendarUrl(task, due)
            };
          })
      : [];

    const emails = Array.isArray(parsedData.emails)
      ? parsedData.emails
          .filter((m) => m && typeof m.body === 'string')
          .map((m) => {
            const recipient = String(m.recipient || '').trim();
            const subject = String(m.subject || 'Note from Voice Assistant').trim();
            const body = String(m.body || '').trim();
            return {
              recipient,
              subject,
              body,
              mailtoUrl: createMailtoUrl(recipient, subject, body)
            };
          })
      : [];

    const reply = typeof parsedData.reply === 'string' && parsedData.reply.trim()
      ? parsedData.reply.trim()
      : 'Processed your voice input successfully.';

    return res.status(200).json({
      expenses,
      reminders,
      emails,
      reply
    });
  } catch (error) {
    console.error('Error in /api/process:', error);
    return res.status(500).json({
      error: 'Failed to process voice command',
      details: error.message || 'Internal server error'
    });
  }
}
