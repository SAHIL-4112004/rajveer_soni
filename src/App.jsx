import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  AlertTriangle,
  CheckCircle2,
  RotateCcw,
  Calendar,
  Mail,
  Receipt,
  Send,
  Volume2,
  ExternalLink,
  Code2,
  Sparkles,
  ArrowRight
} from 'lucide-react';

export default function App() {
  // Voice states: 'idle' | 'listening' | 'processing' | 'speaking'
  const [micState, setMicState] = useState('idle');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [interimText, setInterimText] = useState('');
  const [typedInput, setTypedInput] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [speechSupported, setSpeechSupported] = useState(true);

  // Evaluated results from backend
  const [evaluatedResult, setEvaluatedResult] = useState(null);
  const [showJson, setShowJson] = useState(false);

  // Diagnostics
  const [envDiagnostics, setEnvDiagnostics] = useState({
    isSecureContext: false,
    protocol: '',
    hasSpeechRecognition: false
  });

  const recognitionRef = useRef(null);

  useEffect(() => {
    const isSecure = window.isSecureContext;
    const protocol = window.location.protocol;
    const hasSpeech = 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;

    setEnvDiagnostics({
      isSecureContext: isSecure,
      protocol: protocol,
      hasSpeechRecognition: hasSpeech
    });

    if (!hasSpeech) {
      setSpeechSupported(false);
      const msg = 'Speech Recognition API is not supported in this browser. Please use Google Chrome or Microsoft Edge.';
      setErrorMessage(msg);
      console.error('SpeechRecognition unsupported:', msg);
    }
  }, []);

  const showError = (msg) => {
    console.error('App Notice:', msg);
    setErrorMessage(msg);
  };

  const clearError = () => {
    setErrorMessage('');
  };

  // Browser SpeechSynthesis text-to-speech
  const speakReply = (text) => {
    if (!('speechSynthesis' in window) || !text) return;
    try {
      window.speechSynthesis.cancel(); // Stop any pending utterances
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.lang = 'en-IN';

      setMicState('speaking');

      utterance.onend = () => {
        setMicState('idle');
      };
      utterance.onerror = (e) => {
        console.error('SpeechSynthesis error:', e);
        setMicState('idle');
      };

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.error('SpeechSynthesis error:', err);
      setMicState('idle');
    }
  };

  // Backend /api/process invocation
  const processStatement = async (textToProcess) => {
    const text = (textToProcess || liveTranscript || typedInput || '').trim();
    if (!text) {
      showError('Please speak or type a statement to evaluate.');
      return;
    }

    clearError();
    setMicState('processing');

    try {
      const today = new Date().toISOString().split('T')[0];
      const res = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: text, today })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error ${res.status}`);
      }

      const data = await res.json();
      setEvaluatedResult(data);

      // Trigger voice output reply
      if (data.reply) {
        speakReply(data.reply);
      } else {
        setMicState('idle');
      }
    } catch (err) {
      console.error('Evaluation API error:', err);
      showError(`Evaluation failed: ${err.message}`);
      setMicState('idle');
    }
  };

  // Explicit getUserMedia permission trigger followed by starting SpeechRecognition
  const startListening = async () => {
    clearError();

    if (!window.isSecureContext) {
      showError(`Insecure Context (${window.location.protocol}): Microphone access requires HTTPS or localhost.`);
      return;
    }

    if (window.location.protocol === 'file:') {
      showError('File Protocol (file://) detected: Speech recognition is blocked on local file protocols. Run via http://localhost:3000.');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showError('Speech recognition is not supported in this browser. Please use Google Chrome or Microsoft Edge.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
    } catch (err) {
      console.error('getUserMedia error details:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        showError(
          'Microphone permission blocked. Click the tune/lock icon in your browser address bar (top left), set Microphone to "Allow", and try again.'
        );
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        showError('No microphone detected on your device. Please connect a working mic and retry.');
      } else {
        showError(`Microphone access error (${err.name}): ${err.message || 'Permission denied.'}`);
      }
      return;
    }

    try {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }

      const recognition = new SpeechRecognition();
      recognition.lang = 'en-IN';
      recognition.interimResults = true;
      recognition.continuous = false; // Auto-finishes when user stops talking
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setMicState('listening');
        setInterimText('');
      };

      recognition.onresult = (event) => {
        let finalSegment = '';
        let interimSegment = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const item = event.results[i];
          const text = item[0].transcript;
          if (item.isFinal) {
            finalSegment += text + ' ';
          } else {
            interimSegment += text;
          }
        }

        if (finalSegment) {
          const completeText = finalSegment.trim();
          setLiveTranscript(completeText);
          setInterimText('');
          // Automatically evaluate when final utterance finishes
          processStatement(completeText);
        } else {
          setInterimText(interimSegment);
        }
      };

      recognition.onerror = (event) => {
        console.error('SpeechRecognition error:', event.error);
        if (event.error !== 'no-speech') {
          showError(`Speech recognition error: ${event.error}`);
        }
        setMicState('idle');
      };

      recognition.onend = () => {
        if (micState === 'listening') {
          setMicState('idle');
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error('Failed to start SpeechRecognition:', err);
      showError(`Could not start speech recognition: ${err.message}`);
      setMicState('idle');
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        console.error('Error stopping recognition:', e);
      }
    }
    setMicState('idle');
    setInterimText('');
  };

  const handleMicClick = () => {
    if (micState === 'listening') {
      stopListening();
    } else {
      startListening();
    }
  };

  const handleReset = () => {
    stopListening();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setLiveTranscript('');
    setInterimText('');
    setTypedInput('');
    setEvaluatedResult(null);
    clearError();
  };

  const handleSampleClick = (sample) => {
    setLiveTranscript(sample);
    setTypedInput(sample);
    processStatement(sample);
  };

  const handleTypedSubmit = (e) => {
    e.preventDefault();
    if (typedInput.trim()) {
      setLiveTranscript(typedInput.trim());
      processStatement(typedInput.trim());
    }
  };

  return (
    <div className="app-container">
      {/* File Protocol Warning */}
      {envDiagnostics.protocol === 'file:' && (
        <div className="error-banner">
          <AlertTriangle size={24} color="#ef4444" style={{ flexShrink: 0 }} />
          <div>
            <strong>File Protocol Detected (`file://`):</strong>
            <p style={{ marginTop: '0.25rem', fontSize: '0.9rem' }}>
              Microphone access is blocked on file URLs. Please open via{' '}
              <a href="http://localhost:3000" style={{ color: '#60a5fa', textDecoration: 'underline' }}>
                http://localhost:3000
              </a>{' '}
              or your deployed HTTPS URL.
            </p>
          </div>
        </div>
      )}

      {/* Visible Error Message */}
      {errorMessage && (
        <div className="error-banner">
          <AlertTriangle size={24} color="#ef4444" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <strong style={{ color: '#fca5a5' }}>Notice:</strong>
            <p style={{ marginTop: '0.2rem', color: '#fecaca', fontSize: '0.95rem' }}>{errorMessage}</p>
          </div>
          <button
            onClick={clearError}
            style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', fontWeight: 'bold' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Header */}
      <header style={{ marginBottom: '2rem', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
          <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#3b82f6', boxShadow: '0 0 12px #3b82f6' }} />
          <span style={{ fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.12em', color: '#94a3b8', textTransform: 'uppercase' }}>
            Voice AI Hackathon
          </span>
        </div>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 800, letterSpacing: '-0.03em', color: '#f8fafc', marginBottom: '0.5rem' }}>
          Voice Expense, Calendar & Email Tracker
        </h1>
        <p style={{ color: '#94a3b8', fontSize: '1.05rem', maxWidth: '680px', margin: '0 auto' }}>
          Speaks Indian English (en-IN), evaluates with Claude AI, adds calendar events, and drafts contextual emails.
        </p>
      </header>

      {/* Voice & Input Interaction Card */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid #1e293b', paddingBottom: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Mic size={20} color="#3b82f6" /> Voice Input & Live Evaluation
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginTop: '0.2rem' }}>
              Speak or type: extracts expenses, creates calendar events, and prepares emails.
            </p>
          </div>
          <div>
            {micState === 'listening' ? (
              <span className="badge badge-red">
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', animation: 'pulse-ring 1s infinite' }} />
                Listening (en-IN)
              </span>
            ) : micState === 'processing' ? (
              <span className="badge badge-amber">Evaluating with AI...</span>
            ) : micState === 'speaking' ? (
              <span className="badge badge-green">
                <Volume2 size={14} /> Speaking Confirmation
              </span>
            ) : (
              <span className="badge badge-blue">Ready</span>
            )}
          </div>
        </div>

        {/* Central Big Mic Button */}
        <div className="mic-button-wrapper">
          <button
            className={`mic-button ${micState}`}
            onClick={handleMicClick}
            disabled={micState === 'processing'}
            title={micState === 'listening' ? 'Click to stop listening' : 'Click to start voice input'}
            aria-label="Microphone Voice Input"
          >
            {micState === 'listening' ? (
              <MicOff size={48} color="#ffffff" />
            ) : (
              <Mic size={48} color="#ffffff" />
            )}
          </button>
          <div style={{ marginTop: '1.25rem', textAlign: 'center' }}>
            <span style={{ fontSize: '1.15rem', fontWeight: 700, color: micState === 'listening' ? '#f87171' : '#e2e8f0' }}>
              {micState === 'listening' ? 'Listening... Speak now' : micState === 'processing' ? 'Processing with Claude...' : 'Click to Speak'}
            </span>
            <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.25rem' }}>
              Language: <strong style={{ color: '#94a3b8' }}>English (India - en-IN)</strong>
            </p>
          </div>
        </div>

        {/* Live Transcript Display */}
        <div style={{ marginTop: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Live Transcript:
            </label>
            {(liveTranscript || interimText || evaluatedResult) && (
              <button onClick={handleReset} className="btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}>
                <RotateCcw size={14} /> Reset
              </button>
            )}
          </div>

          <div className={`transcript-box ${micState === 'listening' ? 'listening' : ''}`}>
            {liveTranscript || interimText ? (
              <div className="transcript-text">
                {liveTranscript}
                {interimText && <span style={{ color: '#93c5fd', fontStyle: 'italic' }}> {interimText}</span>}
              </div>
            ) : (
              <div className="transcript-placeholder">
                Click the microphone to speak, or type in the fallback box below...
              </div>
            )}
          </div>
        </div>

        {/* Typed Fallback Input (for hackathon demo safety) */}
        <form onSubmit={handleTypedSubmit} style={{ marginTop: '1.25rem', display: 'flex', gap: '0.75rem' }}>
          <input
            type="text"
            className="input-text"
            placeholder="Typed fallback: e.g. Spent 250 on lunch, remind me to submit form on Friday, email Alex"
            value={typedInput}
            onChange={(e) => setTypedInput(e.target.value)}
          />
          <button
            type="submit"
            className="btn-primary"
            disabled={micState === 'processing' || !typedInput.trim()}
            style={{ whiteSpace: 'nowrap' }}
          >
            <Send size={16} /> Evaluate
          </button>
        </form>

        {/* Quick Test Sample Chips */}
        <div style={{ marginTop: '1.5rem', borderTop: '1px solid #1e293b', paddingTop: '1.25rem' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Clickable Hackathon Demo Presets:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
            <button
              className="chip"
              onClick={() =>
                handleSampleClick(
                  'Spent 250 rupees on lunch and remind me to submit the form on Friday and send an email to Alex saying the presentation is ready'
                )
              }
            >
              💼 All-in-One: Expense + Calendar + Email
            </button>
            <button
              className="chip"
              onClick={() => handleSampleClick('Paid 1200 for groceries and remind me to call doctor tomorrow at 10 am')}
            >
              📅 Expense + Calendar Event
            </button>
            <button
              className="chip"
              onClick={() => handleSampleClick('Send an email to Rahul saying I will be 15 minutes late to the meeting')}
            >
              ✉️ Email Dispatch Only
            </button>
            <button
              className="chip"
              onClick={() => handleSampleClick('Hello assistant how is everything going')}
            >
              💬 Non-actionable input
            </button>
          </div>
        </div>
      </div>

      {/* Evaluated Actions Result Section */}
      {evaluatedResult && (
        <div className="card" style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid #1e293b', paddingBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <Sparkles size={22} color="#10b981" />
              <h2 style={{ fontSize: '1.3rem', fontWeight: 700 }}>AI Evaluated Actions & Real Execution</h2>
            </div>
            <button
              className="btn-secondary"
              onClick={() => setShowJson(!showJson)}
              style={{ fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
            >
              <Code2 size={14} /> {showJson ? 'Hide JSON' : 'Inspect JSON'}
            </button>
          </div>

          {/* Spoken Voice Confirmation Box */}
          {evaluatedResult.reply && (
            <div
              style={{
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1), rgba(6, 95, 70, 0.15))',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '0.75rem',
                padding: '1.25rem',
                marginBottom: '1.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Volume2 size={24} color="#34d399" style={{ flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Spoken Voice Reply:
                  </div>
                  <div style={{ fontSize: '1.1rem', color: '#f8fafc', fontWeight: 500, marginTop: '0.2rem' }}>
                    "{evaluatedResult.reply}"
                  </div>
                </div>
              </div>
              <button
                className="btn-secondary"
                onClick={() => speakReply(evaluatedResult.reply)}
                title="Play speech again"
                style={{ flexShrink: 0 }}
              >
                <Volume2 size={16} /> Replay
              </button>
            </div>
          )}

          {/* Notice if running on fallback */}
          {evaluatedResult._notice && (
            <div style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '0.5rem', padding: '0.75rem 1rem', marginBottom: '1.25rem', fontSize: '0.85rem', color: '#fbbf24' }}>
              ℹ️ {evaluatedResult._notice}
            </div>
          )}

          {/* Action Grid: Expenses, Reminders/Calendar, Emails */}
          <div className="grid-2">
            {/* 1. Expenses Table */}
            <div style={{ background: '#0b1120', padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid #1e293b' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                <span style={{ fontWeight: 700, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Receipt size={18} color="#38bdf8" /> Captured Expenses ({evaluatedResult.expenses?.length || 0})
                </span>
                {evaluatedResult.expenses?.length > 0 && (
                  <span className="badge badge-blue">
                    Total: ₹{evaluatedResult.expenses.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)}
                  </span>
                )}
              </div>

              {evaluatedResult.expenses?.length > 0 ? (
                <div className="data-table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Category</th>
                        <th style={{ textAlign: 'right' }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {evaluatedResult.expenses.map((exp, idx) => (
                        <tr key={idx} className="highlight-new">
                          <td style={{ fontWeight: 600 }}>{exp.item}</td>
                          <td><span className="badge badge-blue">{exp.category}</span></td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: '#38bdf8' }}>₹{exp.amount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p style={{ fontSize: '0.9rem', color: '#64748b', fontStyle: 'italic', padding: '0.5rem 0' }}>
                  No expenses detected in this statement.
                </p>
              )}
            </div>

            {/* 2. Calendar / Reminders Action */}
            <div style={{ background: '#0b1120', padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid #1e293b' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                <span style={{ fontWeight: 700, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Calendar size={18} color="#a855f7" /> Calendar & Reminders ({evaluatedResult.reminders?.length || 0})
                </span>
              </div>

              {evaluatedResult.reminders?.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {evaluatedResult.reminders.map((rem, idx) => (
                    <div
                      key={idx}
                      style={{
                        background: '#070c18',
                        padding: '1rem',
                        borderRadius: '0.5rem',
                        border: '1px solid #1e293b',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '0.75rem'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: '1rem' }}>{rem.task}</div>
                        <div style={{ fontSize: '0.85rem', color: '#c084fc', marginTop: '0.2rem' }}>
                          Due: {rem.due || 'No date specified'}
                        </div>
                      </div>
                      {rem.calendarUrl && (
                        <a
                          href={rem.calendarUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-primary"
                          style={{
                            padding: '0.45rem 0.85rem',
                            fontSize: '0.85rem',
                            background: '#9333ea',
                            textDecoration: 'none'
                          }}
                        >
                          Add to Calendar <ExternalLink size={14} />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: '0.9rem', color: '#64748b', fontStyle: 'italic', padding: '0.5rem 0' }}>
                  No calendar events or reminders detected.
                </p>
              )}
            </div>
          </div>

          {/* 3. Generated Email Dispatch Card */}
          <div style={{ marginTop: '1.5rem', background: '#0b1120', padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid #1e293b' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
              <span style={{ fontWeight: 700, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Mail size={18} color="#10b981" /> AI Generated Emails ({evaluatedResult.emails?.length || 0})
              </span>
            </div>

            {evaluatedResult.emails?.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {evaluatedResult.emails.map((mail, idx) => (
                  <div
                    key={idx}
                    style={{
                      background: '#070c18',
                      padding: '1.25rem',
                      borderRadius: '0.5rem',
                      border: '1px solid #1e293b'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <div style={{ fontSize: '0.9rem', color: '#94a3b8' }}>
                        To: <strong style={{ color: '#f8fafc' }}>{mail.recipient || 'Recipient'}</strong>
                      </div>
                      {mail.mailtoUrl && (
                        <a
                          href={mail.mailtoUrl}
                          className="btn-primary"
                          style={{
                            padding: '0.4rem 0.85rem',
                            fontSize: '0.85rem',
                            background: '#059669',
                            textDecoration: 'none'
                          }}
                        >
                          <Send size={14} /> Open in Email App
                        </a>
                      )}
                    </div>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: '#34d399', marginBottom: '0.5rem' }}>
                      Subject: {mail.subject}
                    </div>
                    <div
                      style={{
                        background: '#040711',
                        padding: '0.85rem 1rem',
                        borderRadius: '0.4rem',
                        fontSize: '0.9rem',
                        color: '#cbd5e1',
                        whiteSpace: 'pre-line',
                        border: '1px solid #172554'
                      }}
                    >
                      {mail.body}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ fontSize: '0.9rem', color: '#64748b', fontStyle: 'italic', padding: '0.5rem 0' }}>
                No email requests detected in this statement.
              </p>
            )}
          </div>

          {/* JSON Inspector Collapsible */}
          {showJson && (
            <div style={{ marginTop: '1.5rem', background: '#040711', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #1e293b' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                Validated JSON Output from Backend:
              </div>
              <pre style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#38bdf8', overflowX: 'auto', margin: 0 }}>
                {JSON.stringify(evaluatedResult, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Stage Roadmap Progress Card */}
      <div className="card">
        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#94a3b8', marginBottom: '1.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Hackathon Stage Roadmap
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#10b981' }}>
            <CheckCircle2 size={18} color="#10b981" style={{ flexShrink: 0 }} />
            <span><strong style={{ color: '#e2e8f0' }}>Stage 1:</strong> Project skeleton + deploy hello-world to get live URL early (DONE)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#10b981' }}>
            <CheckCircle2 size={18} color="#10b981" style={{ flexShrink: 0 }} />
            <span><strong style={{ color: '#e2e8f0' }}>Stage 2:</strong> Explicit getUserMedia mic permission + en-IN SpeechRecognition & real-time transcript (DONE)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#38bdf8' }}>
            <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#0284c7', boxShadow: '0 0 10px #38bdf8', flexShrink: 0 }} />
            <span><strong style={{ color: '#f8fafc' }}>Stage 3:</strong> Vercel serverless /api/process + Claude evaluation + Calendar & Email dispatch (ACTIVE)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#64748b' }}>
            <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: '2px solid #334155', flexShrink: 0 }} />
            <span><strong>Stage 4:</strong> Google Sheets shared database integration + live table with highlighted rows</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#64748b' }}>
            <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: '2px solid #334155', flexShrink: 0 }} />
            <span><strong>Stage 5:</strong> Voice out, typed fallback, projector-grade error alerts</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#64748b' }}>
            <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: '2px solid #334155', flexShrink: 0 }} />
            <span><strong>Stage 6:</strong> Polish, README (real vs mocked), and 3-minute hackathon demo script</span>
          </div>
        </div>
      </div>
    </div>
  );
}
