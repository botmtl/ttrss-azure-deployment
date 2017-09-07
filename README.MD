
[![Deploy to Azure](http://azuredeploy.net/deploybutton.png)](https://azuredeploy.net/)

# READ THIS before you deploy
If you are having issues with DEPLOYEMENT, file a [ISSUE here, on github](https://github.com/botmtl/ttrss-azure-deployment/issues).  DO NOT use the Tiny-Tiny RSS discussion board for deployement issues.

Initial username and password are admin/password.  Change that ASAP.

This Tiny-Tiny RSS deployement is made on an UNSUPORTED PLATFORM.  If you are having issues with Tiny-Tiny RSS, DO NOT post in the main forum, use the [UNSUPPORTED-PLATFORMS](https://discourse.tt-rss.org/c/tiny-tiny-rss/unsupported-platforms/) section of the forum.  Clearly state the platform you are using (IIS/mysql) and your provider (Azure) and the the issue you are having.  If you are unsure, create an [issue here](https://github.com/botmtl/ttrss-azure-deployment/issues) first and I will tell you if this needs the tt-rss forum or not.

# How is this deployement different than the [BITNAMI deployement](https://azuremarketplace.microsoft.com/en-us/marketplace/apps/bitnami.tinytinyrss?tab=Overview)?
- This deployement does not create or use a (costly) virtual machine.  

# Free?
- This deployement uses a standard Web-App with a Mysql-In-App database.
- Feed updates are scheduled with the WebJobs module ("0 */4 * * *")
- These Azure modules are free to use (this project can be deployed on a student [Microsoft Imagine](https://imagine.microsoft.com/) subscription).
- Usual restrictions apply (1Tb disk space and you can't abuse your free default vm without it disabling itself until the end of the month).

# WebJobs dashboard
- Check your WebJobs dashboard after deployement for a few debug/helper jobs.
![Webjobs Dashboard](https://github.com/botmtl/ttrss-azure-deployment/raw/master/AzureWebjobs.jpg "Webjobs")