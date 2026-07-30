@echo off
rem Launches the StudioMCP proxy that ships inside Roblox Studio, resolving the
rem newest Studio version folder at run time.
rem
rem Roblox's own %LOCALAPPDATA%\Roblox\mcp.bat hardcodes one version and its
rem fallback branch is a batch syntax error (`else` on its own line), so it stops
rem working after a Studio update. This resolves the path instead.
setlocal EnableExtensions
set "VERSIONS=%LOCALAPPDATA%\Roblox\Versions"
set "EXE="
for /f "delims=" %%F in ('dir /b /o-d "%VERSIONS%" 2^>nul') do (
  if not defined EXE if exist "%VERSIONS%\%%F\StudioMCP.exe" set "EXE=%VERSIONS%\%%F\StudioMCP.exe"
)
if not defined EXE (
  echo studio-mcp: StudioMCP.exe not found under "%VERSIONS%" - is Roblox Studio installed? 1>&2
  exit /b 1
)
"%EXE%" %*
