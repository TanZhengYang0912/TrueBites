import React, { useState } from 'react';

const API_BASE = 'http://localhost:8000/api';



export default function BatchResultsStep({ batchData, onReset }) {
  const [expandedRow, setExpandedRow] = useState(null);
  // Per-job manual overrides for fields the AI left blank
  const [overrides, setOverrides] = useState({});
  // Per-job "address input is open" toggle
  const [editingAddress, setEditingAddress] = useState({});
  const [saveState, setSaveState] = useState({ saving: false, result: null });

  const getField = (job, field) => {
    const ext = job.extracted || {};
    return overrides[job.job_id]?.[field] ?? ext[field] ?? '';
  };

  const setField = (jobId, field, value) => {
    setOverrides(prev => ({
      ...prev,
      [jobId]: { ...prev[jobId], [field]: value },
    }));
  };

  const completedJobs = (batchData.jobs || []).filter(j => j.status === 'completed');

  const buildCSVContent = () => {
    const headers = [
      'vendor_name', 'address', 'city', 'state', 'country',
      'latitude', 'longitude', 'cuisine_types', 'signature_dishes',
      'price_range', 'average_rating', 'review_count',
      'ai_review_summary', 'operating_hours_raw', 'source_video_url',
      'source_platform', 'last_updated'
    ];
    
    const rows = completedJobs.map(job => {
      const ext = job.extracted || {};
      const dishes = Array.isArray(ext.signature_dishes) ? ext.signature_dishes.join(', ') : '';
      const cuisines = Array.isArray(ext.cuisine_types) ? ext.cuisine_types.join(', ') : '';
      const priceRange  = overrides[job.job_id]?.price_range         ?? ext.price_range         ?? '';
      const opHours     = overrides[job.job_id]?.operating_hours_raw ?? ext.operating_hours_raw ?? '';
      
      const platform = (job.url || '').toLowerCase().includes('tiktok') ? 'TikTok' : 'YouTube';
      const lastUpdated = new Date().toISOString();

      return [
        ext.vendor_name        || '',
        ext.address            || '',
        ext.city               || '',
        ext.state              || '',
        ext.country            || 'Malaysia',
        '', // latitude
        '', // longitude
        cuisines,
        dishes,
        priceRange,

        '', // average_rating
        '', // review_count
        job.summary            || '',
        opHours,
        job.url                || '',
        platform,
        lastUpdated
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });
    return [headers.join(','), ...rows].join('\n');
  };

  const malaccaJobs = completedJobs.filter(j => (j.extracted || {}).is_in_malacca === true);

  const handleSaveToDatabase = async () => {
    if (malaccaJobs.length === 0) return;
    setSaveState({ saving: true, result: null });
    try {
      const payload = {
        vendors: malaccaJobs.map(job => ({
          job_id: job.job_id,
          vendor_name: overrides[job.job_id]?.vendor_name,
          address: overrides[job.job_id]?.address,
          city: overrides[job.job_id]?.city,
          state: overrides[job.job_id]?.state,
          price_range: overrides[job.job_id]?.price_range,
          operating_hours_raw: overrides[job.job_id]?.operating_hours_raw,
        })),
      };
      const res = await fetch(`${API_BASE}/save-to-database`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setSaveState({ saving: false, result: data });
    } catch (e) {
      setSaveState({ saving: false, result: { saved: [], failed: [{ reason: e.message }] } });
    }
  };

  const handleDownloadCSV = () => {
    // 0xEF, 0xBB, 0xBF is the true UTF-8 BOM byte sequence
    const bom     = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const content = buildCSVContent();
    
    const blob    = new Blob([bom, content], { type: 'text/csv;charset=utf-8' });
    const url     = URL.createObjectURL(blob);
    const a       = document.createElement('a');
    a.href        = url;
    a.download    = 'batch_results.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="card">
      <div className="card-title">
        <span>📊</span> Batch Results Summary
      </div>
      <div className="card-subtitle">
        Extracted data from {completedJobs.length} videos processed from {batchData.profile_url}
      </div>

      <div className="results-table-wrap">
        <table className="results-table" style={{ tableLayout: 'fixed', width: '100%' }}>
          <colgroup>
            <col style={{ width: '18%' }} />
            <col style={{ width: '16%' }} />
            <col style={{ width: '13%' }} />
            <col style={{ width: '20%' }} />  {/* Dishes — fixed width prevents overflow */}
            <col style={{ width: '20%' }} />
            <col style={{ width: '13%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>Video</th>
              <th>Vendor</th>
              <th>Address</th>
              <th>Dishes / Cuisine</th>

              <th style={{ textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {batchData.jobs && batchData.jobs.map((job) => {
              if (job.status === 'error') {
                return (
                  <tr key={job.job_id}>
                    <td>
                      <div className="cell-title" title={job.title || job.url}>{job.title || 'Untitled'}</div>
                    </td>
                    <td colSpan={4} className="cell-status-error">⚠️ Failed: {job.error}</td>
                    <td></td>
                  </tr>
                );
              }
              if (job.status !== 'completed') return null;

              const ext = job.extracted || {};
              const isExpanded = expandedRow === job.job_id;
              const isMalacca = ext.is_in_malacca === true;
              const rowOpacity = isMalacca ? 1 : 0.4;
              const rowBg = isMalacca ? 'rgba(16,185,129,0.03)' : 'transparent';

              const priceRange = getField(job, 'price_range');
              const opHours    = getField(job, 'operating_hours_raw');

              return (
                <React.Fragment key={job.job_id}>
                  <tr style={{ opacity: rowOpacity, backgroundColor: rowBg }}>
                    <td>
                      <div className="cell-title" title={job.title}>{job.title || 'Untitled'}</div>
                    </td>
                    <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                      {ext.vendor_name || '-'}
                      {isMalacca && <span style={{ marginLeft: 6, fontSize: 10, padding: '2px 6px', background: 'var(--success)', color: '#000', borderRadius: 4, fontWeight: 700 }}>📍 MLK</span>}
                    </td>
                    <td style={{ wordBreak: 'break-word' }}>
                      {editingAddress[job.job_id] ? (
                        <input
                          type="text"
                          autoFocus
                          value={getField(job, 'address')}
                          onChange={e => setField(job.job_id, 'address', e.target.value)}
                          onBlur={() => setEditingAddress(prev => ({ ...prev, [job.job_id]: false }))}
                          style={{
                            width: '100%',
                            padding: '3px 6px',
                            borderRadius: 6,
                            border: '1px solid var(--border)',
                            background: 'rgba(255,255,255,0.05)',
                            color: 'var(--text-primary)',
                            fontSize: 12,
                          }}
                        />
                      ) : (
                        <span>
                          {getField(job, 'address') || '-'}
                          <button
                            onClick={() => setEditingAddress(prev => ({ ...prev, [job.job_id]: true }))}
                            title="Edit address"
                            style={{ marginLeft: 6, fontSize: 11, background: 'none', border: 'none', color: 'var(--accent-secondary)', cursor: 'pointer', padding: 0 }}
                          >
                            ✏️
                          </button>
                        </span>
                      )}
                      {ext.city && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{ext.city}</div>}
                    </td>
                    <td>
                      {/* Fixed-width cell — tags wrap within the column */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {(ext.signature_dishes || []).slice(0, 3).map((d, i) => (
                          <span
                            key={i}
                            style={{
                              display: 'inline-block',
                              padding: '2px 7px',
                              borderRadius: 4,
                              fontSize: 11,
                              background: 'rgba(124,58,237,0.12)',
                              color: '#a78bfa',
                              whiteSpace: 'normal',
                              wordBreak: 'break-word',
                              maxWidth: '100%',
                            }}
                          >
                            {d}
                          </span>
                        ))}
                        {(ext.cuisine_types || []).slice(0, 2).map((c, i) => (
                          <span
                            key={`c-${i}`}
                            style={{
                              display: 'inline-block',
                              padding: '2px 7px',
                              borderRadius: 4,
                              fontSize: 11,
                              background: 'rgba(59,130,246,0.12)',
                              color: '#60a5fa',
                              whiteSpace: 'normal',
                              wordBreak: 'break-word',
                              maxWidth: '100%',
                            }}
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    </td>

                    <td style={{ textAlign: 'right' }}>
                      <button className="expand-btn" onClick={() => setExpandedRow(isExpanded ? null : job.job_id)}>
                        {isExpanded ? 'Hide' : 'Details'}
                      </button>
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr>
                      <td colSpan={6} style={{ padding: 0 }}>
                        <div className="expanded-detail">
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                            {/* Left: Summary */}
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>📝 Summary</div>
                              <div style={{ background: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 8, fontSize: 13, lineHeight: 1.6 }}>
                                {job.summary}
                              </div>
                            </div>

                            {/* Right: Extra Details with editable inputs */}
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>📋 Extra Details</div>
                              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>

                                {/* Price Range — editable if blank */}
                                <li>
                                  <strong style={{ fontSize: 12 }}>Price Range:</strong>
                                  {priceRange ? (
                                    <span style={{ marginLeft: 6, fontSize: 13 }}>{priceRange}</span>
                                  ) : (
                                    <input
                                      type="text"
                                      placeholder="e.g. RM10–20 per person"
                                      value={overrides[job.job_id]?.price_range || ''}
                                      onChange={e => setField(job.job_id, 'price_range', e.target.value)}
                                      style={{
                                        marginLeft: 8,
                                        padding: '3px 8px',
                                        borderRadius: 6,
                                        border: '1px solid var(--border)',
                                        background: 'rgba(255,255,255,0.05)',
                                        color: 'var(--text-primary)',
                                        fontSize: 12,
                                        width: 160,
                                      }}
                                    />
                                  )}
                                </li>

                                {/* Operating Hours — editable if blank */}
                                <li>
                                  <strong style={{ fontSize: 12 }}>Operating Hours:</strong>
                                  {opHours ? (
                                    <span style={{ marginLeft: 6, fontSize: 13 }}>{opHours}</span>
                                  ) : (
                                    <input
                                      type="text"
                                      placeholder="e.g. 9am–10pm daily"
                                      value={overrides[job.job_id]?.operating_hours_raw || ''}
                                      onChange={e => setField(job.job_id, 'operating_hours_raw', e.target.value)}
                                      style={{
                                        marginLeft: 8,
                                        padding: '3px 8px',
                                        borderRadius: 6,
                                        border: '1px solid var(--border)',
                                        background: 'rgba(255,255,255,0.05)',
                                        color: 'var(--text-primary)',
                                        fontSize: 12,
                                        width: 160,
                                      }}
                                    />
                                  )}
                                </li>

                                <li><strong style={{ fontSize: 12 }}>Notes:</strong> <span style={{ fontSize: 13 }}>{ext.special_notes || '-'}</span></li>
                              </ul>
                              <div style={{ marginTop: 12 }}>
                                <a href={job.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-secondary)', textDecoration: 'none', fontSize: 12 }}>
                                  🔗 Watch Video
                                </a>
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="action-bar">
        <button className="btn btn-ghost" onClick={handleDownloadCSV}>
          📥 Download as CSV
        </button>
        <div className="action-bar-right">
          <div className="tooltip-wrap">
            <button
              className="btn btn-primary"
              onClick={handleSaveToDatabase}
              disabled={saveState.saving || malaccaJobs.length === 0}
            >
              {saveState.saving ? '⏳ Saving...' : `🗄️ Save to Database (${malaccaJobs.length})`}
            </button>
            <div className="tooltip">Only Malacca locations are saved to the database</div>
          </div>
          <button className="btn btn-primary" onClick={onReset}>
            ➕ Process Another
          </button>
        </div>
      </div>

      {saveState.result && (
        <div style={{ marginTop: 12, fontSize: 13 }}>
          {saveState.result.saved.length > 0 && (
            <div style={{ color: 'var(--success)' }}>
              ✅ Saved {saveState.result.saved.length} vendor(s) to the database.
            </div>
          )}
          {saveState.result.failed.length > 0 && (
            <div style={{ color: '#f87171', marginTop: 4 }}>
              ⚠️ {saveState.result.failed.length} failed: {saveState.result.failed.map(f => f.reason).join('; ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
