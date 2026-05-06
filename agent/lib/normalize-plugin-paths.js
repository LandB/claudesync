import { join, sep } from 'path'

/**
 * Rewrites absolute ~/.claude/* paths in plugin registry files to match the
 * current device's claudePath. Called when APPLYING pulled files so source-device
 * usernames don't bleed onto the target device.
 *
 * Handles two files:
 *   plugins/known_marketplaces.json  → normalizes installLocation per entry key
 *   plugins/installed_plugins.json   → normalizes installPath per plugin entry
 */
export function normalizePluginPaths(filePath, content, claudePath) {
  if (filePath === 'plugins/known_marketplaces.json') {
    try {
      const data = JSON.parse(content)
      for (const name of Object.keys(data)) {
        if (data[name].installLocation) {
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
          if (entry.installPath) {
            // Extract the relative portion starting at "plugins/cache/…"
            const marker = `plugins${sep}cache`
            const idx = entry.installPath.lastIndexOf(marker)
            if (idx >= 0) {
              entry.installPath = join(claudePath, entry.installPath.slice(idx))
            }
          }
        }
      }
      return Buffer.from(JSON.stringify(data, null, 2))
    } catch { return content }
  }

  return content
}
