"""Private yt-audio conversion service for YouSong.

Compatible with the token flow used by alperensumeroglu/yt-audio-api, with
server-to-server API-key authentication, strict YouTube URL validation,
concurrency limits, bounded downloads, and temporary-file cleanup.

This service uses ordinary yt-dlp + FFmpeg extraction. It does not bypass
YouTube bot checks, access controls, or private/member-only video restrictions.
"""
from __future__ import annotations

import hmac
import logging
import os
import re
import secrets
import shutil
import subprocess
import threading
import time
from pathlib import Path
from urllib.parse import urlparse, parse_qs

from flask import Flask, jsonify, request, send_file
import yt_dlp

APP_DIR = Path(__file__).resolve().parent
DOWNLOAD_DIR = Path(os.environ.get("DOWNLOAD_DIR", "/tmp/yousong-converter")).resolve()
DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
API_KEY = os.environ.get("CONVERTER_API_KEY", "").strip()
TOKEN_TTL_SECONDS = max(60, int(os.environ.get("TOKEN_TTL_SECONDS", "600")))
MAX_FILE_BYTES = max(5, int(os.environ.get("MAX_FILE_MB", "60"))) * 1024 * 1024
MAX_CONCURRENT_JOBS = max(1, int(os.environ.get("MAX_CONCURRENT_JOBS", "2")))
JOB_TIMEOUT_SECONDS = max(30, int(os.environ.get("JOB_TIMEOUT_SECONDS", "240")))
# yt-dlp client selection is configurable for compatibility testing. This is not
# a guarantee against YouTube rate limits or verification challenges.
PLAYER_CLIENTS = [
    item.strip()
    for item in os.environ.get("YTDLP_PLAYER_CLIENTS", "default,web_safari").split(",")
    if item.strip()
]
ALLOWED_HOSTS = {"youtube.com", "youtu.be", "youtube-nocookie.com"}

logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))
logger = logging.getLogger("yousong-converter")
app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 2 * 1024 * 1024

jobs_lock = threading.Lock()
tokens: dict[str, dict[str, object]] = {}
slots = threading.BoundedSemaphore(MAX_CONCURRENT_JOBS)


def _authenticated() -> bool:
    # The converter is intended for server-to-server use only. Never expose it
    # as an unkeyed public MP3 conversion endpoint.
    if not API_KEY:
        return False
    supplied = request.headers.get("X-API-Key", "").strip()
    auth = request.headers.get("Authorization", "")
    if auth.lower().startswith("bearer "):
        supplied = supplied or auth[7:].strip()
    return bool(supplied) and hmac.compare_digest(supplied, API_KEY)


def require_api_key():
    if not API_KEY:
        return jsonify(error="Converter is not configured: set CONVERTER_API_KEY."), 503
    if not _authenticated():
        return jsonify(error="Unauthorized converter request."), 401
    return None


def _video_id(url: str) -> str | None:
    try:
        parsed = urlparse(url)
    except Exception:
        return None
    if parsed.scheme.lower() != "https" or not parsed.hostname:
        return None
    host = parsed.hostname.lower().rstrip(".")
    valid_host = any(host == base or host.endswith("." + base) for base in ALLOWED_HOSTS)
    if not valid_host:
        return None

    query = parse_qs(parsed.query)
    candidate = (query.get("v") or [""])[0]
    if host == "youtu.be":
        candidate = parsed.path.strip("/").split("/")[0] if parsed.path.strip("/") else ""
    if not candidate:
        parts = [part for part in parsed.path.split("/") if part]
        if len(parts) >= 2 and parts[0] in {"shorts", "embed", "live", "v"}:
            candidate = parts[1]
    if re.fullmatch(r"[A-Za-z0-9_-]{11}", candidate or ""):
        return candidate
    return None


def _ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


def _delete_job_files(path: Path) -> None:
    try:
        path.unlink(missing_ok=True)
    except Exception:
        logger.warning("Could not delete temporary conversion file %s", path.name)


def _cleanup_loop() -> None:
    while True:
        time.sleep(30)
        now = time.time()
        expired_paths: list[Path] = []
        with jobs_lock:
            for token, item in list(tokens.items()):
                if float(item.get("expires", 0)) <= now:
                    path = item.get("path")
                    if isinstance(path, Path):
                        expired_paths.append(path)
                    tokens.pop(token, None)
        for path in expired_paths:
            _delete_job_files(path)
        # Guard against temporary files left behind by a process/container restart.
        for path in DOWNLOAD_DIR.glob("*.mp3"):
            try:
                if now - path.stat().st_mtime > TOKEN_TTL_SECONDS * 2:
                    _delete_job_files(path)
            except OSError:
                pass


