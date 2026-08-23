import React, { useEffect, useState } from 'react';

export default function SummaryStep({ jobData, summaryValue, onSummaryChange, onNext, onBack }) {
  const [summary, setSummary] = useState(summaryValue || jobData.summary || '');

  useEffect(() => {
    setSummary(summaryValue || jobData.summary || '');
  }, [jobData.job_id, jobData.summary, summaryValue]);

  const updateSummary = (value) => {
    setSummary(value);
    onSummaryChange?.(value);
  };

  const copySummary = () => {
    if (summary) navigator.clipboard.writeText(summary);
  };

  return (
    <div className="card">
      <div className="card-title">
        <span>✨</span> AI Content Summarization
      </div>
      <div className="card-subtitle">
        Groq openai/gpt-oss-20b has analyzed the transcript and produced a concise food content summary.
      </div>

      {/* Model badge */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <div className="language-badge">🤖 openai/gpt-oss-20b</div>
        {jobData.detected_language && (
          <div className="language-badge" style={{ background: 'var(--admin-focus)', borderColor: 'var(--admin-navy)', color: 'var(--admin-navy)' }}>
            🌐 {jobData.detected_language === 'ms' ? 'Malay' : jobData.detected_language === 'en' ? 'English' : jobData.detected_language.toUpperCase()}
          </div>
        )}
        {jobData.title && (
          <div className="language-badge" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: 'var(--admin-success-bg)', borderColor: 'var(--admin-success-text)', color: 'var(--admin-success-text)' }}>
            🎬 {jobData.title}
          </div>
        )}
      </div>

      {/* Summary body */}
      {summary ? (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 12 }}>
            Summary
          </div>
          <textarea
            aria-label="AI review summary"
            className="summary-card"
            value={summary}
            onChange={(event) => updateSummary(event.target.value)}
            style={{ width: '100%', minHeight: 150, resize: 'vertical', fontFamily: 'inherit' }}
          />

          <div className="action-bar">
            <button id="back-to-transcript-btn" className="btn btn-ghost" onClick={onBack}>
              ← Transcript
            </button>
            <div className="action-bar-right">
              <button id="copy-summary-btn" className="btn btn-ghost" onClick={copySummary}>
                📋 Copy
              </button>
              <button id="next-to-extraction-btn" className="btn btn-primary" onClick={onNext}>
                View Extraction →
              </button>
            </div>
          </div>
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
          <p>Summary is being generated…</p>
        </div>
      )}
    </div>
  );
}
