# 8.5 relay

One small serverless function on Vercel (free plan). It holds the secrets the app must never carry:

- `GITHUB_TOKEN`: writes to the feed repository (`FEED_REPO`, default `iamdexterdude/8.5-feed`)
- `TG_BOT_TOKEN` and `TG_CHAT_ID`: the Telegram bot and chat that receive her PDFs and recordings

The teacher's password is not stored here. Its salted hash is `teacher.json` in the feed repository
(set or changed with `node tools/teacher/publish.mjs password`); every teacher call is checked against it.

Deploy from this folder: `vercel --prod` (the project is linked in `.vercel/`). Secrets: `vercel env add NAME production`.
