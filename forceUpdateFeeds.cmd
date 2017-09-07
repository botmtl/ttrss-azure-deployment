REM Wake up site
"D:\Program Files (x86)\Git\usr\bin\curl.exe" %WEBSITE_HOSTNAME% > nul
REM Update Feeds
"D:\Program Files (x86)\PHP\v7.0\php.exe" "D:\home\site\wwwroot\update.php" --feeds --force-update
