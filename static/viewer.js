for (const panel of document.querySelectorAll('.source-viewer[data-viewer-file]')) {
  const button = panel.querySelector('[data-load-viewer]');
  if (!button) continue;
  const status = panel.querySelector('[role=status]');
  button.hidden = false;
  button.addEventListener('click', async () => {
    button.disabled = true;
    status.textContent = 'Loading the original viewer…';
    try {
      const file = new URL(panel.dataset.viewerFile, location.href);
      const base = new URL(panel.dataset.viewerBase);
      const revision = /^\/Griboedow\/[\w.-]+\/[0-9a-f]{40}\//.exec(base.pathname);
      if (file.origin !== location.origin || !file.pathname.startsWith('/viewer-files/') ||
          base.origin !== 'https://raw.githubusercontent.com' || !revision) throw new Error('Unknown viewer location');
      const response = await fetch(file, { credentials:'omit',redirect:'error' });
      if (!response.ok) throw new Error('Viewer unavailable');
      const html = await response.text();
      const assets = base.origin + revision[0];
      // Plotly's WebGL renderer compiles shaders using generated JavaScript. This
      // permission applies only inside this opaque-origin, script-only sandbox.
      const policy = [
        "default-src 'none'", "script-src 'unsafe-inline' 'unsafe-eval'",
        "style-src 'unsafe-inline'", "img-src data: blob: " + assets, "media-src blob: " + assets,
        "font-src data:", "worker-src blob:", "connect-src 'none'", "form-action 'none'", 'base-uri ' + assets,
      ].join('; ');
      const frame = document.createElement('iframe');
      frame.setAttribute('sandbox','allow-scripts');
      frame.setAttribute('referrerpolicy','no-referrer');
      frame.title = (document.querySelector('.paper h1')?.textContent || 'Research report') + ' interactive viewer';
      const baseTag = document.createElement('base');
      baseTag.href = base.href;
      frame.srcdoc = '<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' +
        policy + '">' + baseTag.outerHTML + html;
      frame.addEventListener('load', () => { status.textContent = ''; }, {once:true});
      panel.append(frame);
      button.hidden = true;
    } catch {
      status.textContent = 'The viewer could not load. Try again or open the original HTML on GitHub.';
      button.disabled = false;
    }
  });
  function openLinkedViewer() {
    if (location.hash === '#' + panel.id && !button.disabled) button.click();
  }
  window.addEventListener('hashchange', openLinkedViewer);
  openLinkedViewer();
}
