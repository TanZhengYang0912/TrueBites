import React from 'react';

function formatViews(n) {
  if (!n) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M views`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K views`;
  return `${n} views`;
}

export default function VideoSelectionList({ videos, selected, onToggle, onSelectAll, onDeselectAll }) {
  const allSelected = videos.length > 0 && selected.size === videos.length;

  return (
    <div style={{ marginTop: 24 }}>
      <div className="video-list-header">
        <div className="video-list-title">
          📋 {videos.length} Videos Found
          {selected.size > 0 && (
            <span style={{ marginLeft: 10, fontSize: 13, fontWeight: 500, color: 'var(--admin-navy)' }}>
              ({selected.size} selected)
            </span>
          )}
        </div>
        <div className="video-list-actions">
          <button
            id="select-all-btn"
            className="btn btn-ghost"
            style={{ padding: '6px 12px', fontSize: 12 }}
            onClick={allSelected ? onDeselectAll : onSelectAll}
          >
            {allSelected ? '✗ Deselect All' : '✓ Select All'}
          </button>
        </div>
      </div>

      <div className="video-grid">
        {videos.map((video, idx) => {
          const isSelected = selected.has(video.url);
          return (
            <div
              key={video.url || idx}
              className={`video-card ${isSelected ? 'selected' : ''}`}
              onClick={() => onToggle(video.url)}
            >
              <div className="video-checkbox">
                {isSelected && '✓'}
              </div>

              {video.thumbnail ? (
                <img
                  src={video.thumbnail}
                  alt={video.title}
                  className="video-thumb"
                  onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                />
              ) : null}
              <div
                className="video-thumb-placeholder"
                style={{ display: video.thumbnail ? 'none' : 'flex' }}
              >
                🎵
              </div>

              <div className="video-info">
                <div className="video-info-title" title={video.title}>
                  {video.title || 'Untitled Video'}
                </div>
                <div className="video-meta">
                  {video.duration && <span>⏱ {video.duration}</span>}
                  {video.view_count && <span>👁 {formatViews(video.view_count)}</span>}
                  <span style={{ color: 'var(--accent-secondary)', opacity: 0.7, fontSize: 10, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
                    {video.url}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

    </div>
  );
}
