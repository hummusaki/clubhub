import { useMemo } from 'react'
import { ExternalLink, ArrowRight } from 'lucide-react'
import { Card, BubbleTag, IconBadge, Button, cleanText } from './ui'
import { AnnouncementTypeIcon, PlatformIcon } from './icons'
import { filterAndRankBySearch } from '../utils/search'
import { announcementKey, announcementPermalink } from '../utils/announcementLinks'

export default function Announcements({
  items,
  joinedCount = 0,
  full = false,
  onBrowseClubs,
  userSettings = {},
  searchQuery = '',
  onNav,
  onOpenAnnouncement,
}) {
  const base = useMemo(
    () => (joinedCount > 0 && Array.isArray(items) ? items : []),
    [joinedCount, items]
  )
  const channels = userSettings?.channels || {}

  const announcements = useMemo(() => {
    const channelFiltered = base.filter(item => {
      const src = String(item.source || '').toLowerCase()
      if (src.includes('instagram') && channels.instagram === false) return false
      if (src.includes('discord') && channels.discord === false) return false
      if (src.includes('email') && channels.email === false) return false
      return true
    })
    return filterAndRankBySearch(channelFiltered, searchQuery, item => ({
      primary: [item.title],
      secondary: [item.club, item.type, item.source],
      tertiary: [item.description],
    }))
  }, [base, channels, searchQuery])

  const isCompact = Boolean(userSettings?.compactCards)
  const titleClass = `${isCompact ? 'text-[13px]' : 'text-sm'} font-medium text-[var(--text)]`
  const previewTitleClass = full ? '' : 'min-w-0 line-clamp-2 wrap-anywhere'

  return (
    <Card
      className="section-pad"
      delay={2}
    >
      <div>
        <div className={full ? "flex flex-wrap items-center justify-between gap-1 mb-2" : "dashboard-card-header mb-2"}>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-base font-medium text-[var(--text)]">Announcements</h2>
            <BubbleTag label={`${announcements.length}`} color="blue" size="sm" />
          </div>

          {onNav && (
            <Button
              variant="text"
              size="sm"
              trailingIcon={<ArrowRight size={13} />}
              onClick={() => onNav('clubs', { section: 'updates' })}
            >
              All updates
            </Button>
          )}
        </div>

        {announcements.length > 0 ? (
          <div className={full ? `flex flex-col ${isCompact ? 'gap-2.5' : 'gap-3'}` : 'dashboard-announcement-preview'}>
            {(full ? announcements : announcements.slice(0, 3)).map(item => {
              const color = item.color || 'blue'
              const isDiscord = item.source === 'discord'
              const isStory = item.source === 'instagram_story'
              const isEmail = item.source === 'email'
              const permalink = announcementPermalink(item)
              const title = cleanText(item.title)

              return (
                <div
                  key={announcementKey(item)}
                  className={`content-tile rounded-[var(--radius-sm)] flex items-start ${
                    isCompact ? 'p-2 gap-2' : 'px-2.5 py-2 gap-2.5'
                  }`}
                >
                  <IconBadge
                    color={color}
                    size={isCompact ? 32 : 36}
                    radius={9999}
                    className="mt-0.5"
                  >
                    {isDiscord ? (
                      <PlatformIcon type="discord" size={isCompact ? 14 : 16} />
                    ) : isStory ? (
                      <PlatformIcon type="instagram" size={isCompact ? 14 : 16} />
                    ) : isEmail ? (
                      <PlatformIcon type="email" size={isCompact ? 14 : 16} />
                    ) : (
                      <AnnouncementTypeIcon type={item.type} size={isCompact ? 14 : 16} />
                    )}
                  </IconBadge>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <BubbleTag label={item.type} color={color} size="sm" />
                      <span className="text-xs text-[var(--text-muted)]">{item.time}</span>
                    </div>

                    {permalink ? (
                      <a
                        href={permalink}
                        target="_blank"
                        rel="noreferrer"
                        className={`inline-flex items-center gap-1 ${titleClass} hover:text-[var(--blue)] no-underline`}
                      >
                        <span className={previewTitleClass}>{title}</span>
                        <ExternalLink size={12} className="shrink-0 opacity-60" />
                      </a>
                    ) : onOpenAnnouncement ? (
                      <button
                        type="button"
                        onClick={() => onOpenAnnouncement(item)}
                        className={`${full ? '' : 'block w-full max-h-[2lh]'} text-left ${titleClass} hover:text-[var(--blue)] bg-transparent border-none p-0 cursor-pointer`}
                      >
                        <span className={previewTitleClass}>{title}</span>
                      </button>
                    ) : (
                      <p className={`${titleClass} ${previewTitleClass}`}>{title}</p>
                    )}

                    <p
                      className={`text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed ${
                        full ? (isCompact ? 'line-clamp-2' : '') : 'truncate'
                      }`}
                    >
                      {cleanText(item.description)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        ) : joinedCount === 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-[var(--text-muted)]">Join a club to receive announcements.</p>
            {onBrowseClubs && <Button variant="text" size="sm" onClick={onBrowseClubs}>Browse clubs</Button>}
          </div>
        ) : (
          <div className={`text-sm text-[var(--text-muted)] ${full ? 'py-8 text-center' : ''}`}>
            {searchQuery.trim()
              ? 'No matching announcements in your joined clubs.'
              : 'No announcements from your joined clubs yet.'}
          </div>
        )}
      </div>
    </Card>
  )
}
