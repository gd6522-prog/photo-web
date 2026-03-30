@echo off
cd /d "%~dp0\.."
node scripts/sync-store-master-from-elogis.mjs
