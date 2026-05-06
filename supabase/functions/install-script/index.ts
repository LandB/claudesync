import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { validateToken, unauthorizedResponse, errorResponse } from '../_shared/auth.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!

serve(async (req) => {
  if (req.method !== 'GET') return errorResponse('Method not allowed', 405)

  const supabase = createClient(
    SUPABASE_URL,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Accept token via query param (curl | bash) or Authorization header
  const reqUrl = new URL(req.url)
  const rawToken = reqUrl.searchParams.get('token')
    ?? req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!rawToken) return unauthorizedResponse()

  const { data: profileRow } = await supabase
    .from('profiles').select('id').eq('token', rawToken).single()
  const userId = profileRow?.id ?? null
  if (!userId) return unauthorizedResponse()

  const { data: profile } = await supabase
    .from('profiles')
    .select('token')
    .eq('id', userId)
    .single()

  if (!profile) return errorResponse('Profile not found', 404)

  const url = new URL(req.url)
  const platform = url.searchParams.get('platform') ?? 'unix'

  if (platform === 'win') {
    const ps1 = generatePowershell(SUPABASE_URL, profile.token)
    return new Response(ps1, {
      headers: { 'Content-Type': 'text/plain', 'Content-Disposition': 'attachment; filename="install.ps1"' },
    })
  }

  const sh = generateBash(SUPABASE_URL, profile.token)
  return new Response(sh, {
    headers: { 'Content-Type': 'text/plain', 'Content-Disposition': 'attachment; filename="install.sh"' },
  })
})

function generateBash(supabaseUrl: string, token: string): string {
  return [
    '#!/usr/bin/env bash',
    'set -e',
    '',
    `SUPABASE_URL="${supabaseUrl}"`,
    `AGENT_TOKEN="${token}"`,
    'INSTALL_DIR="$HOME/.claudesync"',
    'AGENT_DIR="$INSTALL_DIR/agent"',
    'CONFIG_FILE="$INSTALL_DIR/config.json"',
    'GITHUB_TARBALL="https://github.com/LandB/claudesync/archive/refs/heads/main.tar.gz"',
    '',
    'echo "Installing ClaudeSync agent..."',
    'mkdir -p "$AGENT_DIR"',
    '',
    '# Download agent from GitHub',
    'curl -fsSL "$GITHUB_TARBALL" | tar -xz --strip-components=2 -C "$AGENT_DIR" "claudesync-main/agent"',
    'cd "$AGENT_DIR" && npm install --production --silent',
    '',
    'CLAUDE_PATH="$HOME/.claude"',
    'NODE_BIN=$(which node)',
    'AGENT_BIN="$AGENT_DIR/index.js"',
    '',
    'printf \'{"supabaseUrl":"%s","agentToken":"%s","claudePath":"%s"}\' \\',
    '  "$SUPABASE_URL" "$AGENT_TOKEN" "$CLAUDE_PATH" > "$CONFIG_FILE"',
    '',
    'if [[ "$OSTYPE" == "darwin"* ]]; then',
    '  mkdir -p "$HOME/Library/LaunchAgents"',
    '  PLIST="$HOME/Library/LaunchAgents/com.claudesync.agent.plist"',
    '  printf \'<?xml version="1.0" encoding="UTF-8"?>\\n\' > "$PLIST"',
    '  printf \'<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\\n\' >> "$PLIST"',
    '  printf \'<plist version="1.0"><dict>\\n\' >> "$PLIST"',
    '  printf \'<key>Label</key><string>com.claudesync.agent</string>\\n\' >> "$PLIST"',
    '  printf \'<key>ProgramArguments</key><array><string>%s</string><string>%s</string></array>\\n\' "$NODE_BIN" "$AGENT_BIN" >> "$PLIST"',
    '  printf \'<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>\\n\' >> "$PLIST"',
    '  printf \'<key>EnvironmentVariables</key><dict><key>CLAUDESYNC_CONFIG</key><string>%s</string></dict>\\n\' "$CONFIG_FILE" >> "$PLIST"',
    '  printf \'</dict></plist>\\n\' >> "$PLIST"',
    '  launchctl load "$PLIST" 2>/dev/null || launchctl bootstrap gui/$(id -u) "$PLIST" 2>/dev/null || true',
    '  echo "Auto-start configured via launchd"',
    'elif command -v systemctl &>/dev/null; then',
    '  mkdir -p "$HOME/.config/systemd/user"',
    '  printf "[Unit]\\nDescription=ClaudeSync Agent\\nAfter=network.target\\n\\n" > "$HOME/.config/systemd/user/claudesync.service"',
    '  printf "[Service]\\nExecStart=%s %s\\nEnvironment=CLAUDESYNC_CONFIG=%s\\nRestart=always\\n\\n" "$NODE_BIN" "$AGENT_BIN" "$CONFIG_FILE" >> "$HOME/.config/systemd/user/claudesync.service"',
    '  printf "[Install]\\nWantedBy=default.target\\n" >> "$HOME/.config/systemd/user/claudesync.service"',
    '  systemctl --user enable claudesync.service 2>/dev/null || true',
    '  systemctl --user start claudesync.service 2>/dev/null || true',
    '  echo "Auto-start configured via systemd"',
    'else',
    '  # No systemd (Alpine, WSL, older distros) — start now + hook shell rc',
    '  LAUNCH_LINE="CLAUDESYNC_CONFIG=\\"$CONFIG_FILE\\" nohup \\"$NODE_BIN\\" \\"$AGENT_BIN\\" >\\"$INSTALL_DIR/agent.log\\" 2>&1 &"',
    '  for RC in "$HOME/.bashrc" "$HOME/.zshrc"; do',
    '    if [ -f "$RC" ] && ! grep -q "CLAUDESYNC_CONFIG" "$RC"; then',
    '      printf "\\n# ClaudeSync Agent\\n%s\\n" "$LAUNCH_LINE" >> "$RC"',
    '    fi',
    '  done',
    '  eval "$LAUNCH_LINE"',
    '  echo "Auto-start configured via shell rc (no systemd detected)"',
    'fi',
    '',
    'echo ""',
    'echo "ClaudeSync agent installed!"',
    'echo "  Config:  $CONFIG_FILE"',
    'echo "  Agent:   $AGENT_BIN"',
    'echo ""',
    'echo "Start manually: CLAUDESYNC_CONFIG=$CONFIG_FILE node $AGENT_BIN"',
  ].join('\n')
}

