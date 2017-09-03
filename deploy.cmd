@echo off
echo Deploying files...

erase d:\home\site\wwwroot\hostingstart.html

REM get tt-rss to wwwroot
git clone --depth 1 https://git.tt-rss.org/git/tt-rss.git d:\home\site\wwwroot 

REM copy config.php to app
copy d:\home\site\repository\config.php d:\home\site\wwwroot

REM deploy database
mkdir d:\home\site\deployments\tools\PostDeploymentActions
copy InitializeDatabase.cmd d:\home\site\deployments\tools\PostDeploymentActions

REM d:\home\site\wwwroot\app_data\jobs\triggered\updateFeeds
mkdir d:\home\site\wwwroot\app_data\jobs\triggered\updateFeeds
copy d:\home\site\repository\updateFeeds.cmd d:\home\site\wwwroot\app_data\jobs\triggered\updateFeeds\updateFeeds.cmd 
copy d:\home\site\repository\settings.job d:\home\site\wwwroot\app_data\jobs\triggered\updateFeeds\settings.job
