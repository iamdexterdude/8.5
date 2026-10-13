// Where the homework lives and how the app reads it. One link for the student: nothing to type, nothing to set up.
export const OWNER = "iamdexterdude", REPO = "8.5-feed", BRANCH = "main";
export const RAW = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}`;
// The relay: publishes for the teacher (password) and carries her files to the teacher's Telegram. Its secrets never reach the app.
export const RELAY = "https://eight-five-publish.vercel.app/api";
// The feed files are scrambled with this key so the public repository is not readable at a glance. It is not a secret: the app is public too.
export const FEED_KEY = "thDfTHreYGQRbVyxZKDZkPebruhjcAxQBQtuZfc9";
export const SITE = "https://iamdexterdude.github.io/8.5/";
// The Telegram bot that reaches Claude Code on the teacher's PC (the "Tell Claude" screen).
export const CLAUDE_BOT = "claudeofmine_bot";
