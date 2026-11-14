import { boardMembers } from '../data/sampleData'
import { Card, Avatar, BubbleTag } from './ui'

export default function ClubBoard() {
  return (
    <Card className="p-[22px]" delay={5}>
      <div className="flex items-center justify-between mb-[18px]">
        <h2 className="text-base font-bold text-[var(--text)]">CS Club — Board</h2>
        <BubbleTag label="2026-27" color="blue" size="sm" />
      </div>

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
              <td className="px-3.5 py-3 border-b border-[var(--border)]">
                <div className="flex items-center gap-2.5">
                  <Avatar initials={m.initials} bg={`var(--${m.color})`} size={30} />
                  {m.name}
                </div>
              </td>
              <td className="px-3.5 py-3 border-b border-[var(--border)]">
                <BubbleTag label={m.role} color={m.color} />
              </td>
              <td className="px-3.5 py-3 border-b border-[var(--border)] text-[var(--text-muted)]">
                {m.email}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
