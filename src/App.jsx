import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, AlertTriangle, CheckCircle2, RotateCcw, Volume2, Globe, ShieldCheck } from 'lucide-react';

export default function App() {
  // Voice states: 'idle' | 'listening' | 'processing' | 'speaking'
  const [micState, setMicState] = useState('idle');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [interimText, setInterimText] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [speechSupported, setSpeechSupported] = useState(true);

  // Diagnostics
  const [envDiagnostics, setEnvDiagnostics] = useState({
    isSecureContext: false,
    protocol: '',
    hasSpeechRecognition: false
  });

  const recognitionRef = useRef(null);

  useEffect(() => {
    // 1. Initial environment check
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

  // Set visible error and log to console
  const showError = (msg) => {
    console.error('Mic/Speech Error:', msg);
    setErrorMessage(msg);
  };

  const clearError = () => {
    setErrorMessage('');
  };

  // Explicit getUserMedia permission trigger followed by starting SpeechRecognition
  const startListening = async () => {
    clearError();

    // Check secure context first
    if (!window.isSecureContext) {
      showError(`Insecure Context (${window.location.protocol}): Microphone access requires HTTPS or localhost.`);
      return;
    }

    if (window.location.protocol === 'file:') {
      showError('File Protocol (file://) detected: Speech recognition and mic permissions are blocked on local file protocols. Run via http://localhost:3000.');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showError('Speech recognition is not supported in this browser. Please use Google Chrome or Microsoft Edge.');
      return;
    }

    try {
      // Step 1: Explicitly invoke getUserMedia to guarantee native browser permission prompt
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Immediately stop media stream tracks so SpeechRecognition has exclusive audio input access
      stream.getTracks().forEach((track) => track.stop());
    } catch (err) {
      console.error('getUserMedia error details:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        showError(
          'Microphone permission blocked. Please click the tune/lock icon in your browser address bar (top left), set Microphone to "Allow", and try again.'
        );
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        showError('No microphone detected on your device. Please connect a working mic and retry.');
      } else {
        showError(`Microphone access error (${err.name}): ${err.message || 'Permission denied.'}`);
      }
      return;
    }

    // Step 2: Initialize SpeechRecognition with en-IN
    try {
      // Clean up previous instance if any
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }

      const recognition = new SpeechRecognition();
      recognition.lang = 'en-IN';
      recognition.interimResults = true;
      recognition.continuous = true;
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
          setLiveTranscript((prev) => (prev ? prev.trim() + ' ' + finalSegment.trim() : finalSegment.trim()));
          setInterimText('');
        } else {
          setInterimText(interimSegment);
        }
      };

      recognition.onerror = (event) => {
        console.error('SpeechRecognition onerror event:', event.error);
        if (event.error === 'no-speech') {
          // Keep listening or allow user to speak again
          return;
        }

        if (event.error === 'not-allowed') {
          showError('Microphone permission denied by browser. Click the lock icon in the URL bar to allow microphone access.');
        } else if (event.error === 'audio-capture') {
          showError('No microphone audio input received. Check system sound settings.');
        } else if (event.error === 'network') {
          showError('Speech recognition network error: Ensure you have an active internet connection.');
        } else {
          showError(`Speech recognition error: ${event.error}`);
        }
        setMicState('idle');
      };

      recognition.onend = () => {
        // Recognition completed or stopped
        setMicState('idle');
        setInterimText('');
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
    setLiveTranscript('');
    setInterimText('');
    clearError();
  };

  const handleSampleClick = (sample) => {
    setLiveTranscript(sample);
  };

  return (
    <div className="app-container">
      {/* Protocol Alert if opened as file:// */}
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
            <strong style={{ color: '#fca5a5' }}>Microphone Notice:</strong>
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
          Voice Expense & Reminder Tracker
        </h1>
        <p style={{ color: '#94a3b8', fontSize: '1.05rem', maxWidth: '640px', margin: '0 auto' }}>
          Real-time speech capture (en-IN), defensive Claude JSON extraction, and shared Google Sheets persistence.
        </p>
      </header>

      {/* Stage 2 Core: Voice Interaction Center */}
      <div className="card" style={{ marginBottom: '2rem', position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid #1e293b', paddingBottom: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Mic size={20} color="#3b82f6" /> Stage 2: Real-time Voice Capture
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginTop: '0.2rem' }}>
              Web Speech API (`SpeechRecognition`) with explicit `getUserMedia` permission prompt.
            </p>
          </div>
          <div>
            {micState === 'listening' ? (
              <span className="badge badge-red">
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', animation: 'pulse-ring 1s infinite' }} />
                Listening (en-IN)
              </span>
            ) : micState === 'processing' ? (
              <span className="badge badge-amber">Processing...</span>
            ) : micState === 'speaking' ? (
              <span className="badge badge-green">Speaking Reply</span>
            ) : (
              <span className="badge badge-blue">Ready / Idle</span>
            )}
          </div>
        </div>

        {/* Central Big Mic Button */}
        <div className="mic-button-wrapper">
          <button
            className={`mic-button ${micState}`}
            onClick={handleMicClick}
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
            <span style={{ fontSize: '1.1rem', fontWeight: 700, color: micState === 'listening' ? '#f87171' : '#e2e8f0' }}>
              {micState === 'listening' ? 'Listening... Speak into your mic' : 'Click to Speak'}
            </span>
            <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.25rem' }}>
              Speech engine set to: <strong style={{ color: '#94a3b8' }}>English (India - en-IN)</strong>
            </p>
          </div>
        </div>

        {/* Real-time Live Transcript Card */}
        <div style={{ marginTop: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Live Transcript:
            </label>
            {(liveTranscript || interimText) && (
              <button onClick={handleReset} className="btn-secondary" style={{ padding: '0.35rem 0.75rem', fontSize: '0.8rem' }}>
                <RotateCcw size={14} /> Clear
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
                Your spoken words will appear here in real time as you speak...
              </div>
            )}
          </div>
        </div>

        {/* Clickable Quick Test Samples */}
        <div style={{ marginTop: '1.5rem', borderTop: '1px solid #1e293b', paddingTop: '1.25rem' }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748b', marginBottom: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Sample Hackathon Test Phrases (Click to load):
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
            <button
              className="chip"
              onClick={() => handleSampleClick('Spent 250 rupees on lunch and remind me to submit the form on Friday')}
            >
              "Spent 250 rupees on lunch and remind me to submit the form on Friday"
            </button>
            <button
              className="chip"
              onClick={() => handleSampleClick('Paid 1200 for groceries and remind me to call mom tomorrow at 8 pm')}
            >
              "Paid 1200 for groceries and remind me to call mom tomorrow at 8 pm"
            </button>
            <button
              className="chip"
              onClick={() => handleSampleClick('How is the weather today?')}
            >
              "How is the weather today?" (Non-actionable test)
            </button>
          </div>
        </div>
      </div>

      {/* Roadmap Checklist */}
      <div className="card">
        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#94a3b8', marginBottom: '1.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Hackathon Stage Roadmap
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#10b981' }}>
            <CheckCircle2 size={18} color="#10b981" style={{ flexShrink: 0 }} />
            <span><strong style={{ color: '#e2e8f0' }}>Stage 1:</strong> Project skeleton + deploy hello-world to get live URL early (DONE)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#38bdf8' }}>
            <div style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#0284c7', boxShadow: '0 0 10px #38bdf8', flexShrink: 0 }} />
            <span><strong style={{ color: '#f8fafc' }}>Stage 2:</strong> Explicit getUserMedia mic permission + en-IN SpeechRecognition & real-time transcript (ACTIVE)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#64748b' }}>
            <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: '2px solid #334155', flexShrink: 0 }} />
            <span><strong>Stage 3:</strong> Vercel serverless /api/process endpoint + defensive Claude JSON extraction</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#64748b' }}>
            <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: '2px solid #334155', flexShrink: 0 }} />
            <span><strong>Stage 4:</strong> Google Sheets shared database integration + live table with highlighted rows</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#64748b' }}>
            <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: '2px solid #334155', flexShrink: 0 }} />
            <span><strong>Stage 5:</strong> Voice out (SpeechSynthesis), typed fallback input, and projector-grade error alerts</span>
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
