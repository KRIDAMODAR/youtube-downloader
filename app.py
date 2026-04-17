import os
import uuid
import threading
import time
from pathlib import Path

from flask import Flask, request, jsonify, send_file, after_this_request
from flask_cors import CORS
import yt_dlp

app = Flask(__name__)
CORS(app, origins=["*"])  # Production లో specific domain పెట్టండి

DOWNLOAD_DIR = Path("downloads")
DOWNLOAD_DIR.mkdir(exist_ok=True)

# ── Auto-cleanup: 15 నిమిషాల తర్వాత file delete అవుతుంది ──────────────────
def _cleanup_file(path: Path, delay: int = 900):
    def _delete():
        time.sleep(delay)
        try:
            path.unlink(missing_ok=True)
        except Exception:
            pass
    threading.Thread(target=_delete, daemon=True).start()


# ── Quality → yt-dlp format string mapping ───────────────────────────────────
VIDEO_FORMAT_MAP = {
    "360":  "bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/best[height<=360][ext=mp4]/best[height<=360]",
    "480":  "bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]/best[height<=480]",
    "720":  "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best[height<=720]",
    "1080": "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best[height<=1080]",
    "1440": "bestvideo[height<=1440][ext=mp4]+bestaudio[ext=m4a]/best[height<=1440][ext=mp4]/best[height<=1440]",
    "2160": "bestvideo[height<=2160][ext=mp4]+bestaudio[ext=m4a]/best[height<=2160][ext=mp4]/best[height<=2160]",
}

AUDIO_BITRATE_MAP = {
    "128": "128",
    "192": "192",
    "320": "320",
}


# ── Helper: validate YouTube URL ─────────────────────────────────────────────
def is_valid_youtube_url(url: str) -> bool:
    return "youtube.com" in url or "youtu.be" in url


# ── /api/info  — video metadata తెప్పించుకోవడానికి (optional) ────────────────
@app.route("/api/info", methods=["POST"])
def get_info():
    data = request.get_json(silent=True) or {}
    url = (data.get("url") or "").strip()

    if not url or not is_valid_youtube_url(url):
        return jsonify({"error": "Invalid or missing YouTube URL"}), 400

    ydl_opts = {"quiet": True, "no_warnings": True, "skip_download": True}

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
        return jsonify({
            "title":     info.get("title"),
            "thumbnail": info.get("thumbnail"),
            "duration":  info.get("duration"),
            "uploader":  info.get("uploader"),
        })
    except yt_dlp.utils.DownloadError as e:
        return jsonify({"error": str(e)}), 422
    except Exception as e:
        return jsonify({"error": f"Unexpected error: {e}"}), 500


# ── /api/download  — actual download endpoint ────────────────────────────────
@app.route("/api/download", methods=["POST"])
def download():
    data = request.get_json(silent=True) or {}
    url          = (data.get("url") or "").strip()
    mode         = data.get("downloadMode", "auto")      # "audio" | "auto"
    video_quality = str(data.get("videoQuality", "1080"))
    audio_bitrate = str(data.get("audioBitrate", "192"))

    # ── Validation ────────────────────────────────────────────────────────────
    if not url or not is_valid_youtube_url(url):
        return jsonify({"error": {"code": "invalid_url",
                                  "message": "Valid YouTube URL required"}}), 400

    uid = uuid.uuid4().hex[:12]

    # ── Audio download ────────────────────────────────────────────────────────
    if mode == "audio":
        bitrate = AUDIO_BITRATE_MAP.get(audio_bitrate, "192")
        out_path = DOWNLOAD_DIR / f"{uid}.mp3"

        ydl_opts = {
            "format": "bestaudio/best",
            "outtmpl": str(DOWNLOAD_DIR / uid),
            "quiet": True,
            "no_warnings": True,
            "postprocessors": [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": bitrate,
            }],
            "postprocessor_args": ["-ar", "44100"],
        }

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
            title = info.get("title", "audio")
        except yt_dlp.utils.DownloadError as e:
            return jsonify({"error": {"code": "download_failed", "message": str(e)}}), 422
        except Exception as e:
            return jsonify({"error": {"code": "server_error", "message": str(e)}}), 500

        # yt-dlp గా .mp3 suffix add అవుతుంది
        actual_path = DOWNLOAD_DIR / f"{uid}.mp3"
        if not actual_path.exists():
            return jsonify({"error": {"code": "file_not_found",
                                      "message": "Download succeeded but file missing"}}), 500

        _cleanup_file(actual_path)

        @after_this_request
        def _noop(response):
            return response

        return send_file(
            actual_path,
            as_attachment=True,
            download_name=f"{title[:80]}.mp3",
            mimetype="audio/mpeg",
        )

    # ── Video download ────────────────────────────────────────────────────────
    fmt = VIDEO_FORMAT_MAP.get(video_quality, VIDEO_FORMAT_MAP["1080"])
    out_template = str(DOWNLOAD_DIR / f"{uid}.%(ext)s")

    ydl_opts = {
        "format": fmt,
        "outtmpl": out_template,
        "quiet": True,
        "no_warnings": True,
        "merge_output_format": "mp4",
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
        title = info.get("title", "video")
    except yt_dlp.utils.DownloadError as e:
        return jsonify({"error": {"code": "download_failed", "message": str(e)}}), 422
    except Exception as e:
        return jsonify({"error": {"code": "server_error", "message": str(e)}}), 500

    # Download అయిన file ని వెతకండి
    candidates = list(DOWNLOAD_DIR.glob(f"{uid}.*"))
    if not candidates:
        return jsonify({"error": {"code": "file_not_found",
                                  "message": "Download succeeded but file missing"}}), 500

    actual_path = candidates[0]
    _cleanup_file(actual_path)

    quality_label = "4K" if video_quality == "2160" else f"{video_quality}p"

    return send_file(
        actual_path,
        as_attachment=True,
        download_name=f"{title[:80]}_{quality_label}.mp4",
        mimetype="video/mp4",
    )


# ── Health check ──────────────────────────────────────────────────────────────
@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "YTDrop Backend"})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "false").lower() == "true"
    app.run(host="0.0.0.0", port=port, debug=debug)
