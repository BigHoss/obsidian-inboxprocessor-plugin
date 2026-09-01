# Release helper for obsidian-inboxprocessor-plugin
#
# Bumps the plugin version, builds, commits, and walks you through
# `git push origin main` with an explicit [Y/n] confirmation. After
# v0.4.1, the GH Action (`.github/workflows/release.yml`) takes over
# from the push: it reads the new manifest version, creates the matching
# tag, and publishes the GitHub Release.
#
# Default answer on the prompt is No, so an accidental Enter never
# pushes anything.
#
# Usage:
#   pwsh ./scripts/release.ps1                 # patch bump (0.4.0 -> 0.4.1)
#   pwsh ./scripts/release.ps1 -Minor          # minor bump (0.4.0 -> 0.5.0)
#   pwsh ./scripts/release.ps1 -Major          # major bump (0.4.0 -> 1.0.0)
#   pwsh ./scripts/release.ps1 -DryRun         # print every step, do nothing
#   pwsh ./scripts/release.ps1 -SkipPush       # commit locally only, no push
#
# Release notes are not passed from this script — the GH Action links to
# the vN.M/Plan.md work-note in the release body. Write the plan there.
#
# Why a script and not a single command? Because the last release was
# two separate failures: bash-ism `$(cat ...)` in PowerShell, and a
# duplicate-tag error from re-running `gh release create` without checking
# state first. This script makes every step checkable + reproducible.

[CmdletBinding()]
param(
    [switch]$Minor,
    [switch]$Major,
    [switch]$DryRun,
    [switch]$SkipPush
)

$ErrorActionPreference = "Stop"
$Repo = "BigHoss/obsidian-inboxprocessor-plugin"

# ----------------------------------------------------------------------
# Resolve repo root (script lives at scripts/release.ps1, so .. is root)
# ----------------------------------------------------------------------
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RepoRoot = Resolve-Path (Join-Path $ScriptDir "..") | Select-Object -ExpandProperty Path
Push-Location $RepoRoot
try {

    # ----------------------------------------------------------------------
    # 1. Working tree clean?
    # ----------------------------------------------------------------------
    $status = git status --short 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "git status failed: $status"
    }
    if ($status) {
        Write-Host ""
        Write-Host "Working tree is dirty:" -ForegroundColor Red
        Write-Host $status
        throw "Commit or stash your changes before running release.ps1."
    }
    Write-Host "[ok] working tree clean"

    # ----------------------------------------------------------------------
    # 2. Read current version from manifest.json (canonical), bump it
    # ----------------------------------------------------------------------
    $manifestPath = Join-Path $RepoRoot "manifest.json"
    $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
    $current = [version]$manifest.version

    if ($Major) { $bump = "Major" }
    elseif ($Minor) { $bump = "Minor" }
    else { $bump = "Patch" }

    $newVersion = switch ($bump) {
        "Major" { "{0}.{1}.{2}" -f ($current.Major + 1), 0, 0 }
        "Minor" { "{0}.{1}.{2}" -f $current.Major, ($current.Minor + 1), 0 }
        "Patch" { "{0}.{1}.{2}" -f $current.Major, $current.Minor, ($current.Build + 1) }
    }
    $tag = "v$newVersion"
    Write-Host "[ok] $current -> $newVersion ($bump)"

    # ----------------------------------------------------------------------
    # 3. Sanity: right repo, right remote, gh authed
    # ----------------------------------------------------------------------
    $remoteUrl = git remote get-url origin 2>&1
    if ($remoteUrl -notmatch [regex]::Escape($Repo)) {
        throw "Remote origin is '$remoteUrl' — expected to match '$Repo'. Aborting."
    }
    Write-Host "[ok] remote origin matches $Repo"

    if (-not $SkipPush) {
        $authOut = gh auth status 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "gh not authenticated: `n$authOut"
        }
        Write-Host "[ok] gh authenticated"
    }

    # ----------------------------------------------------------------------
    # 4. Build
    # ----------------------------------------------------------------------
    Write-Host ""
    Write-Host "Building..." -ForegroundColor Cyan
    if ($DryRun) {
        Write-Host "  [dry-run] would run: npm run build"
    } else {
        npm run build 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }
        Write-Host "[ok] built main.js"
    }

    # ----------------------------------------------------------------------
    # 5. Bump versions in manifest.json / package.json / versions.json
    # ----------------------------------------------------------------------
    if ($DryRun) {
        Write-Host "  [dry-run] would write: manifest.json, package.json, versions.json with $newVersion"
    } else {
        # manifest.json
        $manifest.version = $newVersion
        $manifest | ConvertTo-Json -Depth 10 | Set-Content $manifestPath

        # package.json
        $pkgPath = Join-Path $RepoRoot "package.json"
        $pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
        $pkg.version = $newVersion
        $pkg | ConvertTo-Json -Depth 10 | Set-Content $pkgPath

        # versions.json — append new entry, keep all prior entries
        $verPath = Join-Path $RepoRoot "versions.json"
        $verContent = Get-Content $verPath -Raw | ConvertFrom-Json
        $verContent | Add-Member -NotePropertyName $tag -NotePropertyValue "1.5.0" -Force
        # ConvertFrom-Json returns PSCustomObject; round-trip preserves order
        $ordered = [ordered]@{}
        foreach ($prop in $verContent.PSObject.Properties) {
            $ordered[$prop.Name] = $prop.Value
        }
        $ordered | ConvertTo-Json | Set-Content $verPath
        Write-Host "[ok] bumped manifest.json / package.json / versions.json"
    }

    # ----------------------------------------------------------------------
    # 6. Commit (local only — no push yet)
    # ----------------------------------------------------------------------
    if ($DryRun) {
        Write-Host "  [dry-run] would commit: chore: bump to $tag"
    } else {
        git add manifest.json package.json versions.json main.js
        $commitMsg = "chore: bump to $tag"
        git -c user.name="Raphael" -c user.email="rapha@kuster.live" commit -m $commitMsg 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "git commit failed" }
        Write-Host "[ok] committed: $commitMsg"
    }

    # ----------------------------------------------------------------------
    # 7-10. Network-mutating steps — each gated by [Y/n] confirm
    # ----------------------------------------------------------------------
    # After v0.4.1, the .github/workflows/release.yml Action takes over
    # from here: when you push main, the Action reads the manifest version,
    # creates the matching tag, and publishes the GitHub Release. So this
    # script only handles the version-bump + commit + push-main. No more
    # local tag-push.
    # ----------------------------------------------------------------------
    if ($SkipPush) {
        Write-Host ""
        Write-Host "SkipPush requested. Done at commit step." -ForegroundColor Yellow
        return
    }

    if ($DryRun) {
        Write-Host "  [dry-run] would prompt before: git push"
        return
    }

    # 7. git push origin main
    # After this, the GH Action creates the tag and release automatically.
    Write-Host ""
    $confirm = Read-Host "git push origin main? (GH Action will create the tag + release from this) [y/N]"
    if ($confirm -notin @("y", "Y", "yes", "Yes", "YES")) {
        Write-Host "Aborted at push step. Commit is local." -ForegroundColor Yellow
        return
    }
    git push origin main 2>&1
    if ($LASTEXITCODE -ne 0) { throw "git push failed" }
    Write-Host "[ok] pushed main" -ForegroundColor Green
    Write-Host ""
    Write-Host "GH Action will pick this up shortly and create the tag + release." -ForegroundColor Cyan
    Write-Host "Watch: https://github.com/$Repo/actions" -ForegroundColor Cyan
}
finally {
    Pop-Location
}
