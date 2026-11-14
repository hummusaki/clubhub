import { useState } from 'react'
import { clubs as defaultClubs } from '../data/sampleData'
import { Card, Avatar, BubbleTag } from './ui'

const tabs = ['All', 'Academic', 'Social', 'Arts']

export default function MyClubs({ items }) {
  const clubs = items && items.length > 0 ? items : defaultClubs
  const [filter, setFilter] = useState('All')

  const filtered = filter === 'All'
    ? clubs
    : clubs.filter(c => c.category === filter.toLowerCase())

  return (
    <Card className="p-[22px] mb-7" delay={5}>
      <div className="flex items-center justify-between mb-[18px]">
        <h2 className="text-base font-bold text-[var(--text)]">My Clubs</h2>
        <div className="flex gap-1.5">
          {tabs.map(tab => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-4 py-2 rounded-full text-[13px] font-medium cursor-pointer border-none
                transition-all duration-200
                ${filter === tab
                  ? 'bg-[var(--blue)] text-white'
                  : 'bg-transparent text-[var(--text-muted)] hover:bg-[var(--bg-surface)]'
                }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3.5">
        {filtered.map(club => (
          <Card key={club.id} className="p-[18px] !rounded-[var(--radius-sm)]">
            <div className="flex items-center gap-3 mb-3.5">
              <Avatar initials={club.abbr} bg={club.avatarBg} size={42} />
              <div>
                <div className="font-semibold text-sm text-[var(--text)]">{club.name}</div>
                <div className="text-[11px] text-[var(--text-muted)]">{club.members} members</div>
              </div>
            </div>
            <div className="flex gap-1.5 flex-wrap mb-3">
              {club.tags.map(tag => (
                <BubbleTag key={tag.label} label={tag.label} color={tag.color} />
              ))}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[var(--text-muted)]">📅 {club.schedule}</span>
              <BubbleTag label="Active" color="green" size="sm" dot />
            </div>
          </Card>
        ))}
      </div>
    </Card>
  )
}
