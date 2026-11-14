import { announcements as defaultAnnouncements } from '../data/sampleData'
import { Card, BubbleTag, IconBadge, cleanText } from './ui'
import { AnnouncementTypeIcon } from './icons'

export default function Announcements({ items }) {
  const announcements = items && items.length > 0 ? items : defaultAnnouncements

  return (
    <Card className="p-4 sm:p-[22px]" delay={4}>
      <div className="flex items-center justify-between mb-4 sm:mb-[18px]">
        <h2 className="text-base font-bold text-[var(--text)]">Announcements</h2>
        <span
          className="min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold font-mono-num
            flex items-center justify-center"
          style={{
            background: 'var(--red-light)',
            color: 'var(--red-ink)',
          }}
        >
          {announcements.length}
        </span>
      </div>

      <div className="flex flex-col gap-3.5">
        {announcements.map((item, i) => {
          const color = item.color || 'blue'
          return (
            <div
              key={item.id}
              className={`flex items-start gap-3 ${
                i < announcements.length - 1 ? 'pb-3.5 border-b border-[var(--border)]' : ''
              }`}
            >
              <IconBadge color={color} size={34} radius={10} className="mt-0.5">
                <AnnouncementTypeIcon type={item.type} size={17} />
              </IconBadge>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <BubbleTag label={item.type} color={color} size="sm" />
                  <span className="text-[11px] text-[var(--text-light)]">{item.time}</span>
                </div>
                <p className="text-[13px] font-semibold text-[var(--text)]">
                  {cleanText(item.title)}
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">
                  {cleanText(item.description)}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
