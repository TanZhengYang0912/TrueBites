const text = (value, fallback = '—') => value == null || value === '' ? fallback : String(value);

function dateLabel(value) {
  const date = value && new Date(value);
  return date && Number.isFinite(date.getTime()) ? date.toLocaleString() : '—';
}

// Explicit projection: audit metadata may contain private moderation details.
// Keep the screen and PDF on the same visible three-column representation.
export function formatAuditEntry(entry = {}) {
  const action = text(entry.action).replace(/[._]/g, ' ')
    .replace(/(^|\s)(\p{L})/gu, (_, space, letter) => space + letter.toLocaleUpperCase());
  return {
    id: entry.id,
    when: dateLabel(entry.createdAt),
    action,
    entity: `${text(entry.entityType)}${entry.entityId ? ` · ${entry.entityId}` : ''}`,
  };
}

export function buildAuditLogReport(entries, now = new Date()) {
  const rows = entries.map((entry) => {
    const { when, action, entity } = formatAuditEntry(entry);
    return { when, action, entity };
  });
  return {
    title: 'My Audit Log',
    subtitle: "Everything you've personally done in the admin console",
    generated: `Generated ${dateLabel(now)}`,
    count: rows.length,
    rows,
  };
}
