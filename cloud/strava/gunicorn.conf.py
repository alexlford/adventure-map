"""The WSGI app emits fixed operational codes; never log request URLs/errors."""

import os

bind = "0.0.0.0:" + os.environ.get("PORT", "8080")
workers = 1
threads = 1
timeout = 60
graceful_timeout = 10
accesslog = None
errorlog = "/dev/null"
capture_output = False
disable_redirect_access_to_syslog = True
loglevel = "critical"
