from __future__ import annotations

import re
import secrets
import string
from typing import Tuple


class PasswordPolicy:
    min_length = 12
    max_bytes = 72  # bcrypt ignores everything after 72 bytes
    require_special = True
    require_number = True
    require_uppercase = True

    @classmethod
    def validate(cls, password: str) -> Tuple[bool, str]:
        if len(password) < cls.min_length:
            return False, f"Password must be at least {cls.min_length} characters."
        if len(password.encode("utf-8")) > cls.max_bytes:
            return False, f"Password must be at most {cls.max_bytes} bytes long."
        if cls.require_special and not re.search(r"[^A-Za-z0-9]", password):
            return False, "Password must include a special character."
        if cls.require_number and not re.search(r"\d", password):
            return False, "Password must include a number."
        if cls.require_uppercase and not re.search(r"[A-Z]", password):
            return False, "Password must include an uppercase letter."
        return True, "OK"

    @staticmethod
    def generate() -> str:
        """Return a cryptographically strong password suggestion."""
        alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
        while True:
            candidate = "".join(secrets.choice(alphabet) for _ in range(16))
            if PasswordPolicy.validate(candidate)[0]:
                return candidate

