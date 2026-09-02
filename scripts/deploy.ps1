param(
    [string]$Only   = '',
    [switch]$DryRun = $false
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# Load tokens from root .env
$envFile = Join-Path (Join-Path $PSScriptRoot '..') '.env'
if (-not (Test-Path $envFile)) {
    Write-Error ".env not found -- add RENDER_API_KEY and VERCEL_TOKEN to .env in the repo root."
    exit 1
}
$env_vars = @{}
Get-Content $envFile | Where-Object { $_ -match '^\s*[^#]\S+=\S' } | ForEach-Object {
    $parts = $_ -split '=', 2
    $env_vars[$parts[0].Trim()] = $parts[1].Trim()
}

$RENDER_KEY   = $env_vars['RENDER_API_KEY']
$VERCEL_TOKEN = $env_vars['VERCEL_TOKEN']

if (-not $RENDER_KEY)   { Write-Error 'RENDER_API_KEY not found in .env'; exit 1 }
if (-not $VERCEL_TOKEN) { Write-Error 'VERCEL_TOKEN not found in .env';   exit 1 }

# Render service IDs (verified 2026-09-01 from /v1/services)
$renderServices = @(
    [pscustomobject]@{ key = 'backend';    id = 'srv-daah0j0n74is73au7qrg'; name = 'olympiad-backend' }
    [pscustomobject]@{ key = 'admin-api';  id = 'srv-daah0hpsrm7s73eug6m0'; name = 'bio-admin-api'   }
    [pscustomobject]@{ key = 'portal-api'; id = 'srv-daah0idg1s2s73d5ld4g'; name = 'bio-portal-api'  }
)

# Vercel project IDs (fetched 2026-08-12 via /v9/projects)
$vercelProjects = @(
    [pscustomobject]@{ key = 'student'; id = 'prj_bxz772UJ6VqlobRJkFb8Jn1x9m1M'; name = 'olympiad-student-frontend' }
    [pscustomobject]@{ key = 'admin';   id = 'prj_CddHCYOIfbHbuiQySyMdHLS0j9VU'; name = 'olympiad-admin-frontend'  }
    [pscustomobject]@{ key = 'partner'; id = 'prj_IwqrvOzlJBaqB2FgcnKEXkntj3m5'; name = 'bio-partner-portal'       }
    [pscustomobject]@{ key = 'school';  id = 'prj_o1VFWdr67jDkgpH7Ta3yvSeypXhS'; name = 'bio-school-portal'        }
)

function Should-Deploy([string]$key) {
    if (-not $Only) { return $true }
    return ($Only -split ',') -contains $key
}

function Write-Tag([string]$color, [string]$label, [string]$msg) {
    Write-Host "  [$label] " -ForegroundColor $color -NoNewline
    Write-Host $msg
}

$ok   = 0
$skip = 0
$fail = 0

# ---------- Render -----------------------------------------------------------
Write-Host ""
Write-Host "Render" -ForegroundColor Cyan

$renderHeaders = @{
    Authorization  = "Bearer $RENDER_KEY"
    'Content-Type' = 'application/json'
}

foreach ($svc in $renderServices) {
    if (-not (Should-Deploy $svc.key)) { $skip++; continue }
    if ($DryRun) {
        Write-Tag Yellow 'DRY' "$($svc.name)  ($($svc.id))"
        $skip++
        continue
    }
    try {
        # POST /v1/services/:id/deploys returns 202 with empty body on success.
        Invoke-RestMethod `
            -Method  Post `
            -Uri     "https://api.render.com/v1/services/$($svc.id)/deploys" `
            -Headers $renderHeaders `
            -Body    '{"clearCache":"do_not_clear"}' | Out-Null
        Write-Tag Green 'OK' "$($svc.name)  ->  deploy queued"
        $ok++
    }
    catch {
        Write-Tag Red 'FAIL' "$($svc.name)  ->  $($_.Exception.Message)"
        $fail++
    }
}

# ---------- Vercel -----------------------------------------------------------
Write-Host ""
Write-Host "Vercel" -ForegroundColor Cyan

$vercelGet = @{ Authorization = "Bearer $VERCEL_TOKEN" }
$vercelPost = @{ Authorization = "Bearer $VERCEL_TOKEN"; 'Content-Type' = 'application/json' }

foreach ($proj in $vercelProjects) {
    if (-not (Should-Deploy $proj.key)) { $skip++; continue }
    if ($DryRun) {
        Write-Tag Yellow 'DRY' "$($proj.name)  ($($proj.id))"
        $skip++
        continue
    }
    try {
        # 1. Resolve the current Git ref and SHA we actually want to deploy.
        #    Vercel's withLatestCommit redeploy option has been observed to use
        #    a stale commit, so we pass an explicit gitSource instead.
        $ref = (git rev-parse --abbrev-ref HEAD 2>$null)
        if (-not $ref) { $ref = 'main' }
        $sha = (git rev-parse HEAD 2>$null)
        if (-not $sha) { throw "Could not resolve current Git HEAD for $($proj.name)" }

        # 2. Fetch the latest production deployment to get its Git repo id.
        $deploys = Invoke-RestMethod `
            -Uri     "https://api.vercel.com/v6/deployments?projectId=$($proj.id)&target=production&limit=1" `
            -Headers $vercelGet
        $latest = $deploys.deployments[0]
        if (-not $latest) { throw "No production deployment found for $($proj.name)" }
        $repoId = $latest.meta.githubRepoId
        if (-not $repoId) { $repoId = $latest.meta.githubCommitRepoId }
        if (-not $repoId) { throw "Could not determine GitHub repo id for $($proj.name)" }

        # 3. Create a new deployment from the current commit.
        $body = ConvertTo-Json @{
            name      = $proj.name
            target    = 'production'
            gitSource = @{
                type   = 'github'
                ref    = $ref
                sha    = $sha
                repoId = $repoId
            }
        } -Depth 3
        $resp = Invoke-RestMethod `
            -Method  Post `
            -Uri     "https://api.vercel.com/v13/deployments?forceNew=1&target=production" `
            -Headers $vercelPost `
            -Body    $body
        Write-Tag Green 'OK' "$($proj.name)  ->  $($resp.url)  ($($resp.id))"
        $ok++
    }
    catch {
        Write-Tag Red 'FAIL' "$($proj.name)  ->  $($_.Exception.Message)"
        $fail++
    }
}

# ---------- Summary ----------------------------------------------------------
Write-Host ""
Write-Host "------------------------------------"
Write-Host "  Triggered : $ok" -ForegroundColor Green
if ($skip -gt 0) { Write-Host "  Skipped   : $skip" -ForegroundColor Yellow }
if ($fail -gt 0) { Write-Host "  Failed    : $fail" -ForegroundColor Red }
Write-Host "------------------------------------"
Write-Host ""

if ($fail -gt 0) { exit 1 }
