export function announcementKey(item) {
  return JSON.stringify([item.source, item.clubId, item.id])
}

export function announcementPermalink(item) {
  if (!item.permalink) return null
  try {
    const url = new URL(item.permalink)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null

    // The catalog also stores invites and profile links in the permalink field.
    // Those announcements open in ClubHub because the URL cannot identify the post.
    if (/(^|\.)discord\.gg$/.test(url.hostname)) return null
    if (/(^|\.)discord(?:app)?\.com$/.test(url.hostname) &&
        !/^\/channels\/(?:@me|\d+)\/\d+\/\d+\/?$/.test(url.pathname)) return null
    if (/(^|\.)instagram\.com$/.test(url.hostname) &&
        !/^\/(?:(?:p|reels?|tv)\/[^/]+|stories\/[^/]+\/[^/]+)\/?$/.test(url.pathname)) return null
    return url.href
  } catch {
    return null
  }
}
