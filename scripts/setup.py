"""Install project hooks without replacing foreign hooks or global settings."""

from pathlib import Path
from install_hooks import install

root = Path(__file__).resolve().parents[1]
install(root)
install(root, "pre-push")
