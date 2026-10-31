FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    STOCKFISH_PATH=/usr/local/bin/stockfish \
    PORT=8080

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl tar \
    && rm -rf /var/lib/apt/lists/*

ARG STOCKFISH_URL=https://github.com/official-stockfish/Stockfish/releases/download/sf_19/stockfish-linux-x86-64-universal.tar.gz
ARG STOCKFISH_SHA256=9defc0d4e55d49c65a6d042f3e571a39fcea499ade6dbe741b53b8c65e03611f
RUN curl -fsSL "$STOCKFISH_URL" -o /tmp/stockfish.tar.gz \
    && echo "$STOCKFISH_SHA256  /tmp/stockfish.tar.gz" | sha256sum -c - \
    && mkdir -p /tmp/sf \
    && tar -xzf /tmp/stockfish.tar.gz -C /tmp/sf \
    && find /tmp/sf -type f -name 'stockfish*' -perm -u+x -exec cp {} /usr/local/bin/stockfish \; \
    && test -x /usr/local/bin/stockfish \
    && rm -rf /tmp/sf /tmp/stockfish.tar.gz \
    && chmod 0755 /usr/local/bin/stockfish

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py NOTICE ./
RUN useradd --system --uid 10001 --create-home chessflow \
    && chown -R chessflow:chessflow /app
USER chessflow
EXPOSE 8080
CMD ["sh", "-c", "uvicorn app:app --host 0.0.0.0 --port ${PORT:-8080}"]
