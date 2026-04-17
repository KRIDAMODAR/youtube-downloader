// app.js — YTGrab Frontend Logic

let selectedQuality = null;
let currentVideoData = null;

// ─── Paste URL from clipboard ───────────────────────────────────────────────
async function pasteUrl() {
  try {
    const text = await navigator.clipboard.readText();
    document.getElementById('urlInput').value = text;
  } catch {
    document.getElementById('urlInput').focus();
  }
}

// ─── Fetch video info from backend ──────────────────────────────────────────
async function fetchVideo() {
  const url = document.getElementById('urlInput').value.trim();
  if (!url) {
    showError('Please paste a YouTube URL first.');
    return;
  }
  if (!isValidYouTubeUrl(url)) {
    showError('Please enter a valid YouTube URL.');
    return;
  }

  const btn = document.getElementById('fetchBtn');
  btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg> Loading…';
  btn.disabled = true;

  try {
    const res = await fetch(`/api/info?url=${encodeURIComponent(url)}`);
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Failed to fetch video info');

    currentVideoData = data;
    renderVideoCard(data);
    document.getElementById('resultSection').style.display = 'block';
    document.getElementById('resultSection').scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  } catch (err) {
    showError(err.message);
  } finally {
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg> Download';
    btn.disabled = false;
  }
}

// ─── Render video card with fetched data ────────────────────────────────────
function renderVideoCard(data) {
  document.getElementById('videoTitle').textContent = data.title;
  document.getElementById('videoMeta').textContent =
    `${data.channel}  •  ${formatDuration(data.duration)}  •  ${formatViews(data.views)} views`;

  const img = document.getElementById('thumbImg');
  img.src = data.thumbnail;
  img.onerror = () => { img.style.display = 'none'; };

  document.getElementById('durationBadge').textContent = formatDuration(data.duration);

  buildQualityGrid(data.formats);
}

// ─── Build quality selector ──────────────────────────────────────────────────
function buildQualityGrid(formats) {
  const grid = document.getElementById('qualityGrid');
  grid.innerHTML = '';

  formats.forEach((fmt, i) => {
    const btn = document.createElement('div');
    btn.className = 'q-btn' + (i === 0 ? ' active' : '');
    btn.innerHTML = `
      <div class="q-res">${fmt.label}</div>
      <div class="q-type">${fmt.ext.toUpperCase()}${fmt.isAudio ? ' Audio' : ''}</div>
      <div class="q-size">${fmt.filesize || ''}</div>
    `;
    btn.onclick = () => selectQuality(btn, fmt);
    grid.appendChild(btn);
  });

  if (formats.length > 0) {
    selectedQuality = formats[0];
    updateDlButton();
  }
}

function selectQuality(el, fmt) {
  document.querySelectorAll('.q-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  selectedQuality = fmt;
  updateDlButton();
}

function updateDlButton() {
  if (!selectedQuality) return;
  document.getElementById('dlBtnText').textContent = `Download ${selectedQuality.label}`;
}

// ─── Trigger download ────────────────────────────────────────────────────────
async function startDownload() {
  if (!currentVideoData || !selectedQuality) return;

  const wrap = document.getElementById('progressWrap');
  const fill = document.getElementById('progressFill');
  const text = document.getElementById('progressText');

  wrap.style.display = 'block';
  fill.style.width = '0%';
  text.textContent = 'Starting download…';

  // Animate progress
  let prog = 0;
  const interval = setInterval(() => {
    prog = Math.min(prog + Math.random() * 15, 90);
    fill.style.width = prog + '%';
    if (prog < 30) text.textContent = 'Fetching video…';
    else if (prog < 60) text.textContent = 'Processing…';
    else text.textContent = 'Almost done…';
  }, 300);

  try {
    const url = document.getElementById('urlInput').value.trim();
    const dlUrl = `/api/download?url=${encodeURIComponent(url)}&format_id=${encodeURIComponent(selectedQuality.format_id)}`;

    const link = document.createElement('a');
    link.href = dlUrl;
    link.download = '';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    clearInterval(interval);
    fill.style.width = '100%';
    text.textContent = 'Download started!';
    setTimeout(() => { wrap.style.display = 'none'; }, 3000);

  } catch (err) {
    clearInterval(interval);
    text.textContent = 'Download failed. Please try again.';
    fill.style.background = '#ff4444';
  }
}

async function downloadAudio() {
  if (!currentVideoData) return;
  const url = document.getElementById('urlInput').value.trim();
  const dlUrl = `/api/download?url=${encodeURIComponent(url)}&format_id=bestaudio&ext=mp3`;
  window.location.href = dlUrl;
}

// ─── FAQ toggle ──────────────────────────────────────────────────────────────
function toggleFaq(el) {
  const item = el.closest('.faq-item');
  item.classList.toggle('open');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function isValidYouTubeUrl(url) {
  return /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/|playlist\?list=)|youtu\.be\/)/.test(url);
}

function formatDuration(seconds) {
  if (!seconds) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

function formatViews(n) {
  if (!n) return '0';
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toString();
}

function showError(msg) {
  const input = document.getElementById('urlInput');
  input.style.borderColor = '#ff4444';
  input.placeholder = msg;
  input.value = '';
  setTimeout(() => { input.style.borderColor = ''; input.placeholder = 'Paste YouTube URL here…'; }, 3000);
}

// ─── Enter key shortcut ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('urlInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') fetchVideo();
  });
});
