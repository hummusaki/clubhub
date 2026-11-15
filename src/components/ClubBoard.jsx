import { boardMembers } from '../data/sampleData'
import { Card, Avatar, BubbleTag } from './ui'

export default function ClubBoard() {
  return (
    <Card className="p-4 sm:p-[22px]" delay={5}>
      <div className="flex items-center justify-between mb-4 sm:mb-[18px]">
        <h2 className="text-base font-bold text-[var(--text)]">CS Club — Board</h2>
        <BubbleTag label="2026–27" color="blue" size="sm" />
      </div>

      {/* ── Phone Card List (< md) ── */}
      <div className="flex md:hidden flex-col gap-2.5">
        {boardMembers.map(m => (
          <div
            key={m.id}
            className="p-3 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border-subtle)]
              flex items-center justify-between gap-2.5"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Avatar initials={m.initials} bg={`var(--${m.color})`} size={32} />
              <div className="min-w-0">
                <div className="font-semibold text-[13px] text-[var(--text)] truncate">
                  {m.name}
                </div>
                <div className="text-[11px] text-[var(--text-muted)] truncate">{m.email}</div>
              </div>
            </div>
            <BubbleTag label={m.role} color={m.color} size="sm" />
          </div>
        ))}
      </div>

      {/* ── Tablet / Desktop Table (md+) ── */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {['Member', 'Role', 'Contact'].map(h => (
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
            {boardMembers.map(m => (
              <tr key={m.id} className="hover:bg-[var(--bg-surface)] transition-colors">
                <td className="px-3.5 py-3 border-b border-[var(--border-subtle)]">
                  <div className="flex items-center gap-2.5">
                    <Avatar initials={m.initials} bg={`var(--${m.color})`} size={30} />
                    <span className="font-medium text-[var(--text)]">{m.name}</span>
                  </div>
                </td>
                <td className="px-3.5 py-3 border-b border-[var(--border-subtle)]">
                  <BubbleTag label={m.role} color={m.color} size="sm" />
                </td>
                <td className="px-3.5 py-3 border-b border-[var(--border-subtle)] text-[var(--text-muted)]">
                  {m.email}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
