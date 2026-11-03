import React, { useState, useEffect } from 'react';
import { Activity, Globe, CheckCircle2, AlertTriangle, ShieldCheck, Terminal, Mic } from 'lucide-react';

export default function App() {
  const [apiStatus, setApiStatus] = useState({ loading: true, ok: false, data: null, error: null });
  const [envDiagnostics, setEnvDiagnostics] = useState({
    isSecureContext: false,
    protocol: '',
    hasSpeechRecognition: false,
    isChromeOrEdge: false
  });

  useEffect(() => {
    // 1. Diagnostics: check security context, protocol, and browser capabilities
    const isSecure = window.isSecureContext;
    const protocol = window.location.protocol;
    const hasSpeech = 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
    const isChromium = /Chrome|Edg/.test(navigator.userAgent) && !/Firefox/.test(navigator.userAgent);

    setEnvDiagnostics({
      isSecureContext: isSecure,
      protocol: protocol,
      hasSpeechRecognition: hasSpeech,
      isChromeOrEdge: isChromium
    });

    // 2. Health check ping to Vercel Serverless Function /api/hello
    fetch('/api/hello')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        return res.json();
      })
      .then((data) => {
        setApiStatus({ loading: false, ok: true, data, error: null });
      })
      .catch((err) => {
        console.error('Failed to connect to /api/hello:', err);
        setApiStatus({ loading: false, ok: false, data: null, error: err.message });
      });
  }, []);

  return (
    <div className="app-container">
      {/* Protocol Alert if opened as file:// */}
      {envDiagnostics.protocol === 'file:' && (
        <div className="error-banner">
          <AlertTriangle size={22} color="#ef4444" style={{ flexShrink: 0 }} />
          <div>
            <strong>File Protocol Detected (`file://`):</strong>
            <p style={{ marginTop: '0.25rem', fontSize: '0.9rem' }}>
              Microphone access and serverless API endpoints will not work via local file browsing. Please run the local server or access the Vercel deployed URL via HTTPS.
            </p>
          </div>
        </div>
      )}

      {/* Header */}
      <header style={{ marginBottom: '2.5rem', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
          <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#3b82f6', boxShadow: '0 0 12px #3b82f6' }} />
          <span style={{ fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.12em', color: '#94a3b8', textTransform: 'uppercase' }}>
            Voice AI Hackathon
          </span>
        </div>
        <h1 style={{ fontSize: '2.4rem', fontWeight: 800, letterSpacing: '-0.03em', color: '#f8fafc', marginBottom: '0.5rem' }}>
          Voice Expense & Reminder Tracker
        </h1>
        <p style={{ color: '#94a3b8', fontSize: '1.05rem', maxWidth: '640px', margin: '0 auto' }}>
          Real-time speech capture (en-IN), defensive Claude JSON extraction, and shared Google Sheets persistence.
        </p>
      </header>

      {/* Stage 1 Verification Cards */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid #1e293b', paddingBottom: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Activity size={20} color="#3b82f6" /> Stage 1: Skeleton & Deployment Verification
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginTop: '0.2rem' }}>
              Verifies the Vercel serverless function (`/api/hello`) and browser environment.
            </p>
          </div>
          {apiStatus.ok ? (
            <span className="badge badge-green"><CheckCircle2 size={14} /> System Online</span>
          ) : apiStatus.loading ? (
            <span className="badge badge-amber">Checking...</span>
          ) : (
            <span className="badge badge-red">API Offline</span>
          )}
        </div>

        <div className="grid-2">
          {/* Card 1: Vercel Serverless Endpoint */}
          <div style={{ background: '#070b14', padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid #1e293b' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontWeight: 600, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Globe size={16} color="#3b82f6" /> Serverless API
              </span>
              {apiStatus.loading ? (
                <span className="badge badge-amber">Pinging...</span>
              ) : apiStatus.ok ? (
                <span className="badge badge-green"><CheckCircle2 size={13} /> 200 OK</span>
              ) : (
                <span className="badge badge-red"><AlertTriangle size={13} /> Failed</span>
              )}
            </div>
            <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
              Endpoint: <code style={{ color: '#38bdf8' }}>/api/hello</code>
            </p>
            <div style={{ marginTop: '0.75rem', background: '#0b1120', padding: '0.6rem 0.8rem', borderRadius: '0.4rem', border: '1px solid #1f293d', fontFamily: 'monospace', fontSize: '0.8rem', color: '#cbd5e1' }}>
              {apiStatus.loading && 'Calling endpoint...'}
              {apiStatus.ok && JSON.stringify(apiStatus.data)}
              {apiStatus.error && <span style={{ color: '#f87171' }}>Error: {apiStatus.error}</span>}
            </div>
          </div>

          {/* Card 2: Browser Security & Speech Capabilities */}
          <div style={{ background: '#070b14', padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid #1e293b' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontWeight: 600, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <ShieldCheck size={16} color="#10b981" /> Browser Environment
              </span>
              {envDiagnostics.isSecureContext ? (
                <span className="badge badge-green"><CheckCircle2 size={13} /> Secure</span>
              ) : (
                <span className="badge badge-amber"><AlertTriangle size={13} /> Insecure</span>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.85rem', color: '#94a3b8', marginTop: '0.5rem' }}>
              <div>• Protocol: <strong style={{ color: '#e2e8f0' }}>{envDiagnostics.protocol}</strong></div>
              <div>• Secure Context: <strong style={{ color: envDiagnostics.isSecureContext ? '#34d399' : '#fbbf24' }}>{envDiagnostics.isSecureContext ? 'Yes (HTTPS / Localhost)' : 'No (Microphone blocked)'}</strong></div>
              <div>• SpeechRecognition Engine: <strong style={{ color: envDiagnostics.hasSpeechRecognition ? '#34d399' : '#f87171' }}>{envDiagnostics.hasSpeechRecognition ? 'Available' : 'Missing (Use Chrome / Edge)'}</strong></div>
            </div>
          </div>
        </div>
      </div>

      {/* Roadmap Checklist */}
      <div className="card">
        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#94a3b8', marginBottom: '1.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Hackathon Stage Roadmap
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#e2e8f0' }}>
            <CheckCircle2 size={18} color="#10b981" style={{ flexShrink: 0 }} />
            <span><strong>Stage 1:</strong> Project skeleton + deploy hello-world to get live URL early</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#64748b' }}>
            <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: '2px solid #334155', flexShrink: 0 }} />
            <span><strong>Stage 2:</strong> Explicit getUserMedia mic permission + en-IN SpeechRecognition & live transcript</span>
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
