import { ExternalLink, ArrowRight } from 'lucide-react'
import { announcements as defaultAnnouncements } from '../data/sampleData'
import { Card, BubbleTag, IconBadge, cleanText } from './ui'
import { AnnouncementTypeIcon, PlatformIcon } from './icons'

export default function Announcements({
  items,
  userSettings = {},
  searchQuery = '',
  onNav,
}) {
  const base = items && items.length > 0 ? items : defaultAnnouncements
  const channels = userSettings?.channels || {}

  const announcements = base.filter(item => {
    const src = String(item.source || '').toLowerCase()
    if (src.includes('instagram') && channels.instagram === false) return false
    if (src.includes('discord') && channels.discord === false) return false
    if (src.includes('email') && channels.email === false) return false

    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      (item.title || '').toLowerCase().includes(q) ||
      (item.description || '').toLowerCase().includes(q) ||
      (item.club || '').toLowerCase().includes(q)
    )
  })

  const isCompact = Boolean(userSettings?.compactCards)

  return (
    <Card
      className={`${isCompact ? 'p-3.5 sm:p-4' : 'p-4 sm:p-[22px]'} flex flex-col justify-between`}
      delay={3}
    >
      <div>
        <div className={`flex items-center justify-between gap-2 ${isCompact ? 'mb-3' : 'mb-4'}`}>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-[var(--text)]">Announcements</h2>
            <BubbleTag label={`${announcements.length}`} color="red" size="sm" />
          </div>

          {onNav && (
            <button
              type="button"
              onClick={() => onNav('clubs')}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--blue-ink)] hover:underline bg-transparent border-none cursor-pointer"
            >
              <span>All Updates</span>
              <ArrowRight size={13} />
            </button>
          )}
        </div>

        {announcements.length > 0 ? (
          <div className={`flex flex-col ${isCompact ? 'gap-2.5' : 'gap-3.5'}`}>
            {announcements.slice(0, isCompact ? 7 : 5).map((item, i, arr) => {
              const color = item.color || 'blue'
              const isDiscord = item.source === 'discord'
              const isStory = item.source === 'instagram_story'

              return (
                <div
                  key={item.id}
                  className={`flex items-start ${isCompact ? 'gap-2.5' : 'gap-3'} ${
                    i < arr.length - 1
                      ? `${isCompact ? 'pb-2.5' : 'pb-3.5'} border-b border-[var(--border)]`
                      : ''
                  }`}
                >
                  <IconBadge
                    color={color}
                    size={isCompact ? 28 : 34}
                    radius={isCompact ? 8 : 10}
                    className="mt-0.5"
                  >
                    {isDiscord ? (
                      <PlatformIcon type="discord" size={isCompact ? 14 : 17} />
                    ) : isStory ? (
                      <PlatformIcon type="instagram" size={isCompact ? 14 : 17} />
                    ) : (
                      <AnnouncementTypeIcon type={item.type} size={isCompact ? 14 : 17} />
                    )}
                  </IconBadge>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                      <BubbleTag label={item.type} color={color} size="sm" />
                      <span className="text-[11px] text-[var(--text-light)]">{item.time}</span>
                    </div>

                    {item.permalink ? (
                      <a
                        href={item.permalink}
                        target="_blank"
                        rel="noreferrer"
                        className={`inline-flex items-center gap-1 ${
                          isCompact ? 'text-[13px]' : 'text-sm'
                        } font-semibold text-[var(--text)] hover:text-[var(--blue)] no-underline`}
                      >
                        <span>{cleanText(item.title)}</span>
                        <ExternalLink size={12} className="shrink-0 opacity-60" />
                      </a>
                    ) : item.navTarget && onNav ? (
                      <button
                        type="button"
                        onClick={() => onNav(item.navTarget)}
                        className={`text-left ${
                          isCompact ? 'text-[13px]' : 'text-sm'
                        } font-semibold text-[var(--text)] hover:text-[var(--blue-ink)] bg-transparent border-none p-0 cursor-pointer`}
                      >
                        {cleanText(item.title)}
                      </button>
                    ) : (
                      <p
                        className={`${
                          isCompact ? 'text-[13px]' : 'text-sm'
                        } font-semibold text-[var(--text)]`}
                      >
                        {cleanText(item.title)}
                      </p>
                    )}

                    <p
                      className={`text-xs text-[var(--text-muted)] mt-0.5 leading-snug ${
                        isCompact ? 'line-clamp-1' : ''
                      }`}
                    >
                      {cleanText(item.description)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-[var(--text-muted)]">
            No matching announcements for your enabled channels.
          </div>
        )}
      </div>
    </Card>
  )
}
