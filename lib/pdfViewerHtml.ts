import type { AnnotationsByPage } from "@/contexts/LibraryContext";

export type ViewerInput = {
  pdfBase64: string;
  startPage: number;
  annotations: AnnotationsByPage;
  drawColor: string;
  highlightColor: string;
};

export function buildViewerHtml(input: ViewerInput) {
  const json = JSON.stringify(input);
  return `<!DOCTYPE html><html><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=4, user-scalable=yes" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
  html, body { height: 100%; background: #1a1a2e; overflow: hidden; -webkit-touch-callout: default; }
  #wrap { width: 100%; height: 100%; overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; }
  #viewer { padding: 16px 8px 80px; display: flex; flex-direction: column; align-items: center; gap: 16px; }
  .pageWrap { background: white; box-shadow: 0 4px 16px rgba(0,0,0,0.35); border-radius: 4px; position: relative; }
  canvas.pdf-canvas { display: block; pointer-events: none; }
  .hl-layer { position: absolute; inset: 0; pointer-events: none; }
  .hl-rect { position: absolute; border-radius: 2px; }
  .text-layer { position: absolute; inset: 0; line-height: 1.0; user-select: text; -webkit-user-select: text; pointer-events: auto; }
  .text-layer span { position: absolute; color: transparent; white-space: pre; cursor: text; transform-origin: 0 0; }
  canvas.draw-canvas { position: absolute; inset: 0; pointer-events: none; touch-action: auto; }
  /* Tool-driven layer behavior */
  body[data-tool="draw"] canvas.draw-canvas { pointer-events: auto; touch-action: none; }
  body[data-tool="draw"] .text-layer { pointer-events: none; user-select: none; -webkit-user-select: none; }
  body[data-tool="read"] .text-layer { user-select: none; -webkit-user-select: none; }
  body[data-tool="read"] .text-layer span { cursor: default; }
  ::selection { background: rgba(245,196,81,0.5); }
  ::-moz-selection { background: rgba(245,196,81,0.5); }
  #status { position: fixed; top: 50%; left: 0; right: 0; transform: translateY(-50%); color: #faf7f2; font: 14px -apple-system, system-ui, sans-serif; text-align: center; opacity: 0.85; pointer-events: none; padding: 0 24px; }
  .progress { display:inline-block; min-width: 140px; height: 4px; background: rgba(255,255,255,0.15); border-radius: 2px; margin-top: 12px; overflow: hidden; }
  .progress > div { height: 100%; background: #d4a574; width: 0%; transition: width 0.15s linear; }
</style>
</head>
<body data-tool="read">
<div id="status">Opening PDF…<div class="progress"><div id="progressBar"></div></div></div>
<div id="wrap"><div id="viewer"></div></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
<script>
(async function() {
  var INPUT = ${json};
  var post = function(data) {
    try { window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(data)); } catch(e) {}
  };

  if (!window.pdfjsLib) {
    document.getElementById('status').textContent = 'Could not load PDF engine. Check your connection.';
    post({ type: 'error', message: 'pdfjs failed to load' });
    return;
  }
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  var statusEl = document.getElementById('status');
  var progressBar = document.getElementById('progressBar');
  var wrap = document.getElementById('wrap');
  var viewer = document.getElementById('viewer');

  var raw;
  try { raw = atob(INPUT.pdfBase64); }
  catch (e) {
    statusEl.textContent = 'Could not decode this PDF.';
    post({ type: 'error', message: 'atob failed' });
    return;
  }
  var data = new Uint8Array(raw.length);
  for (var i = 0; i < raw.length; i++) data[i] = raw.charCodeAt(i);

  var pdf;
  try {
    pdf = await pdfjsLib.getDocument({ data: data, disableStream: true, disableAutoFetch: true }).promise;
  } catch (e) {
    statusEl.textContent = 'Could not open this PDF.';
    post({ type: 'error', message: String(e && e.message || e) });
    return;
  }

  var totalPages = pdf.numPages;
  post({ type: 'ready', totalPages: totalPages });

  var screenWidth = Math.min(window.innerWidth, 900);
  var dpr = Math.min(2, window.devicePixelRatio || 1);
  var pageEls = [];
  var pagesById = {};

  // Build per-page state container
  var pageStates = {}; // { [page]: { wrap, drawCanvas, drawCtx, hlLayer, cssWidth, cssHeight, strokes:[], highlights:[] } }

  function applyStrokeToCanvas(ctx, stroke, scale) {
    if (!stroke.points || stroke.points.length < 1) return;
    ctx.save();
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width * scale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    var pts = stroke.points;
    ctx.moveTo(pts[0].x * scale, pts[0].y * scale);
    for (var k = 1; k < pts.length; k++) {
      ctx.lineTo(pts[k].x * scale, pts[k].y * scale);
    }
    if (pts.length === 1) {
      ctx.lineTo(pts[0].x * scale + 0.1, pts[0].y * scale + 0.1);
    }
    ctx.stroke();
    ctx.restore();
  }

  function rerenderStrokes(state) {
    var ctx = state.drawCtx;
    ctx.clearRect(0, 0, state.drawCanvas.width, state.drawCanvas.height);
    var scale = state.drawCanvas.width / state.cssWidth;
    for (var i = 0; i < state.strokes.length; i++) {
      applyStrokeToCanvas(ctx, state.strokes[i], scale);
    }
  }

  function applyHighlight(state, hl) {
    for (var r = 0; r < hl.rects.length; r++) {
      var rect = hl.rects[r];
      var div = document.createElement('div');
      div.className = 'hl-rect';
      div.style.left = rect.x + 'px';
      div.style.top = rect.y + 'px';
      div.style.width = rect.w + 'px';
      div.style.height = rect.h + 'px';
      div.style.background = hl.color;
      state.hlLayer.appendChild(div);
    }
  }

  function rerenderHighlights(state) {
    state.hlLayer.innerHTML = '';
    for (var i = 0; i < state.highlights.length; i++) {
      applyHighlight(state, state.highlights[i]);
    }
  }

  for (var i = 1; i <= totalPages; i++) {
    var pageNum = i;
    var page = await pdf.getPage(pageNum);
    var base = page.getViewport({ scale: 1 });
    var cssScale = (screenWidth - 16) / base.width;
    var cssVp = page.getViewport({ scale: cssScale });
    var renderVp = page.getViewport({ scale: cssScale * dpr });

    var wEl = document.createElement('div');
    wEl.className = 'pageWrap';
    wEl.style.width = cssVp.width + 'px';
    wEl.style.height = cssVp.height + 'px';
    wEl.dataset.page = String(pageNum);

    var pdfCanvas = document.createElement('canvas');
    pdfCanvas.className = 'pdf-canvas';
    pdfCanvas.width = renderVp.width;
    pdfCanvas.height = renderVp.height;
    pdfCanvas.style.width = cssVp.width + 'px';
    pdfCanvas.style.height = cssVp.height + 'px';
    wEl.appendChild(pdfCanvas);

    var hlLayer = document.createElement('div');
    hlLayer.className = 'hl-layer';
    hlLayer.style.width = cssVp.width + 'px';
    hlLayer.style.height = cssVp.height + 'px';
    wEl.appendChild(hlLayer);

    var drawCanvas = document.createElement('canvas');
    drawCanvas.className = 'draw-canvas';
    drawCanvas.width = renderVp.width;
    drawCanvas.height = renderVp.height;
    drawCanvas.style.width = cssVp.width + 'px';
    drawCanvas.style.height = cssVp.height + 'px';
    drawCanvas.dataset.page = String(pageNum);
    wEl.appendChild(drawCanvas);

    var textDiv = document.createElement('div');
    textDiv.className = 'text-layer';
    textDiv.style.width = cssVp.width + 'px';
    textDiv.style.height = cssVp.height + 'px';
    wEl.appendChild(textDiv);

    viewer.appendChild(wEl);
    pageEls.push(wEl);
    pagesById[String(pageNum)] = wEl;

    await page.render({ canvasContext: pdfCanvas.getContext('2d'), viewport: renderVp }).promise;

    try {
      var tc = await page.getTextContent();
      var items = tc.items || [];
      for (var k = 0; k < items.length; k++) {
        var it = items[k];
        if (!it.str) continue;
        var tx = pdfjsLib.Util.transform(cssVp.transform, it.transform);
        var fontHeight = Math.hypot(tx[2], tx[3]);
        var span = document.createElement('span');
        span.textContent = it.str;
        span.style.left = tx[4] + 'px';
        span.style.top = (tx[5] - fontHeight) + 'px';
        span.style.fontSize = fontHeight + 'px';
        span.style.fontFamily = (it.fontName || 'sans-serif');
        textDiv.appendChild(span);
      }
    } catch (e) { /* selection optional */ }

    var existing = (INPUT.annotations || {})[String(pageNum)] || { strokes: [], highlights: [] };
    var state = {
      wrap: wEl,
      drawCanvas: drawCanvas,
      drawCtx: drawCanvas.getContext('2d'),
      hlLayer: hlLayer,
      cssWidth: cssVp.width,
      cssHeight: cssVp.height,
      strokes: existing.strokes ? existing.strokes.slice() : [],
      highlights: existing.highlights ? existing.highlights.slice() : []
    };
    pageStates[String(pageNum)] = state;
    rerenderStrokes(state);
    rerenderHighlights(state);

    progressBar.style.width = ((pageNum / totalPages) * 100) + '%';
  }

  statusEl.style.display = 'none';

  if (INPUT.startPage && INPUT.startPage > 1 && pagesById[String(INPUT.startPage)]) {
    var target = pagesById[String(INPUT.startPage)];
    setTimeout(function(){ wrap.scrollTop = target.offsetTop - 8; }, 30);
  }

  // Page tracking
  var currentPage = INPUT.startPage || 1;
  post({ type: 'page', page: currentPage });

  var io = new IntersectionObserver(function(entries) {
    var best = null;
    for (var j = 0; j < entries.length; j++) {
      var e = entries[j];
      if (!e.isIntersecting) continue;
      if (!best || e.intersectionRatio > best.intersectionRatio) best = e;
    }
    if (best) {
      var p = parseInt(best.target.dataset.page, 10);
      if (p && p !== currentPage) {
        currentPage = p;
        post({ type: 'page', page: p });
      }
    }
  }, { root: wrap, threshold: [0.4, 0.6, 0.8] });
  for (var n = 0; n < pageEls.length; n++) io.observe(pageEls[n]);

  // Scroll-velocity / flick detection.
  // Pauses the timer whenever the user scrolls quickly — including
  // sustained fast scrolling within a single page (no page change required).
  var lastY = wrap.scrollTop;
  var lastT = performance.now();
  var flickActive = false;
  var highStart = 0;
  var lowStart = 0;
  // Sustained-speed pause (any speed >= FLICK_VEL for FLICK_ENTER_MS in a row).
  var FLICK_VEL = 0.9;
  var FLICK_ENTER_MS = 140;
  // Instant pause for a single very-fast tick (heavy flick / quick swipe).
  var INSTANT_VEL = 2.0;
  var FLICK_EXIT_MS = 600;
  setInterval(function() {
    var now = performance.now();
    var y = wrap.scrollTop;
    var dt = Math.max(1, now - lastT);
    var v = Math.abs(y - lastY) / dt;
    lastY = y; lastT = now;
    if (!flickActive && v >= INSTANT_VEL) {
      flickActive = true;
      highStart = now;
      lowStart = 0;
      post({ type: 'flick', active: true });
      return;
    }
    if (v >= FLICK_VEL) {
      lowStart = 0;
      if (!highStart) highStart = now;
      if (!flickActive && now - highStart >= FLICK_ENTER_MS) {
        flickActive = true;
        post({ type: 'flick', active: true });
      }
    } else {
      highStart = 0;
      if (flickActive) {
        if (!lowStart) lowStart = now;
        if (now - lowStart >= FLICK_EXIT_MS) {
          flickActive = false;
          lowStart = 0;
          post({ type: 'flick', active: false });
        }
      }
    }
  }, 80);

  // Activity ping
  var lastActivity = 0;
  function activity() {
    var now = Date.now();
    if (now - lastActivity > 1000) {
      lastActivity = now;
      post({ type: 'activity' });
    }
  }
  ['touchstart','touchmove','scroll','click','pointerdown'].forEach(function(ev){
    window.addEventListener(ev, activity, { passive: true });
  });

  // Selection signal (engagement)
  var lastSel = '';
  document.addEventListener('selectionchange', function() {
    var sel = window.getSelection ? window.getSelection() : null;
    var text = sel ? String(sel).trim() : '';
    if (text.length >= 3 && text !== lastSel) {
      lastSel = text;
      post({ type: 'selection', length: text.length });
    } else if (text.length === 0) {
      lastSel = '';
    }
  });

  // ===== Drawing tool =====
  var currentTool = 'read';
  var drawColor = INPUT.drawColor || '#dc4444';
  var highlightColor = INPUT.highlightColor || 'rgba(245,196,81,0.45)';
  var strokeWidth = 2.5;

  function setTool(t) {
    currentTool = t;
    document.body.dataset.tool = t;
  }

  // Active stroke per page
  var active = null; // { state, stroke, lastPoint }

  function getCanvasPoint(canvas, clientX, clientY) {
    var r = canvas.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  }

  function startStroke(canvas, state, p) {
    var stroke = { color: drawColor, width: strokeWidth, points: [p] };
    state.strokes.push(stroke);
    active = { state: state, stroke: stroke };
    var scale = canvas.width / state.cssWidth;
    var ctx = state.drawCtx;
    ctx.save();
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width * scale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(p.x * scale, p.y * scale);
    ctx.lineTo(p.x * scale + 0.1, p.y * scale + 0.1);
    ctx.stroke();
    ctx.restore();
  }

  function continueStroke(p) {
    if (!active) return;
    var state = active.state;
    var stroke = active.stroke;
    var prev = stroke.points[stroke.points.length - 1];
    stroke.points.push(p);
    var scale = state.drawCanvas.width / state.cssWidth;
    var ctx = state.drawCtx;
    ctx.save();
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width * scale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(prev.x * scale, prev.y * scale);
    ctx.lineTo(p.x * scale, p.y * scale);
    ctx.stroke();
    ctx.restore();
  }

  function endStroke() {
    if (!active) return;
    var state = active.state;
    var pageNum = parseInt(state.drawCanvas.dataset.page, 10);
    active = null;
    postAnnotations(pageNum, state);
  }

  function postAnnotations(pageNum, state) {
    post({
      type: 'annotations',
      page: pageNum,
      strokes: state.strokes,
      highlights: state.highlights
    });
  }

  // Attach pointer listeners on each draw canvas
  Object.keys(pageStates).forEach(function(pageKey) {
    var state = pageStates[pageKey];
    var canvas = state.drawCanvas;

    canvas.addEventListener('pointerdown', function(e) {
      if (currentTool !== 'draw') return;
      e.preventDefault();
      try { canvas.setPointerCapture(e.pointerId); } catch(_) {}
      var p = getCanvasPoint(canvas, e.clientX, e.clientY);
      startStroke(canvas, state, p);
    });
    canvas.addEventListener('pointermove', function(e) {
      if (currentTool !== 'draw' || !active || active.state !== state) return;
      e.preventDefault();
      var p = getCanvasPoint(canvas, e.clientX, e.clientY);
      continueStroke(p);
    });
    var finish = function(e) {
      if (currentTool !== 'draw' || !active || active.state !== state) return;
      e.preventDefault();
      try { canvas.releasePointerCapture(e.pointerId); } catch(_) {}
      endStroke();
    };
    canvas.addEventListener('pointerup', finish);
    canvas.addEventListener('pointercancel', finish);
    canvas.addEventListener('pointerleave', function(e) {
      if (currentTool !== 'draw' || !active || active.state !== state) return;
      endStroke();
    });
  });

  // Highlight: on touchend (or pointerup on text layer) when in highlight mode,
  // grab current selection and convert to per-page rects.
  function commitHighlight() {
    if (currentTool !== 'highlight') return;
    var sel = window.getSelection ? window.getSelection() : null;
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    var range = sel.getRangeAt(0);
    var clientRects = range.getClientRects();
    if (!clientRects || clientRects.length === 0) return;

    // Group rects by page
    var byPage = {};
    for (var i = 0; i < clientRects.length; i++) {
      var cr = clientRects[i];
      if (cr.width < 1 || cr.height < 1) continue;
      // find which page contains this rect
      for (var pk in pageStates) {
        var ps = pageStates[pk];
        var prect = ps.wrap.getBoundingClientRect();
        var cx = cr.left + cr.width / 2;
        var cy = cr.top + cr.height / 2;
        if (cx >= prect.left && cx <= prect.right && cy >= prect.top && cy <= prect.bottom) {
          if (!byPage[pk]) byPage[pk] = [];
          byPage[pk].push({
            x: cr.left - prect.left,
            y: cr.top - prect.top,
            w: cr.width,
            h: cr.height
          });
          break;
        }
      }
    }
    Object.keys(byPage).forEach(function(pk) {
      var state = pageStates[pk];
      var hl = { color: highlightColor, rects: byPage[pk] };
      state.highlights.push(hl);
      applyHighlight(state, hl);
      postAnnotations(parseInt(pk, 10), state);
    });
    sel.removeAllRanges();
  }

  document.addEventListener('touchend', commitHighlight);
  document.addEventListener('mouseup', commitHighlight);

  // Clear current page
  function clearPage(pageNum) {
    var state = pageStates[String(pageNum)];
    if (!state) return;
    state.strokes = [];
    state.highlights = [];
    rerenderStrokes(state);
    rerenderHighlights(state);
    postAnnotations(pageNum, state);
  }

  // Expose to native
  window.__tarkeezSetTool = setTool;
  window.__tarkeezClearPage = clearPage;
  window.__tarkeezGetCurrentPage = function() { return currentPage; };
})();
</script>
</body></html>`;
}
