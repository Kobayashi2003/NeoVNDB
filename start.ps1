#requires -Version 7
<#
.SYNOPSIS
    Starts the whole stack, and stops it again on Ctrl+C.

.DESCRIPTION
    Five processes: the read API, the image mirror, the user service, Next, and
    the edge in front of all four. Each runs from its own directory, because
    each reads the .env beside it and several settings in those files are paths
    relative to it -- Caddy's image roots and the dump directory among them.

    The Go services are built first and run as binaries rather than through
    `go run`, which would put a second process between this script and the
    server and leave the real one behind when the wrapper is killed.

.PARAMETER Prod
    Serve a production build of the frontend instead of the dev server. Slower
    to start and it will not pick up a source change, but it is what the CLS
    and timing measurements in docs/ were taken against.

.PARAMETER NoImages
    Draw the site without fetching a single cover or screenshot. For working on
    it away from the machine holding the image mirror, where every image is a
    request that has to time out before the page gives up on it. The boxes are
    still drawn at the size the image would have taken. With -Prod this is
    baked into the build, so the next -Prod run without it has to build again.

.PARAMETER Stop
    Stop what a previous run started, and exit.

.PARAMETER Force
    Take a port that is already in use, killing whatever holds it. Without
    this, a busy port stops the script.

.EXAMPLE
    .\start.ps1
    .\start.ps1 -Prod
    .\start.ps1 -Stop
#>
[CmdletBinding()]
param(
    [switch]$Prod,
    [switch]$NoImages,
    [switch]$Stop,
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
# The readiness checks below poll with Invoke-WebRequest, whose progress bar
# paints over this script's own output and leaves pieces of itself behind.
$ProgressPreference = 'SilentlyContinue'

$root = $PSScriptRoot
$pidFile = Join-Path $root '.running.json'

# Ports are read from the .env files rather than repeated here, so that
# changing one in an .env does not silently leave this script checking the old
# one. Falls back to the default the service itself would use.
function Get-EnvPort {
    param([string]$Dir, [string]$Key, [int]$Fallback)
    $file = Join-Path $Dir '.env'
    if (Test-Path $file) {
        $line = Select-String -Path $file -Pattern "^\s*$Key\s*=\s*(\d+)" -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($line) { return [int]$line.Matches[0].Groups[1].Value }
    }
    return $Fallback
}

$vndbDir  = Join-Path $root 'backend/vndb'
$usersDir = Join-Path $root 'backend/users'
$webDir   = Join-Path $root 'frontend'
$edgeDir  = Join-Path $root 'edge'

$ports = @{
    api    = Get-EnvPort $vndbDir  'NEOVNDB_PORT'        5100
    img    = Get-EnvPort $vndbDir  'NEOVNDB_IMAGE_PORT'  5101
    users  = Get-EnvPort $usersDir 'NEOVNDB_USERS_PORT'  5102
    web    = 3000
    edge   = 5090
}

function Write-Step { param([string]$Text) Write-Host "  $Text" -ForegroundColor DarkGray }
function Write-Good { param([string]$Text) Write-Host "  $Text" -ForegroundColor Green }
function Write-Bad  { param([string]$Text) Write-Host "  $Text" -ForegroundColor Red }

function Get-Listener {
    param([int]$Port)
    $c = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($c) { return $c.OwningProcess }
    return $null
}

function Stop-Tree {
    param([int]$ProcessId)
    try { Stop-Process -Id $ProcessId -Force -ErrorAction Stop } catch { }
}

function Stop-Everything {
    $stopped = 0
    if (Test-Path $pidFile) {
        foreach ($entry in (Get-Content $pidFile -Raw | ConvertFrom-Json)) {
            $p = Get-Process -Id $entry.ProcessId -ErrorAction SilentlyContinue
            # A pid is reused freely once its process is gone, so the recorded
            # start time is what says this is still the process we launched.
            $when = if ($p) { try { $p.StartTime.ToString('o') } catch { '' } } else { '' }
            if ($p -and $when -eq $entry.StartTime) {
                Stop-Tree $entry.ProcessId
                $stopped++
            }
        }
        Remove-Item $pidFile -Force -ErrorAction SilentlyContinue
    }
    # Next spawns a worker of its own that outlives the parent.
    foreach ($port in $ports.Values) {
        $owner = Get-Listener $port
        if ($owner) { Stop-Tree $owner; $stopped++ }
    }
    return $stopped
}

if ($Stop) {
    $n = Stop-Everything
    if ($n -gt 0) { Write-Good "stopped $n process(es)" } else { Write-Step 'nothing was running' }
    return
}

# --- Prerequisites --------------------------------------------------------

Write-Host "`nNeoVNDB" -ForegroundColor Cyan
foreach ($tool in 'go', 'npm', 'caddy') {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        Write-Bad "$tool is not on PATH"
        return
    }
}

$busy = @()
foreach ($name in $ports.Keys) {
    $owner = Get-Listener $ports[$name]
    if ($owner) { $busy += [pscustomobject]@{ Name = $name; Port = $ports[$name]; ProcessId = $owner } }
}
if ($busy) {
    if ($Force) {
        foreach ($b in $busy) {
            Write-Step "taking port $($b.Port) from pid $($b.ProcessId)"
            Stop-Tree $b.ProcessId
        }
        Start-Sleep -Milliseconds 800
    } else {
        foreach ($b in $busy) { Write-Bad "port $($b.Port) ($($b.Name)) is in use by pid $($b.ProcessId)" }
        Write-Step 'pass -Force to take them, or -Stop to clear a previous run'
        return
    }
}

