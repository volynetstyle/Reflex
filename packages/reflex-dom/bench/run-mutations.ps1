param(
  [string]$Browser = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
  [string]$Output = "$PSScriptRoot\mutations.results.html"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $Browser)) {
  throw "Browser executable not found: $Browser"
}

$benchmark = Join-Path $PSScriptRoot "mutations.browser.html"
$benchmarkUrl = ([Uri]$benchmark).AbsoluteUri
$profile = Join-Path $env:TEMP ("reflex-dom-bench-" + [Guid]::NewGuid())
$stderr = [System.IO.Path]::GetTempFileName()

try {
  $arguments = @(
    "--headless=new"
    "--disable-gpu"
    "--no-sandbox"
    "--user-data-dir=$profile"
    "--dump-dom"
    $benchmarkUrl
  )

  $process = Start-Process `
    -FilePath $Browser `
    -ArgumentList $arguments `
    -RedirectStandardOutput $Output `
    -RedirectStandardError $stderr `
    -WindowStyle Hidden `
    -Wait `
    -PassThru

  if ($process.ExitCode -ne 0) {
    Get-Content -LiteralPath $stderr
    throw "Browser benchmark failed with exit code $($process.ExitCode)"
  }

  Write-Host "Mutation benchmark written to $Output"
} finally {
  Remove-Item -LiteralPath $stderr -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $profile -Recurse -Force -ErrorAction SilentlyContinue
}
