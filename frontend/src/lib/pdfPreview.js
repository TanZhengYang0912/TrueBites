// Reserve a window during the click, before awaits lose user activation. Only
// locally generated blobs reach the preview; failures never publish partial PDFs.
export async function openPdfPreview(createDocument, {
  title = 'Preparing TrueBites PDF',
  preparing = 'Preparing your PDF…',
  errorMessage = 'Could not prepare the PDF. Please try again.',
  signal,
} = {}) {
  if (signal?.aborted) return;
  const preview = window.open('', '_blank');
  if (!preview) throw new Error('Allow pop-ups for TrueBites, then try Export PDF again.');
  const cancel = () => { if (!preview.closed) preview.close(); };
  signal?.addEventListener('abort', cancel, { once: true });
  let url;
  try {
    preview.opener = null;
    preview.document.title = title;
    preview.document.body.textContent = preparing;
    const doc = await createDocument(() => preview.closed);
    if (preview.closed) return;
    url = URL.createObjectURL(doc.output('blob'));
    preview.location.replace(url);
    const cleanup = () => {
      URL.revokeObjectURL(url);
      window.clearInterval(timer);
      window.removeEventListener('pagehide', cleanup);
    };
    const timer = window.setInterval(() => { if (preview.closed) cleanup(); }, 5000);
    window.addEventListener('pagehide', cleanup, { once: true });
  } catch (error) {
    if (url) URL.revokeObjectURL(url);
    if (preview.closed) return;
    preview.close();
    throw new Error(errorMessage, { cause: error });
  } finally {
    // Once delivered, the PDF belongs to its viewer. Page navigation should
    // cancel only unfinished exports, not close completed reports.
    signal?.removeEventListener('abort', cancel);
  }
}
