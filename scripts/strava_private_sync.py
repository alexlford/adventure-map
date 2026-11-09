#!/usr/bin/env python3
"""Local Mac entry point. No live operations occur on import."""
from strava_private.cli import main

if __name__ == "__main__":
    raise SystemExit(main())
