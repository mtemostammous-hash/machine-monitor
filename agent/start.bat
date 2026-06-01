@echo off
title Machine Monitor Agent
set SERVER_URL=http://192.168.1.114:3001
cd /d C:\Users\moham\Projects\machine-monitor\agent
echo [%date% %time%] Agent starting - SERVER_URL=%SERVER_URL% >> agent_launch.log
"C:\Users\moham\AppData\Local\hermes\node\node.exe" agent.js
