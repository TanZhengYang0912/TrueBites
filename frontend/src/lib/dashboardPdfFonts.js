// Fonts are served by this deployment, never by a third-party service. Downloads
// are cached only after success, so a temporary failure can be retried.
const fontCache = new Map();

async function loadFont(filename) {
  if (!fontCache.has(filename)) {
    const pending = (async () => {
      const response = await fetch(`${import.meta.env?.BASE_URL || '/'}fonts/dashboard/${filename}`);
      if (!response.ok) throw new Error('PDF fonts could not be loaded. Please try exporting again.');
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!bytes.length) throw new Error('PDF fonts could not be loaded. Please try exporting again.');
      let binary = '';
      for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return btoa(binary);
    })();
    fontCache.set(filename, pending);
    pending.catch(() => fontCache.delete(filename));
  }
  return fontCache.get(filename);
}

export async function installDashboardFonts(doc, report) {
  for (const [filename, style] of [['NotoSans-Regular.ttf', 'normal'], ['NotoSans-Bold.ttf', 'bold']]) {
    doc.addFileToVFS(filename, await loadFont(filename));
    doc.addFont(filename, 'DashboardSans', style);
  }
  doc.setFont('DashboardSans', 'normal');
  const glyphFor = doc.getFont().metadata.characterToGlyph.bind(doc.getFont().metadata);
  // Inspect strings locally solely to decide whether the larger CJK font is
  // needed; no content is included in a URL, log, or external request.
  const text = JSON.stringify(report);
  const needsCjk = Array.from(text).some((char) => !/\s/.test(char) && !glyphFor(char.codePointAt(0)));
  if (needsCjk) {
    const filename = 'NotoSansSC-Regular.ttf';
    doc.addFileToVFS(filename, await loadFont(filename));
    doc.addFont(filename, 'DashboardCjk', 'normal');
  }
}
