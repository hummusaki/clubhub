import { useState } from 'react'
import { ArrowUpDown } from 'lucide-react'
import { memberActivity } from '../data/sampleData'
import { Card, Avatar, BubbleTag, ProgressBar, SearchBox } from './ui'

export default function MemberActivity({ globalSearch = '' }) {
  const [localSearch, setLocalSearch] = useState('')
  const [sortDesc, setSortDesc] = useState(true)

  const effectiveQuery = (localSearch || globalSearch).trim().toLowerCase()

  const filtered = memberActivity
    .filter(m => {
      if (!effectiveQuery) return true
      return (
        m.name.toLowerCase().includes(effectiveQuery) ||
        m.email.toLowerCase().includes(effectiveQuery) ||
        (m.role && m.role.toLowerCase().includes(effectiveQuery)) ||
        m.clubs.some(c => c.label.toLowerCase().includes(effectiveQuery))
      )
    })
    .sort((a, b) => (sortDesc ? b.attendance - a.attendance : a.attendance - b.attendance))

  return (
    <Card className="p-[22px] mt-7" delay={6}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-[18px]">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-[16px] font-extrabold tracking-tight text-[var(--text)]">
              Recent Member Activity
            </h2>
            <span className="text-[11px] font-bold font-mono-num px-2 py-0.5 rounded-full bg-[var(--bg-subtle)] text-[var(--text-muted)]">
              {filtered.length}
            </span>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Cross-club attendance &amp; participation across active rosters
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSortDesc(s => !s)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold
              bg-[var(--bg-surface)] border border-[var(--border)] text-[var(--text-muted)]
              hover:text-[var(--text)] cursor-pointer transition-colors"
          >
            <ArrowUpDown size={13} />
            Attendance {sortDesc ? '↓' : '↑'}
          </button>
          <SearchBox
            placeholder="Filter members or clubs…"
            width="220px"
            value={localSearch}
            onChange={setLocalSearch}
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {['Member', 'Role', 'Clubs', 'Attendance', 'Joined', 'Status'].map(h => (
                <th
                  key={h}
                  className="text-left px-3.5 py-2.5 text-[var(--text-muted)] font-bold
                    text-[10.5px] uppercase tracking-wider border-b border-[var(--border)]"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((m, idx) => {
              const isLast = idx === filtered.length - 1
              const borderCls = !isLast ? 'border-b border-[var(--border-subtle)]' : ''
              return (
                <tr key={m.id} className="hover:bg-[var(--bg-surface)] transition-colors">
                  {/* Name */}
                  <td className={`px-3.5 py-3 ${borderCls}`}>
                    <div className="flex items-center gap-2.5">
                      <Avatar initials={m.initials} bg={m.avatarBg} size={34} />
                      <div>
                        <div className="font-bold text-[13px] text-[var(--text)]">{m.name}</div>
                        <div className="text-[11px] font-mono-num text-[var(--text-muted)]">
                          {m.email}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Role */}
                  <td className={`px-3.5 py-3 text-xs font-semibold text-[var(--text-muted)] ${borderCls}`}>
                    {m.role || 'Member'}
                  </td>

                  {/* Clubs */}
                  <td className={`px-3.5 py-3 ${borderCls}`}>
                    <div className="flex flex-wrap gap-1">
                      {m.clubs.map(c => (
                        <BubbleTag key={c.label} label={c.label} color={c.color} size="sm" />
                      ))}
                    </div>
                  </td>

                  {/* Attendance */}
                  <td className={`px-3.5 py-3 ${borderCls}`}>
                    <ProgressBar value={m.attendance} color={m.attendanceColor} />
                  </td>

                  {/* Joined */}
                  <td className={`px-3.5 py-3 ${borderCls}`}>
                    <div className="text-xs font-mono-num text-[var(--text)] font-medium">
                      {m.joined}
                    </div>
                    {m.lastActive && (
                      <div className="text-[10.5px] text-[var(--text-light)]">
                        Active {m.lastActive}
                      </div>
                    )}
                  </td>

                  {/* Status */}
                  <td className={`px-3.5 py-3 ${borderCls}`}>
                    <BubbleTag
                      label={m.status}
                      color={m.statusColor}
                      size="sm"
                      dot={m.status === 'Active'}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="py-8 text-center text-xs text-[var(--text-muted)]">
            No members found matching &ldquo;{effectiveQuery}&rdquo;.
          </div>
        )}
      </div>
    </Card>
  )
}
