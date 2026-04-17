// server.js — YTGrab Backend (Node.js + Express + yt-dlp)
const express = require('express');
const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static frontend files
app.use(express.static(path.join(__dirname, 'public')));

// ─── Rate limiting (simple in-memory) ───────────────────────────────────────
const rateMap = new Map();
function rateLimit(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const window = 60 * 1000; // 1 minute
  const limit = 10;

  if (!rateMap.has(ip)) rateMap.set(ip, []);
  const times = rateMap.get(ip).filter(t => now - t < window);
  times.push(now);
  rateMap.set(ip, times);

  if (times.length > limit) {
    return res.status(429).json({ error: 'Too many requests. Please wait a minute.' });
  }
  next();
}

// ─── Helper: run yt-dlp ──────────────────────────────────────────────────────
function ytdlp(args) {
  return new Promise((resolve, reject) => {
    exec(`yt-dlp ${args}`, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) return reject(new Error(stderr || err.message));
      resolve(stdout.trim());
    });
  });
}

// ─── GET /api/info ────────────────────────────────────────────────────────────
// Returns video metadata + available formats
app.get('/api/info', rateLimit, async (req, res) => {
  const { url } = req.query;

  if (!url) return res.status(400).json({ error: 'URL is required' });
  if (!isValidYouTubeUrl(url)) return res.status(400).json({ error: 'Invalid YouTube URL' });

  try {
    const raw = await ytdlp(`--dump-json --no-playlist "${url}"`);
    const info = JSON.parse(raw);

    // Build clean format list
    const seen = new Set();
    const formats = [];

    // Video formats (best per resolution)
    const videoResolutions = [2160, 1440, 1080, 720, 480, 360, 240, 144];
    for (const height of videoResolutions) {
      const fmt = info.formats
        .filter(f => f.height === height && f.vcodec !== 'none' && f.acodec !== 'none')
        .sort((a, b) => (b.filesize || 0) - (a.filesize || 0))[0];

      if (fmt && !seen.has(height)) {
        seen.add(height);
        formats.push({
          format_id: fmt.format_id,
          label: height >= 1080 ? `${height}p` : `${height}p`,
          ext: fmt.ext || 'mp4',
          isAudio: false,
          filesize: fmt.filesize ? formatBytes(fmt.filesize) : '',
        });
      }
    }

    // MP3 audio option
    formats.push({
      format_id: 'bestaudio',
      label: 'MP3',
      ext: 'mp3',
      isAudio: true,
      filesize: '',
    });

    res.json({
      title: info.title,
      channel: info.uploader || info.channel || 'Unknown',
      duration: info.duration,
      views: info.view_count,
      thumbnail: info.thumbnail,
      formats: formats.length > 1 ? formats : getFallbackFormats(),
    });

  } catch (err) {
    console.error('[/api/info]', err.message);
    res.status(500).json({ error: 'Could not fetch video info. The video may be private or unavailable.' });
  }
});

// ─── GET /api/download ────────────────────────────────────────────────────────
// Streams the download directly to the client
app.get('/api/download', rateLimit, async (req, res) => {
  const { url, format_id, ext } = req.query;

  if (!url || !format_id) return res.status(400).json({ error: 'url and format_id are required' });
  if (!isValidYouTubeUrl(url)) return res.status(400).json({ error: 'Invalid YouTube URL' });

  try {
    // Get title for filename
    let title = 'video';
    try {
      const info = await ytdlp(`--print title --no-playlist "${url}"`);
      title = info.replace(/[^\w\s\-]/g, '').trim().substring(0, 80);
    } catch {}

    const isAudio = format_id === 'bestaudio' || ext === 'mp3';
    const outputExt = isAudio ? 'mp3' : 'mp4';
    const filename = `${title}.${outputExt}`;

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', isAudio ? 'audio/mpeg' : 'video/mp4');

    const args = isAudio
      ? ['-f', 'bestaudio', '--extract-audio', '--audio-format', 'mp3', '-o', '-', url]
      : ['-f', `${format_id}+bestaudio/best`, '--merge-output-format', 'mp4', '-o', '-', url];

    const proc = spawn('yt-dlp', args);
    proc.stdout.pipe(res);

    proc.stderr.on('data', (d) => {
      // Log progress but don't expose to client
      process.stdout.write(d);
    });

    proc.on('error', (err) => {
      console.error('[download spawn error]', err.message);
      if (!res.headersSent) res.status(500).end();
    });

    req.on('close', () => proc.kill());

  } catch (err) {
    console.error('[/api/download]', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'Download failed.' });
  }
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
function isValidYouTubeUrl(url) {
  return /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/|playlist\?list=)|youtu\.be\/)/.test(url);
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(0) + ' MB';
}

function getFallbackFormats() {
  return [
    { format_id: 'bestvideo[height=1080]+bestaudio/best', label: '1080p', ext: 'mp4', isAudio: false, filesize: '' },
    { format_id: 'bestvideo[height=720]+bestaudio/best',  label: '720p',  ext: 'mp4', isAudio: false, filesize: '' },
    { format_id: 'bestvideo[height=480]+bestaudio/best',  label: '480p',  ext: 'mp4', isAudio: false, filesize: '' },
    { format_id: 'bestvideo[height=360]+bestaudio/best',  label: '360p',  ext: 'mp4', isAudio: false, filesize: '' },
    { format_id: 'bestaudio', label: 'MP3', ext: 'mp3', isAudio: true, filesize: '' },
  ];
}

// ─── Start server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅  YTGrab running at http://localhost:${PORT}`);
});
