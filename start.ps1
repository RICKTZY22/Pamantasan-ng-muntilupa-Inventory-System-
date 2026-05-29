# ─────────────────────────────────────────────
#  PLMun Nexus — Start All Servers
#  Run this from the project root:  .\start.ps1
# ─────────────────────────────────────────────

Write-Host ""
Write-Host "  PLMun Nexus - Starting servers..." -ForegroundColor Cyan
Write-Host ""

# 1. Ensure PostgreSQL service is running
$pg = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($pg) {
    if ($pg.Status -ne "Running") {
        Write-Host "  [DB] Starting PostgreSQL service..." -ForegroundColor Yellow
        Start-Service $pg.Name
        Start-Sleep -Seconds 2
    }
    Write-Host "  [DB] PostgreSQL is running OK" -ForegroundColor Green
}
else {
    Write-Host "  [DB] PostgreSQL service not found - make sure it is installed and running." -ForegroundColor Red
}

# 2. Start Django backend in a new terminal window
Write-Host "  [BE] Starting Django backend on http://127.0.0.1:8000 ..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", `
    "cd '$PSScriptRoot\Backend'; .\\venv\\Scripts\\Activate.ps1; python manage.py runserver"

Start-Sleep -Seconds 2

# 3. Start React frontend in a new terminal window
Write-Host "  [FE] Starting React frontend on http://localhost:5173 ..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", `
    "cd '$PSScriptRoot\frontend'; npm run dev"

Write-Host ""
Write-Host "  All servers started!" -ForegroundColor Green
Write-Host "  Frontend  ->  http://localhost:5173" -ForegroundColor Cyan
Write-Host "  Backend   ->  http://127.0.0.1:8000" -ForegroundColor Cyan
Write-Host ""