function generatePowershell(supabaseUrl: string, token: string): string {
  return [
    '# ClaudeSync Agent Installer for Windows',
    '$ErrorActionPreference = "Stop"',
    '',
    '# Require admin — Register-ScheduledTask fails silently without it',
    'if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {',
    '  Write-Error "This script must be run as Administrator. Right-click PowerShell and choose Run as Administrator."',
    '  exit 1',
    '}',
    '',
    `$SUPABASE_URL = "${supabaseUrl}"`,
    `$AGENT_TOKEN = "${token}"`,
    '$InstallDir = "$env:USERPROFILE\\.claudesync"',
    '$AgentDir = "$InstallDir\\agent"',
    '$ConfigFile = "$InstallDir\\config.json"',
    '$TarballUrl = "https://github.com/LandB/claudesync/archive/refs/heads/main.tar.gz"',
    '$TmpTar = "$env:TEMP\\claudesync.tar.gz"',
    '$TmpExtract = "$env:TEMP\\claudesync-extract"',
    '',
    'Write-Host "Installing ClaudeSync agent..."',
    'New-Item -ItemType Directory -Force -Path $AgentDir | Out-Null',
    '',
    '$ClaudePath = "$env:USERPROFILE\\.claude"',
    '',
    '$config = @{ supabaseUrl = $SUPABASE_URL; agentToken = $AGENT_TOKEN; claudePath = $ClaudePath } | ConvertTo-Json',
    'Set-Content -Path $ConfigFile -Value $config',
    '',
    '# Download and extract agent from GitHub',
    'Invoke-WebRequest -Uri $TarballUrl -OutFile $TmpTar',
    'New-Item -ItemType Directory -Force -Path $TmpExtract | Out-Null',
    'tar -xzf $TmpTar -C $TmpExtract',
    'Copy-Item -Recurse -Force "$TmpExtract\\claudesync-main\\agent\\*" $AgentDir',
    'Remove-Item -Recurse -Force $TmpTar, $TmpExtract',
    '',
    'Set-Location $AgentDir',
    'npm install --production --silent',
    '',
    '$NodePath = (Get-Command node).Source',
    '$AgentBin = "$AgentDir\\index.js"',
    '$LogFile = "$InstallDir\\agent.log"',
    '',
    '# Write a wrapper bat so the task always has CLAUDESYNC_CONFIG set and logs output',
    '$WrapperBat = "$AgentDir\\start.bat"',
    'Set-Content -Path $WrapperBat -Value "@echo off`r`nset CLAUDESYNC_CONFIG=$ConfigFile`r`nnode `"$AgentBin`" >> `"$LogFile`" 2>&1"',
    '',
    '$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c `"$WrapperBat`"" -WorkingDirectory $AgentDir',
    '$trigger = New-ScheduledTaskTrigger -AtLogOn',
    '$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit 0 -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1)',
    'Register-ScheduledTask -TaskName "ClaudeSync Agent" -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null',
    'Start-ScheduledTask -TaskName "ClaudeSync Agent"',
    '',
    'Write-Host "ClaudeSync agent installed and started."',
    'Write-Host "  Config: $ConfigFile"',
    'Write-Host "  Agent:  $AgentBin"',
    'Write-Host "  Log:    $LogFile"',
  ].join('\n')
}
