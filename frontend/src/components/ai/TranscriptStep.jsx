import React, { useEffect, useRef } from 'react';

const PIPELINE_STEPS = [
  { status: 'downloading', label: 'Downloading audio from video', step: 1 },
  { status: 'transcribing', label: 'Transcribing with Groq whisper-large-v3', step: 2 },
  { status: 'summarizing', label: 'Summarizing with Groq openai/gpt-oss-20b', step: 3 },
  { status: 'extracting', label: 'Extracting structured information', step: 4 },
];

const LANG_MAP = {
  en: 'English', ms: 'Malay', zh: 'Chinese', id: 'Indonesian',
};

export default function TranscriptStep({ jobData, onTranscriptReady, onRetry }) {
  const isProcessing = jobData.status !== 'completed' && jobData.status !== 'error';
  const hasTranscript = !!jobData.transcript;
  const prevStatus = useRef(null);

  useEffect(() => {
    if (hasTranscript && prevStatus.current !== 'done') {
      prevStatus.current = 'done';
    }
  }, [hasTranscript]);

  const copyTranscript = () => {
    if (jobData.transcript) navigator.clipboard.writeText(jobData.transcript);
  };

  return (
    <div className="card">
      <div className="card-title">
        <span>🎙️</span> AI Speech-to-Text Transcription
      </div>
      <div className="card-subtitle">
        Groq whisper-large-v3 is converting the video audio into text.
      </div>

      {/* Progress */}
      <div className="progress-section">
        <div className="progress-label">
          <span>{jobData.step_label || 'Processing…'}</span>
          <strong>{jobData.progress || 0}%</strong>
        </div>
        <div className="progress-bar">
          <div
            className="progress-fill"
            style={{ width: `${jobData.progress || 0}%` }}
          />
        </div>
      </div>

      {/* Step-by-step status */}
      <div className="processing-steps">
        {PIPELINE_STEPS.map((ps) => {
          const isDone = jobData.progress >= (ps.step * 25);
          const isActive = jobData.status === ps.status;
          return (
            <div
              key={ps.status}
              className={`processing-step ${isActive ? 'active' : ''} ${isDone && !isActive ? 'done' : ''}`}
            >
              <span style={{ fontSize: 16, flexShrink: 0 }}>
                {isActive ? <span className="spinner" /> : isDone ? '✅' : '⏳'}
              </span>
              <span style={{ color: isDone ? 'var(--text-primary)' : 'var(--text-muted)', fontSize: 14 }}>
                {ps.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Transcript display */}
      {hasTranscript && (
        <div style={{ marginTop: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
                📄 Transcript
              </div>
              {jobData.detected_language && (
                <div className="language-badge">
                  🌐 Language: {LANG_MAP[jobData.detected_language] || jobData.detected_language.toUpperCase()}
                </div>
              )}
            </div>
            <button id="copy-transcript-btn" className="btn btn-ghost" onClick={copyTranscript} style={{ padding: '8px 14px', fontSize: 13 }}>
              📋 Copy
            </button>
          </div>
          <div className="transcript-box">{jobData.transcript}</div>

          {jobData.status === 'completed' && (
            <div className="action-bar">
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                ✅ Transcript ready — {jobData.transcript.split(' ').length} words
              </span>
              <button id="next-to-summary-btn" className="btn btn-primary" onClick={onTranscriptReady}>
                View Summary →
              </button>
            </div>
          )}
        </div>
      )}

      {jobData.status === 'error' && (
        <div className="error-card mt-6">
          <div className="error-card-icon">❌</div>
          <div className="error-card-body">
            <h3>Processing Error</h3>
            <p>{jobData.error}</p>
            {onRetry && (
              <button className="btn btn-primary" onClick={onRetry} style={{ marginTop: 12 }}>
                ↻ Retry Processing
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
