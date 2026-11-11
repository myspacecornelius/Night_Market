"""Signing and verifying the API's access tokens.

The only module that talks to the JWT library, so the rest of the code does not
depend on which one it is.
"""
import jwt

from services.core.security import ALGORITHM, SECRET_KEY


class TokenError(Exception):
    """The token is malformed, was not signed with our key, has expired or has no expiry."""


def encode_token(claims: dict) -> str:
    return jwt.encode(claims, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    """Claims of a token signed with our key.

    A token must carry an expiry. "Issued at" is not checked: it is informational
    here, and rejecting a token because another server's clock runs a second ahead
    would sign people out for no reason.
    """
    try:
        return jwt.decode(
            token, SECRET_KEY, algorithms=[ALGORITHM],
            options={"require": ["exp"], "verify_iat": False},
        )
    except jwt.InvalidTokenError as error:
        raise TokenError(str(error)) from error