# Passed to the frontend, and read by it at build time -- which in `next dev`
# means the dev server's own environment, so setting it here is enough. Always
# assigned, so that leaving the switch off actually turns images back on.
$env:NEXT_PUBLIC_NO_IMAGES = if ($NoImages) { '1' } else { '' }

# --- Build ----------------------------------------------------------------
# Before anything starts: on Windows a running binary cannot be overwritten,
# so building afterwards would fail on the second run of the day.

Write-Step 'building backend/vndb'
& go -C $vndbDir build -o bin/neovndb.exe ./cmd/neovndb
if ($LASTEXITCODE -ne 0) { Write-Bad 'build failed'; return }

Write-Step 'building backend/users'
& go -C $usersDir build -o bin/users.exe ./cmd/users
if ($LASTEXITCODE -ne 0) { Write-Bad 'build failed'; return }

if ($Prod) {
    Write-Step 'building frontend (production)'
    Push-Location $webDir
    try { & npm.cmd run build | Out-Null } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { Write-Bad 'next build failed'; return }
}

# --- Start ----------------------------------------------------------------

$started = [System.Collections.Generic.List[object]]::new()

function Start-Child {
    param(
        [string]$Name,
        [string]$Dir,
        [string]$File,
        [string[]]$Arguments,
        [string]$LogStem
    )
    $proc = Start-Process -FilePath $File -ArgumentList $Arguments `
        -WorkingDirectory $Dir -PassThru -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $Dir "$LogStem.out.log") `
        -RedirectStandardError  (Join-Path $Dir "$LogStem.err.log")
    $when = try { $proc.StartTime.ToString('o') } catch { '' }
    $started.Add([pscustomobject]@{
        Name      = $Name
        ProcessId = $proc.Id
        StartTime = $when
        Log       = Join-Path $Dir "$LogStem.err.log"
    })
    return $proc
}

$webArgs = if ($Prod) { @('run', 'start') } else { @('run', 'dev') }

Start-Child 'api'   $vndbDir  (Join-Path $vndbDir  'bin/neovndb.exe') @('serve')  'api'    | Out-Null
Start-Child 'img'   $vndbDir  (Join-Path $vndbDir  'bin/neovndb.exe') @('images') 'img'    | Out-Null
Start-Child 'users' $usersDir (Join-Path $usersDir 'bin/users.exe')   @()         'users'  | Out-Null
Start-Child 'web'   $webDir   'npm.cmd'                              $webArgs    'next'   | Out-Null
Start-Child 'edge'  $edgeDir  'caddy'                                @('run')    'caddy'  | Out-Null

$started | ConvertTo-Json -AsArray | Set-Content $pidFile -Encoding utf8

# --- Wait for each to answer ---------------------------------------------

function Wait-Ready {
    param([string]$Url, [int]$Seconds)
    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        try {
            Invoke-WebRequest -Uri $Url -TimeoutSec 3 -UseBasicParsing | Out-Null
            return $true
        } catch {
            # A 4xx still means something is listening and routing; anything
            # else means nothing is there yet.
            if ($_.Exception -is [System.Net.Http.HttpRequestException] -and
                $null -ne $_.Exception.StatusCode) { return $true }
        }
        Start-Sleep -Milliseconds 400
    }
    return $false
}

$checks = @(
    @{ Name = 'api';   Url = "http://127.0.0.1:$($ports.api)/health";   Seconds = 20 },
    @{ Name = 'img';   Url = "http://127.0.0.1:$($ports.img)/health";   Seconds = 20 },
    @{ Name = 'users'; Url = "http://127.0.0.1:$($ports.users)/health"; Seconds = 20 },
    # The dev server compiles the first page on demand, which is the slowest
    # thing here by a wide margin.
    @{ Name = 'web';   Url = "http://127.0.0.1:$($ports.web)/";         Seconds = 120 },
    @{ Name = 'edge';  Url = "http://127.0.0.1:$($ports.edge)/";        Seconds = 30 }
)

Write-Host ''
$failed = @()
foreach ($check in $checks) {
    Write-Host ("  {0,-6}" -f $check.Name) -NoNewline
    if (Wait-Ready $check.Url $check.Seconds) {
        Write-Host 'ok' -ForegroundColor Green
    } else {
        Write-Host 'no answer' -ForegroundColor Red
        $failed += $check.Name
    }
}

if ($failed) {
    Write-Host ''
    foreach ($name in $failed) {
        $entry = $started | Where-Object Name -eq $name
        Write-Bad "$name never answered -- see $($entry.Log)"
        $tail = Get-Content $entry.Log -Tail 3 -ErrorAction SilentlyContinue
        foreach ($line in $tail) { Write-Host "    $line" -ForegroundColor DarkGray }
    }
}

Write-Host ''
Write-Good "http://127.0.0.1:$($ports.edge)"
if ($NoImages) { Write-Step 'images off' }
Write-Step 'Ctrl+C stops everything'
Write-Host ''

# --- Hold, and clean up on the way out ------------------------------------

try {
    while ($true) {
        Start-Sleep -Seconds 2
        $gone = $started | Where-Object { -not (Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue) }
        if ($gone) {
            foreach ($g in $gone) { Write-Bad "$($g.Name) exited -- see $($g.Log)" }
            break
        }
    }
} finally {
    Write-Host ''
    $n = Stop-Everything
    Write-Step "stopped $n process(es)"
}
