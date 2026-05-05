import { readFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const DEFAULT_CONFIG_PATH = join(homedir(), '.claudesync', 'config.json')

export function loadConfig(configPath = DEFAULT_CONFIG_PATH) {
  try {
    const raw = readFileSync(configPath, 'utf8')
    const config = JSON.parse(raw)
    const required = ['supabaseUrl', 'agentToken', 'claudePath']
    for (const key of required) {
      if (!config[key]) throw new Error(`Missing config key: ${key}`)
    }
    return config
  } catch (err) {
    console.error(`Failed to load config from ${configPath}: ${err.message}`)
    console.error('Run the install script or create ~/.claudesync/config.json manually.')
    process.exit(1)
  }
}