threading.Thread(target=_cleanup_loop, name="converter-cleanup", daemon=True).start()


@app.get("/health")
def health():
    return jsonify({
        "status": "ok",
        "service": "yousong-yt-audio-converter",
        "ffmpeg": _ffmpeg_available(),
        "apiKeyConfigured": bool(API_KEY),
        "maxFileMb": MAX_FILE_BYTES // (1024 * 1024),
    })


@app.get("/")
def create_conversion():
    auth_error = require_api_key()
    if auth_error:
        return auth_error
    if not _ffmpeg_available():
        return jsonify(error="FFmpeg is not installed on the converter service."), 503

    video_url = (request.args.get("url") or "").strip()
    video_id = _video_id(video_url)
    if not video_id:
        return jsonify(error="Provide a valid HTTPS link to one YouTube video. Playlists and other sites are not supported."), 400
    if not slots.acquire(blocking=False):
        return jsonify(error="The converter is busy. Retry this song in a moment."), 429

    job_id = secrets.token_hex(16)
    output_template = str(DOWNLOAD_DIR / f"{job_id}.%(ext)s")
    logger.info("Starting conversion job=%s video_id=%s", job_id, video_id)

    try:
        ydl_options = {
            "format": "bestaudio/best",
            "outtmpl": output_template,
            "noplaylist": True,
            "max_filesize": MAX_FILE_BYTES,
            "socket_timeout": 25,
            "retries": 1,
            "extractor_retries": 1,
            "quiet": True,
            "no_warnings": True,
            "noprogress": True,
            "js_runtimes": {"node": {}},
            "extractor_args": {"youtube": {"player_client": PLAYER_CLIENTS}},
            "postprocessors": [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "192",
            }],
        }
        with yt_dlp.YoutubeDL(ydl_options) as ydl:
            ydl.download([video_url])

        mp3_path = DOWNLOAD_DIR / f"{job_id}.mp3"
        if not mp3_path.exists() or mp3_path.stat().st_size < 500:
            raise RuntimeError("The extractor did not create a valid MP3 file.")
        if mp3_path.stat().st_size > MAX_FILE_BYTES:
            raise RuntimeError(f"Converted MP3 exceeds the {MAX_FILE_BYTES // (1024 * 1024)} MB limit.")

        token = secrets.token_urlsafe(32)
        with jobs_lock:
            tokens[token] = {"path": mp3_path, "expires": time.time() + TOKEN_TTL_SECONDS, "video_id": video_id}
        logger.info("Conversion ready job=%s bytes=%d", job_id, mp3_path.stat().st_size)
        return jsonify(token=token, expiresInSeconds=TOKEN_TTL_SECONDS, videoId=video_id)
    except Exception as exc:
        for path in DOWNLOAD_DIR.glob(f"{job_id}.*"):
            _delete_job_files(path)
        detail = str(exc).replace(str(DOWNLOAD_DIR), "[temp]")[:1200]
        logger.warning("Conversion failed job=%s reason=%s", job_id, detail)
        if re.search(r"429|too many requests|confirm you.?re not a bot|sign in to confirm|bot verification", detail, re.I):
            return jsonify(error="YouTube refused the converter's request because of rate limiting or a verification check. This service cannot override that restriction.", detail=detail), 502
        return jsonify(error="Could not convert this YouTube video to MP3.", detail=detail), 502
    finally:
        slots.release()


@app.get("/download")
def download_mp3():
    auth_error = require_api_key()
    if auth_error:
        return auth_error
    token = (request.args.get("token") or "").strip()
    if not token:
        return jsonify(error="Missing token parameter."), 400
    with jobs_lock:
        item = tokens.get(token)
        if not item:
            return jsonify(error="Download token is invalid, expired, or already cleaned up."), 401
        if float(item.get("expires", 0)) <= time.time():
            tokens.pop(token, None)
            expired_path = item.get("path")
        else:
            expired_path = None
            path = item.get("path")
    if expired_path:
        if isinstance(expired_path, Path):
            _delete_job_files(expired_path)
        return jsonify(error="Download token has expired. Convert the link again."), 408
    if not isinstance(path, Path) or not path.is_file():
        with jobs_lock:
            tokens.pop(token, None)
        return jsonify(error="The temporary MP3 file is no longer available. Convert the link again."), 404

    response = send_file(path, mimetype="audio/mpeg", as_attachment=True, download_name=f"{item.get('video_id', 'yousong')}.mp3", conditional=True)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


if __name__ == "__main__":
    if not API_KEY:
        raise SystemExit("CONVERTER_API_KEY must be set before starting the converter.")
    port = int(os.environ.get("PORT", "8000"))
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
