@echo off
rem Moves the 8.5 Telegram messages to a new bot: paste its token from @BotFather, then press Start in the bot.
node "%~dp0set-bot.mjs" %*
echo.
pause
