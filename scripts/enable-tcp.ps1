<#
  SQL Server 인스턴스의 TCP/IP 를 활성화한다.

  왜 필요한가:
    Node 드라이버(Prisma · node-mssql)는 **TCP 만** 지원한다. 공유 메모리·이름있는
    파이프로는 붙지 못한다. sqlcmd 가 로컬에서 잘 붙어도 애플리케이션은 실패한다.

  주의:
    · **관리자 권한 PowerShell** 에서 실행해야 한다(서비스 재시작 필요).
    · 레지스트리 경로의 인스턴스 키는 SQL Server 버전마다 다르므로
      (MSSQL15/16/17...) 하드코딩하지 않고 조회한다.

  사용:
      # 기본 인스턴스
      .\scripts\enable-tcp.ps1
      # 명명된 인스턴스 + 포트 지정
      .\scripts\enable-tcp.ps1 -Instance AX_BRIDGE -Port 1433
#>
[CmdletBinding()]
param(
  # 명명된 인스턴스 이름. 기본 인스턴스는 MSSQLSERVER 다.
  [string]$Instance = 'MSSQLSERVER',
  [int]$Port = 1433,
  # 재시작을 건너뛴다(설정만 반영, 수동 재시작 필요)
  [switch]$NoRestart
)

$ErrorActionPreference = 'Stop'

function Assert-Admin {
  $isAdmin = ([Security.Principal.WindowsPrincipal] `
    [Security.Principal.WindowsIdentity]::GetCurrent()
  ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  if (-not $isAdmin) {
    throw '관리자 권한이 필요하다. PowerShell 을 «관리자로 실행» 한 뒤 다시 시도하라.'
  }
}

Assert-Admin

# 1) 인스턴스 → 레지스트리 키 이름 조회 (예: AX_BRIDGE → MSSQL17.AX_BRIDGE)
$namesKey = 'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL'
if (-not (Test-Path $namesKey)) { throw 'SQL Server 가 설치되어 있지 않다.' }

$installed = Get-ItemProperty $namesKey
$instanceKey = $installed.$Instance
if (-not $instanceKey) {
  $available = ($installed.PSObject.Properties |
    Where-Object { $_.Name -notlike 'PS*' } | Select-Object -ExpandProperty Name) -join ', '
  throw "인스턴스 '$Instance' 를 찾을 수 없다. 설치된 인스턴스: $available"
}

$serviceName = if ($Instance -eq 'MSSQLSERVER') { 'MSSQLSERVER' } else { "MSSQL`$$Instance" }
Write-Host "인스턴스 : $Instance  (레지스트리 키 $instanceKey / 서비스 $serviceName)"

# 2) TCP 활성화 + 고정 포트 지정
$tcp = "HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\$instanceKey\MSSQLServer\SuperSocketNetLib\Tcp"
if (-not (Test-Path $tcp)) { throw "TCP 설정 키를 찾을 수 없다: $tcp" }

Set-ItemProperty -Path $tcp -Name Enabled -Value 1
# TcpDynamicPorts 를 비워야 TcpPort 의 고정 포트가 사용된다.
Set-ItemProperty -Path "$tcp\IPAll" -Name TcpPort -Value "$Port"
Set-ItemProperty -Path "$tcp\IPAll" -Name TcpDynamicPorts -Value ''
# 루프백(IP1)도 켜 둔다 — 로컬 개발에서 쓰인다.
if (Test-Path "$tcp\IP1") { Set-ItemProperty -Path "$tcp\IP1" -Name Enabled -Value 1 }

$after = Get-ItemProperty "$tcp\IPAll"
Write-Host ("적용   : Tcp.Enabled={0} / IPAll.TcpPort='{1}' / TcpDynamicPorts='{2}'" -f `
  (Get-ItemProperty $tcp).Enabled, $after.TcpPort, $after.TcpDynamicPorts)

# 3) 재시작 (설정은 재시작 후에 적용된다)
if ($NoRestart) {
  Write-Warning "재시작을 건너뛰었다. 다음을 직접 실행하라:  Restart-Service '$serviceName' -Force"
  return
}

Write-Host "재시작 : $serviceName ..."
Restart-Service $serviceName -Force
Start-Sleep -Seconds 5
Get-Service $serviceName | Select-Object Name, Status | Format-Table -AutoSize

# 4) 포트 확인
$listening = (Test-NetConnection -ComputerName 127.0.0.1 -Port $Port -InformationLevel Quiet -WarningAction SilentlyContinue) 2>$null
if ($null -eq $listening) {
  # 구형 PowerShell 호환 — Test-NetConnection 이 없으면 TcpClient 로 확인
  try {
    $c = New-Object Net.Sockets.TcpClient
    $c.Connect('127.0.0.1', $Port); $listening = $true; $c.Close()
  } catch { $listening = $false }
}
if ($listening) {
  Write-Host "완료   : TCP $Port 응답 확인. DATABASE_URL 에 localhost:$Port 를 쓰면 된다." -ForegroundColor Green
} else {
  Write-Warning "TCP $Port 가 아직 응답하지 않는다. 방화벽 또는 다른 인스턴스와의 포트 충돌을 확인하라."
}
