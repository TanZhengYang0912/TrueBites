// Select fonts per run, not per whole string: a mixed Chinese/Latin name can
// require both fonts on the same line. Measure and draw those exact same runs.
export function createPdfText(doc) {
  const base = doc.getFontList().DashboardSans ? 'DashboardSans' : 'helvetica';
  const choices = new Map();

  function fontFor(char, bold) {
    const key = `${bold}:${char}`;
    if (choices.has(key)) return choices.get(key);
    const fonts = [{ family: base, style: bold ? 'bold' : 'normal' }];
    if (doc.getFontList().DashboardCjk) fonts.push({ family: 'DashboardCjk', style: 'normal' });
    for (const font of fonts) {
      doc.setFont(font.family, font.style);
      const metadata = doc.getFont().metadata;
      if (/\s/.test(char) || !metadata.characterToGlyph || metadata.characterToGlyph(char.codePointAt(0))) {
        choices.set(key, font);
        return font;
      }
    }
    throw new Error('Some dashboard characters are not supported by the PDF fonts. Please contact support.');
  }

  function runs(value, bold) {
    const result = [];
    for (const char of String(value)) {
      const font = fontFor(char, bold);
      const previous = result.at(-1);
      if (previous?.family === font.family && previous.style === font.style) previous.text += char;
      else result.push({ ...font, text: char });
    }
    return result;
  }

  function measure(value, size = 9, bold = false) {
    return runs(value, bold).reduce((sum, run) => {
      doc.setFont(run.family, run.style); doc.setFontSize(size);
      return sum + doc.getTextWidth(run.text);
    }, 0);
  }

  function draw(value, x, y, size = 9, color = '#17212B', bold = false, { align = 'left' } = {}) {
    const content = String(value ?? '');
    if (align !== 'left') x -= measure(content, size, bold) / (align === 'center' ? 2 : 1);
    for (const run of runs(content, bold)) {
      doc.setFont(run.family, run.style); doc.setFontSize(size); doc.setTextColor(color);
      doc.text(run.text, x, y);
      x += doc.getTextWidth(run.text);
    }
  }

  function wrap(value, maxWidth, size = 9, bold = false) {
    const lines = [];
    const text = String(value ?? '');
    if (!text) return { lines, size, bold };
    for (const paragraph of text.split('\n')) {
      let line = '';
      for (let word of paragraph.match(/\S+\s*|\s+/g) || []) {
        if (line && measure(line + word.trimEnd(), size, bold) > maxWidth) {
          lines.push(line.trimEnd()); line = ''; word = word.trimStart();
        }
        if (measure(word.trimEnd(), size, bold) > maxWidth) {
          for (const char of word) {
            if (line && measure(line + char, size, bold) > maxWidth) { lines.push(line.trimEnd()); line = ''; }
            line += char;
          }
        } else line += word;
      }
      lines.push(line.trimEnd());
    }
    return { lines, size, bold };
  }

  function drawLines(block, x, y, color = '#17212B', count = block.lines.length, lineHeight = 11) {
    block.lines.slice(0, count).forEach((line, index) => draw(line, x, y + index * lineHeight, block.size, color, block.bold));
  }
  return { draw, wrap, drawLines, measure };
}
