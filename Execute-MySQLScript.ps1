[CmdletBinding()]
[OutputType([int])]
param
(
    #Path to MySQL script file
    [Parameter(Mandatory=$true, ValueFromPipelineByPropertyName=$true,Position=0,ParameterSetName="Script")]
    [ValidateScript({Test-Path $_ })]
    [string]$ScriptPath,

    #MySQL command to run
    [Parameter(Mandatory=$true, ValueFromPipelineByPropertyName=$true,Position=0,ParameterSetName="Command")]
    [string]$Command
)

#Wake the site up, thereby starting MySQL.  (MySQLInApp is started as a subprocess by IIS).
$ProgressPreference = "SilentlyContinue"

#Wake the site up, thereby starting MySQL.  (MySQLInApp is started as a subprocess by IIS).
$curlPath = Invoke-Expression -Command 'cmd /c "where curl"'
$siteUrl = "https://$ENV:WEBSITE_HOSTNAME"
if (-not ([String]::IsNullOrWhiteSpace($curlPath))) {
    Invoke-Expression -Command "& ""$curlPath"" ""$siteUrl""" -Verbose -ErrorAction SilentlyContinue  | Out-Null
}
else {
    Write-Warning "curl not in path."
}

if (Test-Path "D:\home\data\mysql\MYSQLCONNSTR_localdb.txt") {
    $ConnectionString = [String]::Format("{0}{1}", "SslMode=none;", (Get-Content -LiteralPath "D:\home\data\mysql\MYSQLCONNSTR_localdb.txt").Replace(":",";Port="))
}
else {
    Write-Error "MYSQLCONNSTR_localdb.txt was not found."
}

#Open the MysqlConnection 
[System.Reflection.Assembly]::LoadWithPartialName("MySql.Data")
try {
    $Connection = New-Object MySql.Data.MySqlClient.MySqlConnection -ArgumentList $ConnectionString
    $Connection.Open()
    Write-Debug "Connection open. (server version is $Connection.ServerVersion)"
}
catch {
    Write-Error "Failed to open connection. ConnectionString was $ConnectionString."  
    Throw $_.Exception
}

#Prepare SQL statement(s)
$SQL = $Command
if ([String]::IsNullOrWhiteSpace($Command)) {
    $SQL = Get-Content $ScriptPath
}

#Execute SQL statement(s)
try {
    $MySqlScript = New-Object -TypeName MySql.Data.MySqlClient.MySqlScript -ArgumentList $Connection, $SQL
    $statementsCount = $MySqlScript.Execute()
    Write-Debug "$statementsCount statements were executed."
}
catch {
    Write-Error 'Something went wrong trying to Execute() the script.'
    Throw $_.Exception
}
finally {
    $Connection.Close()
}
