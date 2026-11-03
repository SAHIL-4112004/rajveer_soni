# 🎙️ Voice Expense, Calendar & Email Tracker
> An autonomous voice-driven productivity companion built for the solo Voice AI Hackathon.
> Captures Indian English voice in the browser, extracts structured data with Claude 3.5, saves to a shared Google Sheet, schedules Google Calendar events, drafts & dispatches emails, and speaks back audio confirmation.

---

## ⚡ Live Features & Capabilities

- **🎙️ Real-Time Voice Input (`en-IN`)**: Uses browser `SpeechRecognition` configured for Indian English with explicit `navigator.mediaDevices.getUserMedia` permission prompting.
- **🧠 Claude 3.5 AI Evaluation**: Analyzes messy, multi-action compound sentences and extracts strictly validated JSON (`expenses`, `reminders`, `emails`, `reply`).
- **📅 Google Calendar Integration**: Automatically creates calendar events with relative date resolution (`"tomorrow"`, `"Friday"`) and provides direct 1-click Google Calendar save actions.
- **✉️ Contextual Email Dispatch**: Analyzes user intent, drafts professional subject lines and email bodies, dispatches via Nodemailer with a live viewable test inbox preview link, and launches native mail clients.
- **📊 Shared Database & Google Sheets**: Appends transactions to a shared Google Spreadsheet (`Expenses` and `Reminders` tabs) with a live, projector-ready table and newly added row highlights.
- **🔊 Spoken Confirmation**: Synthesizes localized natural speech (`SpeechSynthesis`) confirming completed actions.
- **⌨️ Typed Fallback Input**: Full-featured text input box running the identical backend pipeline for demo safety.

---

## 🔍 What is Real vs What is Mocked

Judges appreciate transparency. Here is the honest technical breakdown:

| Capability | Implementation | Status |
| :--- | :--- | :--- |
| **Microphone & Speech-to-Text** | Native Web Speech API (`webkitSpeechRecognition`) with explicit `getUserMedia` permission triggers. | **100% Real** |
| **AI Extraction & Reasoning** | Anthropic Claude 3.5 (`claude-3-5-haiku-20241022`) via `@anthropic-ai/sdk`. | **100% Real** *(includes offline heuristic fallback parser if API key is omitted)* |
| **Calendar Actions** | Google Calendar API (`googleapis`) + RFC-compliant Google Calendar direct action links. | **100% Real** (Clicking opens Google Calendar with title, date, and description prefilled ready to save) |
| **Email Dispatch** | Real SMTP dispatch via `nodemailer`. When custom SMTP is omitted, dispatches to an ephemeral Ethereal inbox returning a real public URL to view the delivered email, plus native `mailto:` launch. | **100% Real** |
| **Shared Database** | Google Sheets v4 API (`googleapis`) with automated tab and header setup (`Expenses` & `Reminders`). Syncs with local persistent store (`data/store.json`). | **100% Real** |
| **Voice Output** | Browser `window.speechSynthesis` with localized `en-IN` voice selection. | **100% Real** |

---

## 🛠️ Architecture & Tech Stack

- **Frontend**: React 18, Vite, Lucide Icons, Custom Projector-Optimized CSS.
- **Serverless Backend**: Vercel Serverless Functions (`/api/process.js`, `/api/calendar.js`, `/api/mail.js`, `/api/records.js`, `/api/sheets.js`, `/api/hello.js`).
- **APIs**:
  - Anthropic Claude 3.5 API (`@anthropic-ai/sdk`)
  - Google Sheets API v4 (`googleapis`)
  - Google Calendar API v3 (`googleapis`)
  - Nodemailer Email Dispatch (`nodemailer`)
  - Web Speech API (`SpeechRecognition` & `SpeechSynthesis`)

---

## 🚀 Quickstart & Local Development

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables (Optional)
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Add your credentials:
```env
# Anthropic Claude API Key (Optional - falls back to offline parser if omitted)
ANTHROPIC_API_KEY=sk-ant-api03-...

# Google Sheets & Calendar (Optional - falls back to shared store & web action links)
GOOGLE_SHEET_ID=your_spreadsheet_id_here
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Custom Email SMTP (Optional - falls back to live Ethereal test inbox)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_gmail_app_password
```

### 3. Run Locally
```bash
npm run dev
```
Open **`http://localhost:3000`** in Google Chrome or Microsoft Edge.

---

## ☁️ Deploying to Vercel (Public Live URL)

Deploy in 45 seconds using the Vercel CLI:
```bash
npx vercel
```
1. Accept the default prompts (**Set up and deploy?** `Y`, **Project name?** `voice-expense-reminder-tracker`, **In which directory?** `./`).
2. Add your environment variables in the **Vercel Dashboard &rarr; Project Settings &rarr; Environment Variables**.
3. Deploy to production:
```bash
npx vercel --prod
```

---

## ⏱️ 3-Minute Hackathon Demo Script

*Designed for maximum punch on a projector in front of hackathon judges.*

### 0:00 - 0:40 | The Hook & The Problem
> *"Hi everyone. Throughout our day, thoughts come at us fast and unstructured: 'Spent 250 on lunch, remind me to submit the deck on Friday, and email Alex that I'm ready.'*
> 
> *Today, managing this requires opening three different apps: an expense tracker, a calendar app, and an email client. You lose context, or worse, you forget.*
> 
> *I built the **Voice Expense, Calendar & Email Tracker**—a zero-friction voice assistant that captures messy compound speech, extracts structured intent with Claude 3.5, and executes REAL actions across all three systems in parallel."*

### 0:40 - 1:45 | The Live Voice Demo
> *(Look at screen on projector, click the central Mic button)*
> 
> **Speak clearly:**
> *"Spent 250 rupees on lunch and remind me to submit the form on Friday and send an email to alex@gmail.com saying the presentation is ready"*
> 
> *(Stop speaking. The words appear live on screen in the transcript box. The button pulses green: "Evaluating with AI...")*
> 
> *(The browser speaks out loud:)*
> 🔊 **"Done! I have saved 250 rupees for lunch to your database, added submit form for Friday to your Google Calendar, and dispatched your email to alex@gmail.com."**
> 
> *(Point to the screen as actions trigger simultaneously)*:
> - *"Notice that a Google Calendar tab has automatically opened with the title, due date (Friday, Nov 6th), and details prefilled."*
> - *"Notice that my default email client opened with the recipient `alex@gmail.com`, subject, and formatted body ready to go."*

### 1:45 - 2:30 | Proof of Real Execution & Shared Database
> *(Scroll down to the Live Records section)*
> 
> - *"Look at the live table: the new expense of ₹250 appears at the top, pulsing with a luminous blue highlight animation. The total running expense sum updated live from ₹1,370 to ₹1,620."*
> - *"Click on **'View Sent Email (Inbox)'**: this opens the actual delivered email in our Mail API test inbox with full HTML headers and timestamp."*
> - *"Click on **'Open Sheet'**: our backend writes these records directly to a shared Google Sheet via the Google Sheets v4 API."*

### 2:30 - 3:00 | Defensive Engineering & Flexibility
> - *"What if the user gives ONLY an expense? Let me click the preset: **`'Spent 450 on dinner'`**—it strictly updates the expense ledger without hallucinating calendar events."*
> - *"What if the microphone fails in a noisy auditorium? We built a full typed fallback box running the exact same serverless pipeline."*
> - *"Everything runs serverless on Vercel with zero client-side API key exposure."*
> 
> *"Thank you! I'm happy to take your questions."*

---

## 📄 License
MIT License. Built for the solo Voice AI Hackathon.
