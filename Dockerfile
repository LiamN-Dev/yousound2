# YouSong Render container: Node.js app + ffmpeg/ffprobe + yt-dlp
FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

# ffmpeg package also provides ffprobe; Python venv avoids Debian's externally-managed pip policy.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates ffmpeg python3 python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp into its own virtual environment and expose it at the path used by the app.
RUN python3 -m venv /opt/yt-dlp \
    && /opt/yt-dlp/bin/pip install --no-cache-dir --upgrade pip "yt-dlp[default]" \
    && ln -s /opt/yt-dlp/bin/yt-dlp /usr/local/bin/yt-dlp \
    && ffmpeg -version >/dev/null \
    && ffprobe -version >/dev/null \
    && yt-dlp --version \
    && yt-dlp --js-runtimes node --version \
    && node --version

WORKDIR /app

# package.json is at the repository root. Keep dev dependencies because the start script uses tsx.
COPY package.json ./
RUN npm install --include=dev

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 10000
CMD ["npm", "start"]
