@echo off
echo Deploying files...

cd /d d:\home\site\wwwroot & rd /s .

REM get tt-rss to wwwroot
git clone --depth 1 https://git.tt-rss.org/git/tt-rss.git D:\home\site\wwwroot 

REM copy config.php to app
copy %DEPLOYMENT_SOURCE%\config.php %DEPLOYMENT_TARGET%

REM deploy database
powershell %DEPLOYMENT_SOURCE%\Execute-MySQLScript.ps1 -Path %DEPLOYMENT_TARGET%\schema\ttrss_schema_mysql.sql


REM d:\home\site\wwwroot\app_data\jobs\triggered\{job name}