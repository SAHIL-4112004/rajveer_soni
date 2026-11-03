import React, { useState, useEffect } from 'react';
import { Activity, Radio, Database, CheckCircle2, AlertCircle } from 'lucide-react';

export default function App() {
  const [backendStatus, setBackendStatus] = useState({ checking: true, ok: false, message: '' });
  const [speechSupported, setSpeechSupported] = useState(false);

  useEffect(() => {
    // Check Speech Recognition capability in browser
    const hasSpeech = 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window;
    setSpeechSupported(hasSpeech);

    // Ping backend health check
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        setBackendStatus({ checking: false, ok: true, message: data.message || 'Connected' });
      })
      .catch((err) => {
        setBackendStatus({ checking: false, ok: false, message: 'Could not connect to /api/health' });
      });
  }, []);

  return (
    <div className="app-container">
      {/* Header */}
      <header style={{ marginBottom: '2.5rem', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.75rem' }}>
          <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: '#3b82f6', boxShadow: '0 0 10px #3b82f6' }} />
          <span style={{ fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.1em', color: '#94a3b8', textTransform: 'uppercase' }}>
            Voice AI Hackathon Project
          </span>
        </div>
        <h1 style={{ fontSize: '2.4rem', fontWeight: 800, letterSpacing: '-0.03em', color: '#f8fafc', marginBottom: '0.5rem' }}>
          Voice Expense & Reminder Tracker
        </h1>
        <p style={{ color: '#94a3b8', fontSize: '1.05rem', maxWidth: '600px', margin: '0 auto' }}>
          Real-time browser speech capture, defensive Claude JSON extraction, and instant SQLite persistence.
        </p>
      </header>

      {/* Stage 1 Verification Cards */}
      <div className="card" style={{ marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Activity size={20} color="#3b82f6" /> Stage 1: Pipeline Skeleton & Health Checks
        </h2>

        <div className="grid-2">
          {/* Backend Status Card */}
          <div style={{ background: '#0b1120', padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid #1f293d' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontWeight: 600, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Radio size={16} color="#3b82f6" /> Backend Server
              </span>
              {backendStatus.checking ? (
                <span className="badge badge-amber">Checking...</span>
              ) : backendStatus.ok ? (
                <span className="badge badge-green"><CheckCircle2 size={13} /> Connected</span>
              ) : (
                <span className="badge badge-red"><AlertCircle size={13} /> Offline</span>
              )}
            </div>
            <p style={{ fontSize: '0.875rem', color: '#94a3b8' }}>
              Endpoint: <code style={{ color: '#38bdf8' }}>/api/health</code>
            </p>
            <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.25rem' }}>
              {backendStatus.message}
            </p>
          </div>

          {/* Browser Speech API Check */}
          <div style={{ background: '#0b1120', padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid #1f293d' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontWeight: 600, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Activity size={16} color="#10b981" /> Web Speech API
              </span>
              {speechSupported ? (
                <span className="badge badge-green"><CheckCircle2 size={13} /> Supported</span>
              ) : (
                <span className="badge badge-amber"><AlertCircle size={13} /> Need Chrome/Edge</span>
              )}
            </div>
            <p style={{ fontSize: '0.875rem', color: '#94a3b8' }}>
              Browser Speech Recognition engine
            </p>
            <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.25rem' }}>
              {speechSupported ? 'Ready for mic input (Stage 2)' : 'Use Chrome or Edge for SpeechRecognition'}
            </p>
          </div>
        </div>
      </div>

      {/* Stage Roadmap Progress indicator */}
      <div className="card">
        <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#94a3b8', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Deployment Checklist
        </h3>
        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <li style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#e2e8f0' }}>
            <CheckCircle2 size={18} color="#10b981" />
            <span><strong>Stage 1:</strong> Full-stack skeleton + deploy hello-world to get live URL</span>
          </li>
          <li style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#64748b' }}>
            <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: '2px solid #334155' }} />
            <span><strong>Stage 2:</strong> Browser Voice capture (SpeechRecognition) & live on-screen transcript</span>
          </li>
          <li style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#64748b' }}>
            <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: '2px solid #334155' }} />
            <span><strong>Stage 3:</strong> Backend Claude API endpoint with defensive JSON parsing</span>
          </li>
          <li style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#64748b' }}>
            <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: '2px solid #334155' }} />
            <span><strong>Stage 4:</strong> SQLite persistence and auto-updating table</span>
          </li>
          <li style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#64748b' }}>
            <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: '2px solid #334155' }} />
            <span><strong>Stage 5:</strong> Voice reply (SpeechSynthesis), typed fallback, error handling</span>
          </li>
          <li style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#64748b' }}>
            <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: '2px solid #334155' }} />
            <span><strong>Stage 6:</strong> Polish, README, and 3-minute hackathon demo script</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
