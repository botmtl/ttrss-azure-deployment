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
    [string]$Command,

    #Defaults to correct MySQLInApp connection string for this instance
    #MySQL connector needs a seperate Port= section in the connection string
    [Parameter(Mandatory=$false, Position=1)]
    [ValidateScript({ -not ($ConnectionString -eq "") })]
    [string]$ConnectionString = 
        [String]::Format("{0}{1}", 
                            "SslMode=none;", 
                            (Get-Content -LiteralPath "D:\home\data\mysql\MYSQLCONNSTR_localdb.txt").Replace(":",";Port="))
)

#Wake the site up, thereby starting MySQL.  (MySQLInApp is started as a subprocess by IIS).
$ProgressPreference = "SilentlyContinue"
Invoke-WebRequest -URI "https://$ENV:WEBSITE_HOSTNAME" -UseBasicParsing -ErrorAction SilentlyContinue

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
