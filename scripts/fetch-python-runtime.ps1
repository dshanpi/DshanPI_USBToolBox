<#
.SYNOPSIS
  下载 Windows 可嵌入版 Python 到 src-tauri/resources/pyembed/，供软件内置运行 Python 产测脚本。

.DESCRIPTION
  仅需在【开发 / 打包机器】上运行一次。终端用户无需安装 Python。
  Python 产测包是零依赖（仅标准库），因此可嵌入版无需 pip 安装任何东西。

.EXAMPLE
  ./scripts/fetch-python-runtime.ps1
  ./scripts/fetch-python-runtime.ps1 -Version 3.12.7
#>
param(
  [string]$Version = "3.12.7"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$dest = Join-Path $repoRoot "src-tauri/resources/pyembed"
$url = "https://www.python.org/ftp/python/$Version/python-$Version-embed-amd64.zip"
$zip = Join-Path $env:TEMP "python-$Version-embed-amd64.zip"

Write-Host "下载 $url ..."
Invoke-WebRequest -Uri $url -OutFile $zip

Write-Host "解压到 $dest ..."
if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Path $dest | Out-Null }
# 保留 README.md，清掉旧的运行时文件
Get-ChildItem -Path $dest -Exclude "README.md" | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Expand-Archive -Path $zip -DestinationPath $dest -Force

# 放开 import site（可嵌入版默认注释掉），确保标准库站点初始化正常
Get-ChildItem -Path $dest -Filter "python*._pth" | ForEach-Object {
  $content = Get-Content $_.FullName
  $content = $content -replace '^\s*#\s*import\s+site\s*$', 'import site'
  Set-Content -Path $_.FullName -Value $content
}

$exe = Join-Path $dest "python.exe"
if (Test-Path $exe) {
  Write-Host "完成：$exe"
  & $exe --version
} else {
  Write-Error "解压后未找到 python.exe，请检查下载内容。"
}
