function Execute-MySQLScript
{
    [CmdletBinding()]
    [OutputType([int])]
    param
    (
        #Literal path to mysql script
        [Parameter(Mandatory=$true, ValueFromPipelineByPropertyName=$true,Position=0)]
        [ValidateScript({Test-Path -LiteralPath $_ })]
        [string]$Path,
        
        #Defaults to correct MySQLInApp connection string for this instance
        [Parameter(Mandatory=$false)]
        [string]$ConnectionString = {
            [String]::Format("{0}{1}", 
                             "SslMode=none;", 
                             (Get-Content -LiteralPath "D:\home\data\mysql\MYSQLCONNSTR_localdb.txt").Replace(":",";Port="))
        }
    )

    Begin
    {
        [System.Reflection.Assembly]::LoadWithPartialName("MySql.Data")

        #Open connection to localdb
        $Connection = New-Object MySql.Data.MySqlClient.MySqlConnection -ArgumentList $ConnectionString
        $Connection.Open()
        Write-Debug "Connection open. (server version is $Connection.ServerVersion)"

    }

    Process
    {
        $dbInitScript = Get-Content $Path
        $MySqlScript = New-Object -TypeName MySql.Data.MySqlClient.MySqlScript -ArgumentList $Connection, $dbInitScript
        try {
            $statementsCount = $MySqlScript.Execute();
            Write-Debug "$statementsCount statements were executed."
        }
        catch {
            Write-Error 'Something went wrong'.
        }
    }

    End
    {
        $Connection.Close()
    }
}

Execute-MySQLScript -path .\ttrss_schema.mysql

#
# Script1.ps1
#
#[void][System.Reflection.Assembly]::LoadWithPartialName("MySql.Data")
#$ConnectionString = Get-Content "D:\home\data\mysql\MYSQLCONNSTR_localdb.txt"
#$ConnectionString = "SslMode=none;" + $ConnectionString
#$ConnectionString = $ConnectionString.Replace(':',';Port=')
#$Connection = New-Object MySql.Data.MySqlClient.MySqlConnection
#$Connection.ConnectionString = $ConnectionString
#$Connection.Open()
#$dbInitScript = Get-Content "ttrss_schema.mysql"
#$MysqlScript= New-Object MySql.Data.MySqlClient.MysqlScript -ArgumentList $Connection,$dbInitScript
#$MysqlScript.execute()
