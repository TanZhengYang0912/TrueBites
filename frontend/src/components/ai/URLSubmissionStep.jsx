import React, { useState } from 'react';
import VideoSelectionList from './VideoSelectionList';
import * as aiApi from '../../api/ai';

export default function URLSubmissionStep({ onJobStarted, onBatchStarted }) {
  const [mode, setMode]           = useState('single'); // 'single' | 'profile'
  const [url, setUrl]             = useState('');
  const [startIndex, setStartIndex] = useState(1);
  const [endIndex, setEndIndex]     = useState(10);
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [preview, setPreview]     = useState(null);
  
  // Profile Mode state
  const [scrapedVideos, setScrapedVideos] = useState([]);
  const [selectedVideos, setSelectedVideos] = useState(new Set());

  // Handle URL change
  const handleUrlChange = (e) => {
    setUrl(e.target.value);
    setError('');
    setPreview(null);
    setScrapedVideos([]);
    setSelectedVideos(new Set());
  };

  // Blur validation for single mode
  const handleBlur = async () => {
    if (!url.trim() || mode === 'profile') return;
    setLoading(true);
    setError('');
    setPreview(null);
    try {
      const data = await aiApi.validateUrl(url);
      if (!data.valid) {
        setError(data.error || 'Invalid URL');
      } else if (data.url_type === 'profile') {
        setError('This looks like a profile URL. Please switch to Profile Mode above.');
      } else {
        setPreview({ platform: data.platform });
      }
    } catch (err) {
      setError(err.message || 'Could not reach the AI backend. Make sure the Node server is running.');
    } finally {
      setLoading(false);
    }
  };

  // Submit Single Video
  const handleSubmitSingle = async (e) => {
    e.preventDefault();
    if (!url.trim()) { setError('Please enter a URL'); return; }
    setLoading(true);
    setError('');
    try {
      const data = await aiApi.startProcessing(url);
      onJobStarted(data.job_id, url, preview?.platform || 'Unknown');
    } catch (err) {
      setError(err.message || 'Server error');
    } finally {
      setLoading(false);
    }
  };

  const [scrapeStatus, setScrapeStatus] = useState(''); // live status message

  // Fetch Profile Videos — fires immediately, polls for results
  const handleFetchProfile = async (e) => {
    e.preventDefault();
    if (!url.trim()) { setError('Please enter a profile URL'); return; }
    setLoading(true);
    setError('');
    setScrapeStatus('Starting scrape…');
    setScrapedVideos([]);
    setSelectedVideos(new Set());

    try {
      // 1. Kick off the background scrape — returns immediately with a scrape_id
      const { scrape_id } = await aiApi.scrapeProfile(url, parseInt(startIndex, 10) || 1, parseInt(endIndex, 10) || 10);

      // 2. Poll /scrape-status every 2s until done or error
      const startedAt = Date.now();
      const poll = async () => {
        const elapsed = Math.round((Date.now() - startedAt) / 1000);
        setScrapeStatus(`Fetching videos… (${elapsed}s)`);

        try {
          const data = await aiApi.getScrapeStatus(scrape_id);

          if (data.status === 'done') {
            if (data.videos.length === 0) {
              setError('No videos found on this profile.');
            } else {
              setScrapedVideos(data.videos);
              setSelectedVideos(new Set(data.videos.map(v => v.url)));
            }
            setScrapeStatus('');
            setLoading(false);
          } else if (data.status === 'error') {
            setError(data.error || 'Scrape failed.');
            setScrapeStatus('');
            setLoading(false);
          } else {
            // Still scraping — check again in 2s
            setTimeout(poll, 2000);
          }
        } catch (err) {
          setError(err.message || 'Lost connection while waiting for scrape results.');
          setScrapeStatus('');
          setLoading(false);
        }
      };
      setTimeout(poll, 2000);
    } catch (err) {
      setError(err.message || 'Server error');
      setScrapeStatus('');
      setLoading(false);
    }
  };

  // Process selected batch
  const handleProcessBatch = async () => {
    if (selectedVideos.size === 0) return;
    setLoading(true);
    setError('');
    try {
      const data = await aiApi.batchProcess(Array.from(selectedVideos), url);
      onBatchStarted(data.batch_id, data.total);
    } catch (err) {
      setError(err.message || 'Could not connect to the backend server.');
    } finally {
      setLoading(false);
    }
  };

  const toggleVideo = (v_url) => {
    const newSet = new Set(selectedVideos);
    if (newSet.has(v_url)) newSet.delete(v_url);
    else newSet.add(v_url);
    setSelectedVideos(newSet);
  };

  const selectAll = () => setSelectedVideos(new Set(scrapedVideos.map(v => v.url)));
  const deselectAll = () => setSelectedVideos(new Set());

  return (
    <div className="card">
      {/* Mode Toggle */}
      <div className="mode-toggle">
        <button 
          className={`mode-btn ${mode === 'single' ? 'active' : ''}`}
          onClick={() => { setMode('single'); setError(''); setPreview(null); setScrapedVideos([]); setUrl(''); }}
        >
          🎬 Single Video
        </button>
        <button 
          className={`mode-btn ${mode === 'profile' ? 'active' : ''}`}
          onClick={() => { setMode('profile'); setError(''); setUrl(''); }}
        >
          👤 Profile Mode
        </button>
      </div>

      <div className="card-title">
        {mode === 'single' ? <><span>🔗</span> Submit Video URL</> : <><span>👥</span> Scrape Profile</>}
      </div>
      <div className="card-subtitle">
        {mode === 'single' 
          ? 'Paste a TikTok or YouTube URL to begin the AI processing pipeline.'
          : 'Enter an influencer profile URL to fetch videos and process them in batch.'}
      </div>

      <form onSubmit={mode === 'single' ? handleSubmitSingle : handleFetchProfile}>
        {mode === 'profile' ? (
          <div className="profile-controls">
            <input
              type="url"
              className={`url-input ${error ? 'error' : ''}`}
              placeholder="e.g. https://www.tiktok.com/@username"
              value={url}
              onChange={handleUrlChange}
              disabled={loading}
              style={{ flex: 1 }}
            />
            <div className="limit-inputs" style={{ display: 'flex', gap: 8 }}>
              <input
                type="number"
                className="limit-input"
                min="1"
                title="Start Video (e.g. 1)"
                placeholder="Start (1)"
                value={startIndex}
                onChange={(e) => setStartIndex(e.target.value)}
                disabled={loading}
                style={{ width: 80 }}
              />
              <span style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>-</span>
              <input
                type="number"
                className="limit-input"
                min="1"
                max="1000"
                title="End Video (e.g. 1000)"
                placeholder="End (10)"
                value={endIndex}
                onChange={(e) => setEndIndex(e.target.value)}
                disabled={loading}
                style={{ width: 80 }}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading || !!error}>
              {loading ? <><span className="spinner" /> {scrapeStatus || 'Fetching…'}</> : 'Fetch Videos'}
            </button>
          </div>
        ) : (
          <div className="input-group">
            <input
              type="url"
              className={`url-input ${error ? 'error' : ''}`}
              placeholder="e.g. https://www.tiktok.com/@username/video/..."
              value={url}
              onChange={handleUrlChange}
              onBlur={handleBlur}
              disabled={loading}
            />
            <button type="submit" className="btn btn-primary" disabled={loading || !!error}>
              {loading ? <><span className="spinner" /> Processing…</> : <>▶ Start</>}
            </button>
          </div>
        )}

        {error && (
          <div className="error-msg">
            <span>⚠️</span> {error}
          </div>
        )}
      </form>

      {/* Single Mode Preview */}
      {mode === 'single' && preview && !error && (
        <div className="video-preview">
          <div style={{
            width: 80, height: 56, borderRadius: 8,
            background: 'var(--admin-navy)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, flexShrink: 0,
          }}>
            {preview.platform === 'YouTube' ? '▶' : '🎵'}
          </div>
          <div className="video-preview-info">
            <div className="video-preview-title">{url}</div>
            <div className="video-preview-platform">
              ✅ Valid {preview.platform} URL — ready to process
            </div>
          </div>
        </div>
      )}

      {/* Profile Mode Videos */}
      {mode === 'profile' && scrapedVideos.length > 0 && (
        <VideoSelectionList 
          videos={scrapedVideos}
          selected={selectedVideos}
          onToggle={toggleVideo}
          onSelectAll={selectAll}
          onDeselectAll={deselectAll}
        />
      )}

      {/* Start Batch Button for Profile Mode */}
      {mode === 'profile' && scrapedVideos.length > 0 && selectedVideos.size > 0 && (
        <div style={{ marginTop: 16 }}>
          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center', padding: '16px' }}
            onClick={handleProcessBatch}
            disabled={loading}
          >
            {loading ? <span className="spinner" /> : `▶ Process Selected (${selectedVideos.size})`}
          </button>
        </div>
      )}

      {scrapedVideos.length === 0 && (
        <div style={{ marginTop: 28, padding: '16px 20px', background: 'var(--admin-panel-soft)', borderRadius: 12, border: '1px solid var(--admin-border)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 10 }}>
            Supported Platforms
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            {[
              { icon: '🎵', name: 'TikTok', example: mode === 'profile' ? 'tiktok.com/@username' : 'vt.tiktok.com / tiktok.com' },
              { icon: '▶️', name: 'YouTube', example: mode === 'profile' ? 'youtube.com/@channel' : 'youtube.com / youtu.be' },
            ].map((p) => (
              <div key={p.name} style={{ flex: 1, padding: '12px 14px', background: 'var(--admin-panel)', borderRadius: 10, border: '1px solid var(--admin-border)' }}>
                <div style={{ fontSize: 18, marginBottom: 4 }}>{p.icon}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{p.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{p.example}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
