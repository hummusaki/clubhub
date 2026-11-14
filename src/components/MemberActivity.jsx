import { useState } from 'react'
import { memberActivity } from '../data/sampleData'
import { Card, Avatar, BubbleTag, ProgressBar, SearchBox } from './ui'

export default function MemberActivity({ globalSearch = '' }) {
  const [localSearch, setLocalSearch] = useState('')

  const effectiveQuery = (localSearch || globalSearch).trim().toLowerCase()

  const filtered = memberActivity.filter(m => {
    if (!effectiveQuery) return true
    return (
      m.name.toLowerCase().includes(effectiveQuery) ||
      m.email.toLowerCase().includes(effectiveQuery) ||
      m.clubs.some(c => c.label.toLowerCase().includes(effectiveQuery))
    )
  })

  return (
    <Card className="p-4 sm:p-[22px] mt-5 sm:mt-7" delay={6}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-[18px]">
        <h2 className="text-base font-bold text-[var(--text)]">Recent Member Activity</h2>
        <div className="w-full sm:w-[200px]">
          <SearchBox
            placeholder="Search members…"
            width="100%"
            value={localSearch}
            onChange={setLocalSearch}
          />
        </div>
      </div>

      {/* ── Phone Card List (< md) ── */}
      <div className="flex md:hidden flex-col gap-2.5">
        {filtered.map(m => (
          <div
            key={m.id}
            className="p-3 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border-subtle)]
              flex flex-col gap-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <Avatar initials={m.initials} bg={m.avatarBg} size={32} />
                <div className="min-w-0">
                  <div className="font-semibold text-[13px] text-[var(--text)] truncate">
                    {m.name}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] truncate">{m.email}</div>
                </div>
              </div>
              <BubbleTag
                label={m.status}
                color={m.statusColor}
                size="sm"
                dot={m.status === 'Active'}
              />
            </div>

            <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--border-subtle)]">
              <div className="flex flex-wrap gap-1">
                {m.clubs.map(c => (
                  <BubbleTag key={c.label} label={c.label} color={c.color} size="sm" />
                ))}
              </div>
              <ProgressBar value={m.attendance} color={m.attendanceColor} />
            </div>
          </div>
        ))}
      </div>

      {/* ── Tablet / Desktop Table (md+) ── */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {['Member', 'Clubs', 'Attendance', 'Joined', 'Status'].map(h => (
                <th
                  key={h}
                  className="text-left px-3.5 py-2.5 text-[var(--text-muted)] font-semibold
                    text-[11px] uppercase tracking-wide border-b border-[var(--border)]"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(m => (
              <tr key={m.id} className="hover:bg-[var(--bg-surface)] transition-colors">
                <td className="px-3.5 py-3 border-b border-[var(--border-subtle)]">
                  <div className="flex items-center gap-2.5">
                    <Avatar initials={m.initials} bg={m.avatarBg} size={30} />
                    <div>
                      <div className="font-semibold text-[13px] text-[var(--text)]">{m.name}</div>
                      <div className="text-[11px] text-[var(--text-muted)]">{m.email}</div>
                    </div>
                  </div>
                </td>

                <td className="px-3.5 py-3 border-b border-[var(--border-subtle)]">
                  <div className="flex flex-wrap gap-1">
                    {m.clubs.map(c => (
                      <BubbleTag key={c.label} label={c.label} color={c.color} size="sm" />
                    ))}
                  </div>
                </td>

                <td className="px-3.5 py-3 border-b border-[var(--border-subtle)]">
                  <ProgressBar value={m.attendance} color={m.attendanceColor} />
                </td>

                <td className="px-3.5 py-3 border-b border-[var(--border-subtle)] text-xs text-[var(--text-muted)]">
                  {m.joined}
                </td>

                <td className="px-3.5 py-3 border-b border-[var(--border-subtle)]">
                  <BubbleTag
                    label={m.status}
                    color={m.statusColor}
                    size="sm"
                    dot={m.status === 'Active'}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
