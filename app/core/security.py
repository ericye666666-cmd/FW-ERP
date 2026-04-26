from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
from typing import Any


PBKDF2_ITERATIONS = 390000
HASH_ALGORITHM = "sha256"
SALT_BYTES = 16
TOKEN_BYTES = 32


def hash_password(password: str) -> dict[str, Any]:
    salt = secrets.token_bytes(SALT_BYTES)
    digest = hashlib.pbkdf2_hmac(
        HASH_ALGORITHM,
        password.encode("utf-8"),
        salt,
        PBKDF2_ITERATIONS,
    )
    return {
        "password_hash": base64.b64encode(digest).decode("utf-8"),
        "password_salt": base64.b64encode(salt).decode("utf-8"),
        "password_algorithm": f"pbkdf2_{HASH_ALGORITHM}",
        "password_iterations": PBKDF2_ITERATIONS,
    }


def verify_password(password: str, user: dict[str, Any]) -> bool:
    encoded_hash = user.get("password_hash")
    encoded_salt = user.get("password_salt")
    iterations = user.get("password_iterations", PBKDF2_ITERATIONS)
    if not encoded_hash or not encoded_salt:
        return False

    salt = base64.b64decode(encoded_salt.encode("utf-8"))
    expected = base64.b64decode(encoded_hash.encode("utf-8"))
    actual = hashlib.pbkdf2_hmac(
        HASH_ALGORITHM,
        password.encode("utf-8"),
        salt,
        iterations,
    )
    return hmac.compare_digest(actual, expected)


def generate_session_token() -> str:
    return secrets.token_urlsafe(TOKEN_BYTES)
