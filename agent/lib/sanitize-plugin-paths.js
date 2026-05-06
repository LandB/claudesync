import { join } from 'path'

const PLACEHOLDER = '{{CLAUDE_PATH}}'

const REGISTRY_FILES = new Set([
  'plugins/known_marketplaces.json',
  'plugins/installed_plugins.json',
])

export function isRegistryFile(filePath) {
  return REGISTRY_FILES.has(filePath)
}

/**
 * Strips machine-specific absolute paths before pushing to the server.
 * Replaces claudePath prefixes with {{CLAUDE_PATH}} using forward slashes
 * so the stored content is OS-neutral.
 */
export function sanitizePluginPaths(filePath, content, claudePath) {
  if (filePath === 'plugins/known_marketplaces.json') {
    try {
      const data = JSON.parse(content)
      for (const name of Object.keys(data)) {
        if (data[name].installLocation) {
          data[name].installLocation = `${PLACEHOLDER}/plugins/marketplaces/${name}`
        }
      }
      return Buffer.from(JSON.stringify(data, null, 2))
    } catch { return content }
  }

  if (filePath === 'plugins/installed_plugins.json') {
    try {
      const data = JSON.parse(content)
      for (const entries of Object.values(data.plugins ?? {})) {
        for (const entry of entries) {
          if (entry.installPath) {
            // Match plugins/cache/… regardless of source OS separator
            const match = entry.installPath.match(/[/\\]plugins[/\\]cache[/\\](.+)$/)
            if (match) {
              const parts = match[1].split(/[/\\]/)
              entry.installPath = `${PLACEHOLDER}/plugins/cache/${parts.join('/')}`
            }
          }
        }
      }
      return Buffer.from(JSON.stringify(data, null, 2))
    } catch { return content }
  }

  return content
}

/**
 * Expands {{CLAUDE_PATH}} placeholder after downloading from the server,
 * rebuilding paths with the correct OS separator via path.join.
 */
export function expandPluginPaths(filePath, content, claudePath) {
  if (filePath === 'plugins/known_marketplaces.json') {
    try {
      const data = JSON.parse(content)
      for (const name of Object.keys(data)) {
        if (typeof data[name].installLocation === 'string' &&
            data[name].installLocation.startsWith(PLACEHOLDER)) {
          data[name].installLocation = join(claudePath, 'plugins', 'marketplaces', name)
        }
      }
      return Buffer.from(JSON.stringify(data, null, 2))
    } catch { return content }
  }

  if (filePath === 'plugins/installed_plugins.json') {
    try {
      const data = JSON.parse(content)
      for (const entries of Object.values(data.plugins ?? {})) {
        for (const entry of entries) {
          if (typeof entry.installPath === 'string' &&
              entry.installPath.startsWith(PLACEHOLDER)) {
            const rel = entry.installPath.slice(PLACEHOLDER.length + 1) // skip leading /
            entry.installPath = join(claudePath, ...rel.split('/'))
          }
        }
      }
      return Buffer.from(JSON.stringify(data, null, 2))
    } catch { return content }
  }

  return content
}
