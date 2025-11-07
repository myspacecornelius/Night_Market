from __future__ import annotations

import re
from typing import Tuple

from passlib.pwd import genword


class PasswordPolicy:
    min_length = 12
    require_special = True
    require_number = True
    require_uppercase = True

    @classmethod
    def validate(cls, password: str) -> Tuple[bool, str]:
        if len(password) < cls.min_length:
            return False, f"Password must be at least {cls.min_length} characters."
        if cls.require_special and not re.search(r"[!@#$%^&*(),.?\":{}|<>]", password):
            return False, "Password must include a special character."
        if cls.require_number and not re.search(r"\d", password):
            return False, "Password must include a number."
        if cls.require_uppercase and not re.search(r"[A-Z]", password):
            return False, "Password must include an uppercase letter."
        return True, "OK"

    @staticmethod
    def generate() -> str:
        """Return a cryptographically strong password suggestion."""
        return genword(entropy=56, charset="ascii_62")

