"""Two-step Telegram login (no interactive stdin needed).
  python login.py send +998XXXXXXXXX      -> asks Telegram to send a login code
  python login.py code 12345 [2fa-pass]   -> signs in and saves the session file
Credentials come from ../../.env and are never printed. Read-only use of the account."""
import asyncio, json, os, sys
from pathlib import Path
from dotenv import load_dotenv
from telethon import TelegramClient
from telethon.errors import SessionPasswordNeededError

HERE = Path(__file__).parent
load_dotenv(HERE.parent.parent / ".env")
STATE = HERE / ".state"; STATE.mkdir(exist_ok=True)
SESSION = str(STATE / "course")

async def main():
    api_id, api_hash = int(os.environ["TG_API_ID"]), os.environ["TG_API_HASH"]
    client = TelegramClient(SESSION, api_id, api_hash)
    await client.connect()
    cmd = sys.argv[1]
    if cmd == "send":
        phone = sys.argv[2]
        sent = await client.send_code_request(phone)
        (STATE / "pending.json").write_text(json.dumps({"phone": phone, "hash": sent.phone_code_hash}))
        print("CODE_SENT")
    elif cmd == "code":
        p = json.loads((STATE / "pending.json").read_text())
        try:
            await client.sign_in(p["phone"], sys.argv[2], phone_code_hash=p["hash"])
        except SessionPasswordNeededError:
            if len(sys.argv) < 4:
                print("NEEDS_2FA"); await client.disconnect(); return
            await client.sign_in(password=sys.argv[3])
        me = await client.get_me()
        print("LOGGED_IN", bool(me))
    elif cmd == "status":
        print("AUTHORIZED", await client.is_user_authorized())
    await client.disconnect()

asyncio.run(main())
