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
    'CONFIG_FILE="$INSTALL_DIR/config.json"',
    '',
    'echo "Installing ClaudeSync agent..."',
    'mkdir -p "$INSTALL_DIR"',
    '',
    'CLAUDE_PATH="$HOME/.claude"',
    '',
    'printf \'{"supabaseUrl":"%s","agentToken":"%s","claudePath":"%s"}\' \\',
    '  "$SUPABASE_URL" "$AGENT_TOKEN" "$CLAUDE_PATH" > "$CONFIG_FILE"',
    '',
    'npm install -g claudesync-agent',
    '',
    'if [[ "$OSTYPE" == "darwin"* ]]; then',
    '  PLIST="$HOME/Library/LaunchAgents/com.claudesync.agent.plist"',
    '  NODE_BIN=$(which node)',
    '  AGENT_BIN=$(npm root -g)/claudesync-agent/index.js',
    '  printf \'<?xml version="1.0" encoding="UTF-8"?>\\n\'  > "$PLIST"',
    '  printf \'<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\\n\' >> "$PLIST"',
    '  printf \'<plist version="1.0"><dict>\\n\' >> "$PLIST"',
    '  printf \'<key>Label</key><string>com.claudesync.agent</string>\\n\' >> "$PLIST"',
    '  printf \'<key>ProgramArguments</key><array><string>%s</string><string>%s</string></array>\\n\' "$NODE_BIN" "$AGENT_BIN" >> "$PLIST"',
    '  printf \'<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>\\n\' >> "$PLIST"',
    '  printf \'<key>EnvironmentVariables</key><dict><key>CLAUDESYNC_CONFIG</key><string>%s</string></dict>\\n\' "$CONFIG_FILE" >> "$PLIST"',
    '  printf \'</dict></plist>\\n\' >> "$PLIST"',
    '  launchctl load "$PLIST" 2>/dev/null || true',
    '  echo "Auto-start configured via launchd"',
    'elif command -v systemctl &>/dev/null; then',
    '  mkdir -p "$HOME/.config/systemd/user"',
    '  AGENT_BIN=$(npm root -g)/claudesync-agent/index.js',
    '  printf "[Unit]\\nDescription=ClaudeSync Agent\\nAfter=network.target\\n\\n" > "$HOME/.config/systemd/user/claudesync.service"',
    '  printf "[Service]\\nExecStart=$(which node) %s\\nEnvironment=CLAUDESYNC_CONFIG=%s\\nRestart=always\\n\\n" "$AGENT_BIN" "$CONFIG_FILE" >> "$HOME/.config/systemd/user/claudesync.service"',
    '  printf "[Install]\\nWantedBy=default.target\\n" >> "$HOME/.config/systemd/user/claudesync.service"',
    '  systemctl --user enable claudesync.service 2>/dev/null || true',
    '  systemctl --user start claudesync.service 2>/dev/null || true',
    '  echo "Auto-start configured via systemd"',
    'fi',
    '',
    'echo "ClaudeSync agent installed. Config: $CONFIG_FILE"',
  ].join('\n')
}

function generatePowershell(supabaseUrl: string, token: string): string {
  return [
    '# ClaudeSync Agent Installer for Windows',
    '$ErrorActionPreference = "Stop"',
    '',
    `$SUPABASE_URL = "${supabaseUrl}"`,
    `$AGENT_TOKEN = "${token}"`,
    '$InstallDir = "$env:USERPROFILE\\.claudesync"',
    '$ConfigFile = "$InstallDir\\config.json"',
    '',
    'Write-Host "Installing ClaudeSync agent..."',
    'New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null',
    '',
    '$ClaudePath = "$env:USERPROFILE\\.claude"',
    '',
    '$config = @{ supabaseUrl = $SUPABASE_URL; agentToken = $AGENT_TOKEN; claudePath = $ClaudePath } | ConvertTo-Json',
    'Set-Content -Path $ConfigFile -Value $config',
    '',
    'npm install -g claudesync-agent',
    '',
    '$NodePath = (Get-Command node).Source',
    '$AgentPath = "$(npm root -g)\\claudesync-agent\\index.js"',
    '$action = New-ScheduledTaskAction -Execute $NodePath -Argument $AgentPath -WorkingDirectory $InstallDir',
    '$trigger = New-ScheduledTaskTrigger -AtLogOn',
    '$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit 0',
    'Register-ScheduledTask -TaskName "ClaudeSync Agent" -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null',
    '',
    'Write-Host "ClaudeSync agent installed. Config: $ConfigFile"',
  ].join('\n')
}
