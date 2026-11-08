# YouSong Render container: Node.js app + ffmpeg/ffprobe
FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates ffmpeg \
    && rm -rf /var/lib/apt/lists/* \
    && ffmpeg -version >/dev/null \
    && ffprobe -version >/dev/null

WORKDIR /app

# Keep dev dependencies because the start script uses tsx.
COPY package.json ./
RUN npm install --include=dev

COPY . .

# Render service env vars are also provided as Docker build args. This value is
# consumed by Vite at build time, so it must be declared in this build stage.
ARG VITE_GOOGLE_CROSSY_ROAD_URL=""
ARG VITE_GOOGLE_CROSSY_ROAD_ENABLED=""
ENV VITE_GOOGLE_CROSSY_ROAD_URL=${VITE_GOOGLE_CROSSY_ROAD_URL}
ENV VITE_GOOGLE_CROSSY_ROAD_ENABLED=${VITE_GOOGLE_CROSSY_ROAD_ENABLED}

RUN npm run build

ENV NODE_ENV=production
EXPOSE 10000
CMD ["npm", "start"]
