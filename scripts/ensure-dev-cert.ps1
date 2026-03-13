$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$certDir = Join-Path $repoRoot ".cert"
$pfxPath = Join-Path $certDir "local-dev.pfx"
$cerPath = Join-Path $certDir "local-dev.cer"
$passPath = Join-Path $certDir "local-dev.pass"
$metaPath = Join-Path $certDir "local-dev.json"
$friendlyName = "doc_user Vite Dev"
$subjectName = "CN=doc-user-dev"

if (-not (Test-Path $certDir)) {
  New-Item -ItemType Directory -Path $certDir | Out-Null
}

function Get-LocalIpv4Addresses {
  @(
    Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
      Where-Object {
        $_.IPAddress -notlike '127.*' -and
        $_.IPAddress -notlike '169.254.*' -and
        $_.IPAddress -notlike '198.18.*'
      } |
      Select-Object -ExpandProperty IPAddress -Unique
  )
}

function Get-DesiredMetadata {
  $dnsNames = @('localhost', $env:COMPUTERNAME) |
    Where-Object { $_ -and $_ -match '^[\x00-\x7F]+$' } |
    Select-Object -Unique
  $ipAddresses = @('127.0.0.1', '::1') + (Get-LocalIpv4Addresses)
  [pscustomobject]@{
    dnsNames = @($dnsNames | Select-Object -Unique)
    ipAddresses = @($ipAddresses | Select-Object -Unique)
  }
}

function Read-Metadata {
  if (-not (Test-Path $metaPath)) {
    return $null
  }

  try {
    return Get-Content $metaPath | ConvertFrom-Json
  } catch {
    return $null
  }
}

function Write-Metadata($thumbprint, $desired) {
  [pscustomobject]@{
    thumbprint = $thumbprint
    dnsNames = @($desired.dnsNames)
    ipAddresses = @($desired.ipAddresses)
    generatedAt = (Get-Date).ToString("s")
  } | ConvertTo-Json | Set-Content $metaPath
}

function Needs-Regeneration($current, $desired) {
  if (-not (Test-Path $pfxPath) -or -not (Test-Path $cerPath) -or -not (Test-Path $passPath)) {
    return $true
  }

  if (-not $current) {
    return $true
  }

  $currentDns = @($current.dnsNames)
  $currentIps = @($current.ipAddresses)

  if ((Compare-Object -ReferenceObject $desired.dnsNames -DifferenceObject $currentDns).Count -gt 0) {
    return $true
  }

  if ((Compare-Object -ReferenceObject $desired.ipAddresses -DifferenceObject $currentIps).Count -gt 0) {
    return $true
  }

  return $false
}

function Trust-CertificateFile {
  $imported = Get-ChildItem Cert:\CurrentUser\Root | Where-Object { $_.Subject -eq $subjectName }
  if (-not $imported) {
    Import-Certificate -FilePath $cerPath -CertStoreLocation "Cert:\CurrentUser\Root" | Out-Null
  }
}

$desired = Get-DesiredMetadata
$current = Read-Metadata

if (Needs-Regeneration $current $desired) {
  $password = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 32 | ForEach-Object { [char]$_ })
  Set-Content $passPath $password -NoNewline

  $sanEntries = @()
  foreach ($dnsName in $desired.dnsNames) {
    $sanEntries += "DNS=$dnsName"
  }
  foreach ($ipAddress in $desired.ipAddresses) {
    $sanEntries += "IP Address=$ipAddress"
  }

  $existingCerts = Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.FriendlyName -eq $friendlyName }
  foreach ($existing in $existingCerts) {
    Remove-Item $existing.PSPath -Force -ErrorAction SilentlyContinue
  }

  $cert = New-SelfSignedCertificate `
    -Type Custom `
    -Subject $subjectName `
    -FriendlyName $friendlyName `
    -KeyAlgorithm RSA `
    -KeyLength 2048 `
    -HashAlgorithm SHA256 `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -NotAfter (Get-Date).AddYears(3) `
    -TextExtension @(
      "2.5.29.37={text}1.3.6.1.5.5.7.3.1",
      "2.5.29.17={text}$($sanEntries -join '&')"
    )

  $securePassword = ConvertTo-SecureString -String $password -AsPlainText -Force
  Export-PfxCertificate -Cert $cert.PSPath -FilePath $pfxPath -Password $securePassword | Out-Null
  Export-Certificate -Cert $cert.PSPath -FilePath $cerPath -Force | Out-Null
  Trust-CertificateFile
  Write-Metadata $cert.Thumbprint $desired
} else {
  Trust-CertificateFile
}

$primaryLanIp = ($desired.ipAddresses | Where-Object { $_ -notin @('127.0.0.1', '::1') } | Select-Object -First 1)
Write-Output "Dev certificate ready."
Write-Output "Local: https://localhost:3000/"
if ($primaryLanIp) {
  Write-Output "Network: https://$primaryLanIp`:3000/"
}
