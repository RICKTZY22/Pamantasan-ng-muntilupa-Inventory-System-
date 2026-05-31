# ─────────────────────────────────────────────
#  PLMun Nexus — Start All Servers
#  Run this from the project root:  .\start.ps1
# ─────────────────────────────────────────────

Write-Host ""
Write-Host "  PLMun Nexus - Starting servers..." -ForegroundColor Cyan
Write-Host ""

$wifiIp = Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "Wi-Fi" -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike "169.254.*" } |
    Select-Object -First 1 -ExpandProperty IPAddress

if (-not $wifiIp) {
    $wifiIp = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.IPAddress -like "192.168.*" -or $_.IPAddress -like "10.*" -or $_.IPAddress -like "172.*" } |
        Select-Object -First 1 -ExpandProperty IPAddress)
}

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]"Administrator"
)

# 1. Ensure PostgreSQL service is running.
#    If it's stopped and we're not elevated, re-launch as admin so Start-Service works.
$pg = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($pg) {
    if ($pg.Status -ne "Running" -and -not $isAdmin) {
        Write-Host "  [DB] PostgreSQL is stopped. Re-launching as Administrator to start it..." -ForegroundColor Yellow
        Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
        exit
    }
    if ($pg.Status -ne "Running") {
        Write-Host "  [DB] Starting PostgreSQL service..." -ForegroundColor Yellow
        try { Start-Service $pg.Name -ErrorAction Stop; Start-Sleep -Seconds 2 }
        catch { Write-Host "  [DB] ERROR: Could not start PostgreSQL - $_" -ForegroundColor Red }
    }
    # When elevated, make the service auto-restart if it ever dies (it has no
    # recovery actions by default, which is why an unclean kill left it Stopped).
    # Idempotent: safe to run every launch.
    if ($isAdmin) {
        & sc.exe failure $pg.Name "reset=" "86400" "actions=" "restart/5000/restart/10000/restart/30000" | Out-Null
    }
    if ((Get-Service $pg.Name).Status -eq "Running") {
        Write-Host "  [DB] PostgreSQL is running OK" -ForegroundColor Green
    }
}
else {
    Write-Host "  [DB] PostgreSQL service not found - make sure it is installed and running." -ForegroundColor Red
}

# 1b. Ensure Ollama is running (local AI assistant). Skips cleanly if Ollama
#     isn't installed (e.g. when using the Gemini cloud provider).
$ollamaCmd = Get-Command ollama -ErrorAction SilentlyContinue
if ($ollamaCmd) {
    $ollamaUp = $false
    try {
        Invoke-WebRequest -Uri "http://localhost:11434/api/tags" -UseBasicParsing -TimeoutSec 2 | Out-Null
        $ollamaUp = $true
    } catch { $ollamaUp = $false }
    if (-not $ollamaUp) {
        Write-Host "  [AI] Starting Ollama server..." -ForegroundColor Yellow
        Start-Process -FilePath $ollamaCmd.Source -ArgumentList "serve" -WindowStyle Hidden
        Start-Sleep -Seconds 2
    }
    Write-Host "  [AI] Ollama is running OK" -ForegroundColor Green
}
else {
    Write-Host "  [AI] Ollama not installed - assistant will use the configured cloud provider." -ForegroundColor DarkGray
}

# 2. Start Django backend in a new terminal window
Write-Host "  [BE] Starting Django backend on http://0.0.0.0:8000 ..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", `
    "cd '$PSScriptRoot\Backend'; .\\venv\\Scripts\\Activate.ps1; python manage.py runserver 0.0.0.0:8000"

Start-Sleep -Seconds 2

# 3. Start React frontend in a new terminal window
Write-Host "  [FE] Starting React frontend on http://0.0.0.0:5173 ..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", `
    "cd '$PSScriptRoot\frontend'; npm run dev -- --host 0.0.0.0"

Write-Host ""
Write-Host "  All servers started!" -ForegroundColor Green
Write-Host "  Frontend  ->  http://localhost:5173" -ForegroundColor Cyan
Write-Host "  Backend   ->  http://127.0.0.1:8000" -ForegroundColor Cyan
if ($wifiIp) {
    Write-Host "  Phone URL ->  http://$wifiIp`:5173" -ForegroundColor Cyan
    Write-Host "  Phone API ->  http://$wifiIp`:8000/api" -ForegroundColor Cyan
}
else {
    Write-Host "  Phone URL ->  run ipconfig and use your Wi-Fi IPv4 address with port 5173" -ForegroundColor Yellow
}
Write-Host ""
