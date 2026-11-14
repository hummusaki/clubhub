import { announcements as defaultAnnouncements } from '../data/sampleData'
import { Card, BubbleTag } from './ui'

export default function Announcements({ items }) {
  const announcements = items && items.length > 0 ? items : defaultAnnouncements
  return (
    <Card className="p-[22px]" delay={4}>
      <div className="flex items-center justify-between mb-[18px]">
        <h2 className="text-base font-bold text-[var(--text)]">Announcements</h2>
        <div
          className="w-[18px] h-[18px] rounded-full bg-[var(--red)] text-white text-[10px]
            font-bold flex items-center justify-center"
        >
          {announcements.length}
        </div>
      </div>

      <div className="flex flex-col gap-3.5">
        {announcements.map((item, i) => (
          <div
            key={item.id}
            className={i < announcements.length - 1 ? 'pb-3.5 border-b border-[var(--border)]' : ''}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <BubbleTag label={item.type} color={item.color} />
              <span className="text-[11px] text-[var(--text-light)]">{item.time}</span>
            </div>
            <p className="text-[13px] font-semibold text-[var(--text)]">{item.title}</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">{item.description}</p>
          </div>
        ))}
      </div>
    </Card>
  )
}
