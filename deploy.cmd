@echo off
echo Deploying files...

erase d:\home\site\wwwroot\hostingstart.html

REM get tt-rss to wwwroot
git clone --depth 1 https://git.tt-rss.org/git/tt-rss.git d:\home\site\wwwroot 

REM copy config.php to app
copy d:\home\site\repository\config.php d:\home\site\wwwroot

REM deploy database
powershell -ExecutionPolicy bypass -File d:\home\site\repository\Execute-MySQLScript.ps1 -ScriptPath D:\home\site\wwwroot\schema\ttrss_schema_mysql.sql

REM d:\home\site\wwwroot\app_data\jobs\triggered\updateFeeds
copy d:\home\site\repository\updateFeeds.cmd d:\home\site\wwwroot\app_data\jobs\triggered\updateFeeds\updateFeeds.cmd 
copy d:\home\site\repository\settings.job d:\home\site\wwwroot\app_data\jobs\triggered\updateFeeds\settings.job
