@echo off
echo Deploying files...

REM get tt-rss to wwwroot
git clone --depth 1 https://git.tt-rss.org/git/tt-rss.git D:\home\site\wwwroot 

REM copy config.php to app
copy D:\home\site\repository\config.php D:\home\site\wwwroot

REM deploy database
powershell -ExecutionPolicy bypass -File D:\home\site\repository\Execute-MySQLScript.ps1 -ScriptPath D:\home\site\wwwroot\schema\ttrss_schema_mysql.sql


REM d:\home\site\wwwroot\app_data\jobs\triggered\{job name}