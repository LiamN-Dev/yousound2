# Deploy this directory as a separate container service from the main YouSong app.
FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates ffmpeg python3 python3-venv \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./requirements.txt
RUN python3 -m venv /opt/yousong-converter \
    && /opt/yousong-converter/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/yousong-converter/bin/pip install --no-cache-dir -r requirements.txt

COPY main.py ./main.py
ENV PATH="/opt/yousong-converter/bin:${PATH}"
ENV DOWNLOAD_DIR=/tmp/yousong-converter
RUN mkdir -p /tmp/yousong-converter

EXPOSE 8000
# One worker is required because expiring download tokens are held in process memory.
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "1", "--threads", "8", "--timeout", "300", "main:app"]
