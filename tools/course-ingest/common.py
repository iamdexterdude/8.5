import os
from pathlib import Path
from dotenv import load_dotenv
from telethon import TelegramClient
HERE = Path(__file__).parent
ROOT = HERE.parent.parent
load_dotenv(ROOT / ".env")
STATE = HERE / ".state"
COURSE = ROOT / "course"          # git-ignored: raw downloads, text, transcripts
def client():
    return TelegramClient(str(STATE / "course"), int(os.environ["TG_API_ID"]), os.environ["TG_API_HASH"])
