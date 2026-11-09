# Docker Official Images: library/python; manifest digest verified 2026-11-08.
FROM python:3.14-slim-bookworm@sha256:3fe1a0b6c2d6b2ebb572906cdabeca75aeb558c0c17db5ffefbcf8094871c32b
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONPATH=/app
WORKDIR /app
COPY cloud/strava/requirements.lock /tmp/requirements.lock
RUN python -m pip install --no-cache-dir --only-binary=:all: --require-hashes -r /tmp/requirements.lock \
    && rm /tmp/requirements.lock \
    && groupadd --gid 10001 strava \
    && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin strava
COPY --chown=10001:10001 scripts/strava_cloud/ /app/scripts/strava_cloud/
COPY --chown=10001:10001 scripts/strava_private/__init__.py scripts/strava_private/review.py scripts/strava_private/storage.py scripts/strava_private/sync.py scripts/strava_private/transport.py /app/scripts/strava_private/
COPY --chown=10001:10001 cloud/strava/gunicorn.conf.py /app/cloud/strava/gunicorn.conf.py
USER 10001:10001
EXPOSE 8080
CMD ["python", "-m", "scripts.strava_cloud.worker", "weekly"]
