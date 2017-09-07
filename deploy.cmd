@echo off
echo Deploying files...

erase d:\home\site\wwwroot\hostingstart.html

REM get tt-rss to wwwroot
git clone --depth 1 https://git.tt-rss.org/git/tt-rss.git d:\home\site\wwwroot 

REM copy config.php to app
copy d:\home\site\repository\config.php d:\home\site\wwwroot

REM deploy database
mkdir d:\home\site\deployments\tools\PostDeploymentActions
copy d:\home\site\repository\InitializeDatabase.cmd d:\home\site\deployments\tools\PostDeploymentActions

REM Jobs
mkdir d:\home\site\wwwroot\app_data\jobs\continuous\updateFeeds
copy d:\home\site\repository\updateFeeds.cmd d:\home\site\wwwroot\app_data\jobs\continuous\updateFeeds\updateFeeds.cmd 
copy d:\home\site\repository\settings.job d:\home\site\wwwroot\app_data\jobs\continuous\updateFeeds\settings.job

mkdir d:\home\site\wwwroot\app_data\jobs\triggered\DeleteCache
copy d:\home\site\repository\DeleteCache.cmd d:\home\site\wwwroot\app_data\jobs\triggered\DeleteCache\DeleteCache.cmd

mkdir d:\home\site\wwwroot\app_data\jobs\triggered\forceUpdateFeeds
copy d:\home\site\repository\forceUpdateFeeds.cmd d:\home\site\wwwroot\app_data\jobs\triggered\forceUpdateFeeds\forceUpdateFeeds.cmd

mkdir d:\home\site\wwwroot\app_data\jobs\triggered\resetDatabase
copy d:\home\site\repository\InitializeDatabase.cmd d:\home\site\wwwroot\app_data\jobs\triggered\resetDatabase\resetDatabase.cmd

