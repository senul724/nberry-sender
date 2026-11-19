/** A short browser/OS label for the device list, e.g. "Chrome on macOS" (≤100 chars). */
export function deviceName(ua: string = navigator.userAgent): string {
  let browser = 'Browser'
  if (/Edg\//.test(ua)) browser = 'Edge'
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera'
  else if (/Firefox\/|FxiOS\//.test(ua)) browser = 'Firefox'
  else if (/Chrome\/|CriOS\//.test(ua)) browser = 'Chrome'
  else if (/Safari\//.test(ua)) browser = 'Safari'

  let os = 'Unknown OS'
  if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS'
  else if (/Android/.test(ua)) os = 'Android'
  else if (/CrOS/.test(ua)) os = 'ChromeOS'
  else if (/Windows/.test(ua)) os = 'Windows'
  else if (/Macintosh|Mac OS X/.test(ua)) os = 'macOS'
  else if (/Linux/.test(ua)) os = 'Linux'

  return `${browser} on ${os}`.slice(0, 100)
}

export function deviceInfo() {
  return { name: deviceName(), platform: 'web' as const }
}
