import { dirname, join } from 'path'

const PLACEHOLDER = '{{CLAUDE_PATH}}'
const HOME_PLACEHOLDER = '{{USER_HOME}}'

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

/**
 * Replaces the machine-specific home directory path with {{USER_HOME}} before pushing.
 * Applies to all text files so absolute paths never leak to the server.
 */
export function sanitizeHomePath(content, claudePath) {
  const homePath = dirname(claudePath).replace(/\\/g, '/')
  const text = content.toString('utf8')
  if (!text.includes(homePath)) return content
  return Buffer.from(text.replaceAll(homePath, HOME_PLACEHOLDER))
}

/**
 * Expands {{USER_HOME}} back to the local machine's home directory after pulling.
 */
export function expandHomePath(content, claudePath) {
  const homePath = dirname(claudePath).replace(/\\/g, '/')
  const text = content.toString('utf8')
  if (!text.includes(HOME_PLACEHOLDER)) return content
  return Buffer.from(text.replaceAll(HOME_PLACEHOLDER, homePath))
}
