import { useState } from 'react'
import { Calendar, MapPin, Users, Check, Plus, Sparkles } from 'lucide-react'
import { clubs as defaultClubs } from '../data/sampleData'
import { Card, Avatar, BubbleTag } from './ui'

const tabs = [
  { id: 'All', label: 'My Clubs' },
  { id: 'Academic', label: 'Academic' },
  { id: 'Social', label: 'Social' },
  { id: 'Arts', label: 'Arts' },
  { id: 'Discover', label: 'Discover All' },
]

export default function MyClubs({
  items,
  clubsData,
  onToggleJoin,
  defaultTab = 'All',
  searchQuery = '',
}) {
  const [localClubs, setLocalClubs] = useState(defaultClubs)
  const [filter, setFilter] = useState(defaultTab)
  const [selectedId, setSelectedId] = useState(null)

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
                role: c.joined ? 'Open to Join' : 'Member',
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
        (c.description || '').toLowerCase().includes(q) ||
        (c.tags || []).some(t => t.label.toLowerCase().includes(q))
      )
    }
    return true
  })

  return (
    <Card className="p-4 sm:p-[22px] mb-5 sm:mb-7" delay={5}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-[18px]">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[15.5px] sm:text-[16px] font-extrabold tracking-tight text-[var(--text)]">
              {activeFilter === 'Discover' ? 'Campus Club Directory' : 'My Clubs'}
            </h2>
            <span className="text-[11px] font-bold font-mono-num px-2 py-0.5 rounded-full bg-[var(--bg-subtle)] text-[var(--text-muted)]">
              {filtered.length}
            </span>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            {activeFilter === 'Discover'
              ? 'Browse active organizations across campus and join with one click.'
              : 'Your active memberships, leadership roles, and weekly meeting times.'}
          </p>
        </div>

        {/* Filter pill bar */}
        <div className="flex items-center gap-1 p-1 rounded-full bg-[var(--bg-surface)] border border-[var(--border)] overflow-x-auto max-w-full">
          {tabs.map(tab => {
            const isActive = activeFilter === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`px-3 sm:px-3.5 py-1.5 rounded-full text-[11.5px] sm:text-[12px] font-bold cursor-pointer border-none
                  transition-all duration-200 inline-flex items-center gap-1.5 shrink-0
                  ${
                    isActive
                      ? 'bg-[var(--blue)] text-white shadow-xs'
                      : 'bg-transparent text-[var(--text-muted)] hover:text-[var(--text)]'
                  }`}
              >
                {tab.id === 'Discover' && <Sparkles size={12} />}
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map(club => {
          const isSelected = selectedId === club.id
          const isJoined = club.joined !== undefined ? club.joined : true

          return (
            <div
              key={club.id}
              onClick={() => setSelectedId(isSelected ? null : club.id)}
              className="group relative flex flex-col justify-between p-[18px] rounded-[var(--radius-sm)]
                bg-[var(--bg-card)] border border-[var(--border)] shadow-[var(--shadow-xs)]
                hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5
                transition-all duration-200 cursor-pointer"
            >
              <div>
                {/* Top header: Avatar + Name + Role / Join */}
                <div className="flex items-start justify-between gap-2.5 mb-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar initials={club.abbr} bg={club.avatarBg} size={42} />
                    <div className="min-w-0">
                      <div className="font-bold text-[14.5px] text-[var(--text)] truncate group-hover:text-[var(--blue-ink)] transition-colors">
                        {club.name}
                      </div>
                      <div className="flex items-center gap-2 text-[11.5px] text-[var(--text-muted)] mt-0.5">
                        <span className="inline-flex items-center gap-1 font-mono-num">
                          <Users size={12} />
                          {club.members}
                        </span>
                        {club.role && (
                          <>
                            <span>·</span>
                            <span className="font-semibold text-[var(--text)]">{club.role}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {activeFilter === 'Discover' || !isJoined ? (
                    <button
                      type="button"
                      onClick={e => handleJoin(club.id, e)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold
                        cursor-pointer transition-all border shrink-0"
                      style={{
                        background: isJoined ? 'var(--green-light)' : 'var(--blue)',
                        color: isJoined ? 'var(--green-ink)' : '#fff',
                        borderColor: isJoined ? 'var(--green)' : 'var(--blue)',
                      }}
                    >
                      {isJoined ? <Check size={12} strokeWidth={2.5} /> : <Plus size={12} />}
                      {isJoined ? 'Joined' : 'Join'}
                    </button>
                  ) : (
                    <BubbleTag label="Active" color="green" size="sm" dot />
                  )}
                </div>

                {/* Description */}
                {club.description && (
                  <p className="text-[12px] text-[var(--text-muted)] leading-relaxed mb-3 line-clamp-2">
                    {club.description}
                  </p>
                )}

                {/* Tags */}
                <div className="flex gap-1.5 flex-wrap mb-3.5">
                  {(club.tags || []).map(tag => (
                    <BubbleTag key={tag.label} label={tag.label} color={tag.color || 'blue'} size="sm" />
                  ))}
                </div>
              </div>

              {/* Footer */}
              <div className="pt-2.5 border-t border-[var(--border-subtle)] flex items-center justify-between text-[11.5px] text-[var(--text-muted)]">
                <span className="inline-flex items-center gap-1.5 font-medium truncate">
                  <Calendar size={12.5} className="text-[var(--text-light)] shrink-0" />
                  {club.schedule}
                </span>
                {club.room && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-light)] truncate max-w-[140px]">
                    <MapPin size={12} className="shrink-0" />
                    {club.room}
                  </span>
                )}
              </div>

              {/* Expandable detail drawer on click */}
              {isSelected && club.nextEvent && (
                <div
                  className="mt-3 pt-2.5 border-t border-[var(--border)] flex items-center justify-between
                    text-[11.5px] fade-in"
                >
                  <div>
                    <span className="font-bold text-[var(--text)]">Next: </span>
                    <span className="text-[var(--text-muted)]">{club.nextEvent}</span>
                  </div>
                  <button
                    type="button"
                    onClick={e => handleJoin(club.id, e)}
                    className="text-[11px] font-bold text-[var(--blue-ink)] hover:underline bg-transparent border-none cursor-pointer"
                  >
                    {isJoined ? 'Leave club' : 'Join now'}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Card>
  )
}
