import React, { useEffect, useState } from 'react';
import { normalizeExtracted, normalizeTextList } from '../../lib/aiReview';
import { downloadJobCsv } from '../../api/ai';

const FIELD_CONFIG = [
  { key: 'vendor_name', label: '🏪 Vendor Name', placeholder: 'Vendor name' },
  { key: 'address', label: '📍 Address', placeholder: 'Street address or landmark' },
  { key: 'city', label: '🏙️ City', placeholder: 'Melaka' },
  { key: 'state', label: '🗺️ State', placeholder: 'Melaka' },
  { key: 'price_range', label: '💰 Price Range', placeholder: 'e.g. RM10–20 per person' },
  { key: 'operating_hours_raw', label: '🕐 Operating Hours', placeholder: 'e.g. 9am–10pm daily' },
];

function EditableField({ label, value, placeholder, multiline = false, onChange }) {
  const sharedStyle = {
    marginTop: 6,
    padding: '7px 10px',
    borderRadius: 8,
    border: '1px dashed var(--border)',
    background: 'rgba(255,255,255,0.04)',
    color: 'var(--text-primary)',
    fontSize: 13,
    width: '100%',
    outline: 'none',
    fontFamily: 'inherit',
    resize: multiline ? 'vertical' : 'none',
  };

  return (
    <div className="extraction-field">
      <div className="extraction-field-label">{label}</div>
      {multiline ? (
        <textarea value={value || ''} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} style={sharedStyle} rows={3} />
      ) : (
        <input type="text" value={value || ''} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} style={sharedStyle} />
      )}
    </div>
  );
}

