# 8.5 relay

One small serverless function on Vercel (free plan). It holds the secrets the app must never carry:

- `GITHUB_TOKEN`: writes to the feed repository (`FEED_REPO`, default `iamdexterdude/8.5-feed`)
- `TG_BOT_TOKEN` and `TG_CHAT_ID`: the Telegram bot and chat that receive her PDFs and recordings

The teacher's password is not stored here. Its salted hash is `teacher.json` in the feed repository
(set or changed with `node tools/teacher/publish.mjs password`); every teacher call is checked against it.

- `TEACHER_PEPPER`: a secret mixed into the password hash. Vercel will not hand it back (`vercel env pull` writes it empty), so the same value is kept in `backend/.env.local` (git-ignored) for the command-line tool. If it is ever lost: make a new one, set it in both places, redeploy, then set the password again.

Deploy from this folder: `vercel --prod` (the project is linked in `.vercel/`). Secrets: `vercel env add NAME production`.
