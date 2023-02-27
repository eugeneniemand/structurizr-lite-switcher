$port = 9052
$url = "http://localhost:$port/workspace/diagrams"

function Pull-SLSLatestImage {
    docker pull structurizr/lite
}

function Stop-SLSContainer {
    Write-Host "`nStopping Structurizr"
    # STOP CONTAINER
    $job = Invoke-Expression -Command "docker stop structurizr 2>&1" | Out-Null
    Write-Host "Waiting for container to stop..." -NoNewline
    $success = $true
    while ($success) {
        try {
            #Write-Host "." -NoNewline
            $response = Invoke-WebRequest $url -TimeoutSec 0.25
            #Start-Sleep -Milliseconds 250
            $success = $true
        }
        catch {
            $success = $false
        }
    }
}

function Start-SLSContainer {
    param(
        [Parameter(Mandatory = $true, ValueFromPipeline = $true)]
        $StrucurizrWorkspacePath
    )
    process {
        # START CONTAINER
        Write-Host "`n`nStarting Structurizr"
        $cmd = "docker run --name structurizr --rm -p $port`:8080 -v $StrucurizrWorkspacePath`:/usr/local/structurizr structurizr/lite"
        Write-Host "Docker Command: $cmd"
        $job = Start-Job -ScriptBlock { Invoke-Expression $using:cmd }

        Write-Host "Waiting for container to start (This takes about 10 seconds)..." -NoNewline
        $success = $false
        while (!$success) {
            try {
                $response = Invoke-WebRequest $url -TimeoutSec 0.25
                $success = $true
            }
            catch {
                $success = $false
                #Write-Host "." -NoNewline
                #Start-Sleep -Milliseconds 250
            }
        }
        Write-Host "`n`nContainer started at $url"
    }
}

function Open-SLSBrowser {
    # OPEN BROWSER
    Write-Host "Opening browser"

    if ($IsLinux) {
        wslview "$url"
    }
    if ($IsWindows) {
        Start-Process "$url"
    }
}