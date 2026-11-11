"""Grant or revoke admin rights for an existing account.

    python -m services.admin.promote <username>            # make the user an admin
    python -m services.admin.promote <username> --revoke   # remove admin rights

Admin rights live only in users.is_admin. Run this with database access (for example
`docker compose exec api python -m services.admin.promote alice`).
"""
import argparse
import sys
from typing import Optional, Sequence

from sqlalchemy.orm import Session

from services.models.user import User


def set_admin(db: Session, username: str, is_admin: bool = True) -> Optional[User]:
    """Set users.is_admin for ``username``. Returns the user, or None if there is no such account."""
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        return None
    user.is_admin = is_admin
    db.flush()
    return user


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("username")
    parser.add_argument("--revoke", action="store_true", help="remove admin rights instead of granting them")
    args = parser.parse_args(argv)

    from services.database import session_scope

    with session_scope() as db:
        user = set_admin(db, args.username, is_admin=not args.revoke)
        if user is None:
            print(f"No account named {args.username!r}", file=sys.stderr)
            return 1
        print(f"{user.username}: is_admin = {user.is_admin}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