export default function ExtractionStep({ jobData, reviewSummary, onBack, onReset, onCreateDraft }) {
  const extracted = jobData.extracted || {};
  const [draft, setDraft] = useState(() => normalizeExtracted(extracted));
  const [saveState, setSaveState] = useState({ status: 'idle', candidates: [], message: '' });

  useEffect(() => {
    setDraft(normalizeExtracted(jobData.extracted || {}));
    setSaveState({ status: 'idle', candidates: [], message: '' });
  }, [jobData.job_id, jobData.extracted]);

  const setField = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const setListField = (key, value) => setField(key, normalizeTextList(value));

  const mergedRecord = {
    ...extracted,
    ...draft,
    cuisine_types: draft.cuisine_types || [],
    signature_dishes: draft.signature_dishes || [],
  };

  const downloadCSV = async () => {
    const vendorName = (mergedRecord.vendor_name || 'vendor').replace(/[^a-zA-Z0-9]/g, '_');
    try {
      await downloadJobCsv(jobData.job_id, `${vendorName}.csv`);
    } catch { /* ignore */ }
  };

  const createDraft = async (duplicateAcknowledged = false) => {
    if (!onCreateDraft) {
      setSaveState({ status: 'error', candidates: [], message: 'Draft creation is available from the administrator console.' });
      return;
    }
    setSaveState({ status: 'saving', candidates: [], message: '' });
    try {
      const result = await onCreateDraft({
        summary: reviewSummary,
        extracted: mergedRecord,
        duplicate_acknowledged: duplicateAcknowledged,
      });
      if (result.status === 'duplicate_review_required') {
        setSaveState({ status: 'duplicate', candidates: result.candidates || [], message: '' });
        return;
      }
      setSaveState({ status: 'saved', candidates: [], message: 'Draft vendor record created.' });
    } catch (error) {
      setSaveState({ status: 'error', candidates: [], message: error.message || 'Unable to create draft vendor.' });
    }
  };

  return (
    <div className="card">
      <div className="card-title">
        <span>📋</span> Information Extraction
      </div>
      <div className="card-subtitle">
        Structured eatery data extracted from the transcript by Groq openai/gpt-oss-20b.
      </div>

      {draft.is_in_malacca !== undefined && (
        <div style={{ marginBottom: 20 }}>
          <span style={{
            padding: '6px 12px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
              backgroundColor: draft.is_in_malacca ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.05)',
              color: draft.is_in_malacca ? 'var(--success)' : 'var(--text-muted)',
            }}>
              {draft.is_in_malacca ? '📍 Verified Malacca Location' : '⚠️ Not in Malacca'}
            </span>
        </div>
      )}

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 10 }}>
          🍜 Cuisine Types
        </div>
        <div className="dishes-list">
          {(draft.cuisine_types || []).map((cuisine, i) => <span key={`${cuisine}-${i}`} className="dish-tag" style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}>{cuisine}</span>)}
        </div>
        <input
          aria-label="Cuisine types"
          type="text"
          value={(draft.cuisine_types || []).join(', ')}
          onChange={(event) => setListField('cuisine_types', event.target.value)}
          placeholder="e.g. Nyonya, Malaysian"
          style={{ marginTop: 8, padding: '7px 10px', borderRadius: 8, border: '1px dashed var(--border)', background: 'rgba(255,255,255,0.04)', color: 'var(--text-primary)', fontSize: 13, width: '100%', outline: 'none' }}
        />
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.7px', marginBottom: 10 }}>
          🍽️ Signature Dishes
        </div>
        <div className="dishes-list">
          {(draft.signature_dishes || []).map((dish, i) => <span key={`${dish}-${i}`} className="dish-tag">{dish}</span>)}
        </div>
        <input
          aria-label="Signature dishes"
          type="text"
          value={(draft.signature_dishes || []).join(', ')}
          onChange={(event) => setListField('signature_dishes', event.target.value)}
          placeholder="e.g. Chicken rice, Cendol"
          style={{ marginTop: 8, padding: '7px 10px', borderRadius: 8, border: '1px dashed var(--border)', background: 'rgba(255,255,255,0.04)', color: 'var(--text-primary)', fontSize: 13, width: '100%', outline: 'none' }}
        />
      </div>

      <div className="extraction-grid" style={{ marginBottom: 14 }}>
        {FIELD_CONFIG.map((field) => (
          <EditableField
            key={field.key}
            label={field.label}
            value={draft[field.key]}
            placeholder={field.placeholder}
            onChange={(value) => setField(field.key, value)}
          />
        ))}
      </div>

      <EditableField
        label="📝 Special Notes"
        value={draft.special_notes}
        placeholder="Add important tips, warnings, or highlights"
        multiline
        onChange={(value) => setField('special_notes', value)}
      />

      {saveState.status === 'duplicate' && (
        <div className="error-card" style={{ marginTop: 18 }}>
          <div className="error-card-icon">⚠️</div>
          <div className="error-card-body">
            <h3>Possible duplicate vendor</h3>
            <p style={{ fontFamily: 'inherit' }}>Review the existing record before creating this draft.</p>
            {saveState.candidates.map((candidate) => (
              <div key={candidate.id || candidate.vendor_name} style={{ marginTop: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
                <strong>{candidate.vendor_name}</strong> · {[candidate.address, candidate.city, candidate.state].filter(Boolean).join(', ') || 'Location unavailable'}
              </div>
            ))}
          </div>
        </div>
      )}

      {saveState.message && (
        <div style={{ marginTop: 14, color: saveState.status === 'error' ? 'var(--error)' : 'var(--success)', fontSize: 13 }}>
          {saveState.message}
        </div>
      )}

      <div className="action-bar">
        <button id="back-to-summary-btn" className="btn btn-ghost" onClick={onBack}>← Summary</button>
        <div className="action-bar-right">
          <button id="download-csv-btn" className="btn btn-ghost" onClick={downloadCSV}>📥 Download as CSV</button>
          <button
            id="create-draft-vendor-btn"
            className="btn btn-primary"
            onClick={() => createDraft(saveState.status === 'duplicate')}
            disabled={!onCreateDraft || saveState.status === 'saving' || saveState.status === 'saved'}
          >
            {saveState.status === 'saving' ? '⏳ Saving…' : saveState.status === 'duplicate' ? '✅ Confirm Create Draft' : '🗄️ Create Draft Vendor'}
          </button>
          <button id="process-new-btn" className="btn btn-primary" onClick={onReset}>➕ New Video</button>
        </div>
      </div>

      <details style={{ marginTop: 20 }}>
        <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)', userSelect: 'none', padding: '8px 0' }}>🔍 View raw JSON</summary>
        <pre style={{ marginTop: 10, padding: 16, background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12, color: 'var(--text-secondary)', overflow: 'auto', maxHeight: 300, fontFamily: 'monospace' }}>
          {JSON.stringify(mergedRecord, null, 2)}
        </pre>
      </details>
    </div>
  );
}
