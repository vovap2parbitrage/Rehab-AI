"""Unit-test environment: lets the app import without a .env file."""

import os

os.environ.setdefault("SECRET_KEY", "test-secret-key-for-ci-only-0123456789abcdef")
