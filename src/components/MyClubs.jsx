import { useState } from 'react'
import { Calendar, Check, Plus } from 'lucide-react'
import { clubs as defaultClubs } from '../data/sampleData'
import { Card, ClubAvatar, BubbleTag, cleanText } from './ui'

const tabs = ['All', 'Academic', 'Social', 'Arts', 'Discover']

export default function MyClubs({
  items,
  clubsData,
  onToggleJoin,
  defaultTab = 'All',
  searchQuery = '',
}) {
  const [localClubs, setLocalClubs] = useState(defaultClubs)
  const [filter, setFilter] = useState(defaultTab)

  const list = items && items.length > 0 ? items : clubsData || localClubs

  function handleJoin(id, e) {
    e.stopPropagation()
    if (onToggleJoin) {
      onToggleJoin(id)
    } else {
      setLocalClubs(prev =>
        prev.map(c =>
          c.id === id
            ? {
                ...c,
                joined: !c.joined,
                members: c.joined ? c.members - 1 : c.members + 1,
              }
            : c
        )
      )
    }
  }

  const activeFilter = defaultTab === 'Discover' && filter === 'All' ? 'Discover' : filter

  const filtered = list.filter(c => {
    const isJoined = c.joined !== undefined ? c.joined : true
    if (activeFilter !== 'Discover' && !isJoined) return false
    if (
      activeFilter !== 'All' &&
      activeFilter !== 'Discover' &&
      (c.category || '').toLowerCase() !== activeFilter.toLowerCase()
    ) {
      return false
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      return (
        (c.name || '').toLowerCase().includes(q) ||
        (c.tags || []).some(t => t.label.toLowerCase().includes(q))
      )
    }
    return true
  })

  return (
    <Card className="p-4 sm:p-[22px] mb-5 sm:mb-7" delay={5}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-[18px]">
        <h2 className="text-base font-bold text-[var(--text)]">
          {activeFilter === 'Discover' ? 'Discover Clubs' : 'My Clubs'}
        </h2>

        <div className="flex items-center gap-1 overflow-x-auto max-w-full">
          {tabs.map(tab => {
            const isActive = activeFilter === tab
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setFilter(tab)}
                className={`px-3.5 py-1.5 rounded-full text-[12.5px] font-medium cursor-pointer border-none
                  transition-colors duration-200 shrink-0
                  ${
                    isActive
                      ? 'bg-[var(--blue)] text-white'
                      : 'bg-transparent text-[var(--text-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--text)]'
                  }`}
              >
                {tab}
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
        {filtered.map(club => {
          const isJoined = club.joined !== undefined ? club.joined : true

          return (
            <div
              key={club.id}
              className="p-[18px] rounded-[var(--radius-sm)] bg-[var(--bg-card)]
                border border-[var(--border)] shadow-[var(--shadow-xs)]
                hover:shadow-[var(--shadow-md)] transition-all duration-200"
            >
              <div className="flex items-center gap-3 mb-3.5">
                <ClubAvatar club={club} size={42} />
                <div className="min-w-0">
                  <div className="font-semibold text-sm text-[var(--text)] truncate">
                    {cleanText(club.name)}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)]">
                    {club.members} members
                  </div>
                </div>
              </div>

              <div className="flex gap-1.5 flex-wrap mb-3.5">
                {(club.tags || []).map(tag => (
                  <BubbleTag
                    key={tag.label}
                    label={tag.label}
                    color={tag.color || 'blue'}
                    size="sm"
                  />
                ))}
              </div>

              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 text-[11.5px] text-[var(--text-muted)] truncate">
                  <Calendar size={12.5} className="text-[var(--text-light)] shrink-0" />
                  {cleanText(club.schedule)}
                </span>

                {activeFilter === 'Discover' || !isJoined ? (
                  <button
                    type="button"
                    onClick={e => handleJoin(club.id, e)}
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold
                      cursor-pointer transition-colors border"
                    style={{
                      background: isJoined ? 'var(--green-light)' : 'var(--blue)',
                      color: isJoined ? 'var(--green-ink)' : '#fff',
                      borderColor: isJoined ? 'transparent' : 'var(--blue)',
                    }}
                  >
                    {isJoined ? <Check size={11} /> : <Plus size={11} />}
                    {isJoined ? 'Joined' : 'Join'}
                  </button>
                ) : (
                  <BubbleTag label="Active" color="green" size="sm" dot />
                )}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
