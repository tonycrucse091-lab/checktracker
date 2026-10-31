const placeholderPattern = /(?:YOUR[_-][A-Z0-9_-]+|REPLACE[_-](?:WITH[_-])?[A-Z0-9_-]+)/i

export function hasUsableSupabaseConfiguration(projectUrl: string, publishableKey: string): boolean {
  const urlValue = projectUrl.trim()
  const keyValue = publishableKey.trim()
  if (!urlValue || !keyValue || placeholderPattern.test(urlValue) || placeholderPattern.test(keyValue)) return false

  try {
    const url = new URL(urlValue)
    const localHosts = new Set(['localhost', '127.0.0.1', '[::1]'])
    const secureRemote = url.protocol === 'https:'
    const localDevelopment = url.protocol === 'http:' && localHosts.has(url.hostname)
    return (secureRemote || localDevelopment)
      && !url.username
      && !url.password
      && !url.search
      && !url.hash
      && (url.pathname === '/' || url.pathname === '')
  } catch {
    return false
  }
}
