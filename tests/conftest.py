import pytest
import os
import subprocess

@pytest.fixture(scope="session", autouse=True)
def apply_migrations():
    """
    A pytest fixture to automatically apply Alembic migrations before the test session.
    Skips if the `CI` environment variable is set.
    """
    if os.environ.get("CI"):
        print("CI environment detected, skipping migrations.")
        return

    print("Applying database migrations...")
    try:
        # Using the 'migrate-in' command from the Makefile which runs in docker
        subprocess.run(
            ["make", "migrate-in"],
            check=True,
            capture_output=True,
            text=True,
        )
        print("Migrations applied successfully.")
    except subprocess.CalledProcessError as e:
        print("Failed to apply migrations.")
        print(f"Stdout: {e.stdout}")
        print(f"Stderr: {e.stderr}")
        pytest.exit("Migrations failed, aborting tests.", 1)
