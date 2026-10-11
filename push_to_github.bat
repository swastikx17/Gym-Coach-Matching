@echo off
title Push to GitHub - Gym Coach Matching
cd /d "%~dp0"
echo ========================================================
echo  Pushing Gym Coach Matching Project to GitHub
echo  Target: https://github.com/swastikx17/Gym-Coach-Matching.git
echo ========================================================
git push -u origin main
echo ========================================================
echo Done! If prompted, sign in via browser to authorize GitHub.
echo ========================================================
pause
