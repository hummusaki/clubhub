import { memberActivity } from '../data/sampleData'
import { Card, Avatar, BubbleTag, ProgressBar, SearchBox } from './ui'

export default function MemberActivity() {
  return (
    <Card className="p-[22px] mt-7" delay={6}>
      <div className="flex items-center justify-between mb-[18px]">
        <h2 className="text-base font-bold text-[var(--text)]">Recent Member Activity</h2>
        <SearchBox placeholder="Search members…" width="200px" />
      </div>

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
          {memberActivity.map(m => (
            <tr key={m.id} className="hover:bg-[var(--bg-surface)] transition-colors">
              {/* Name */}
              <td className="px-3.5 py-3 border-b border-[var(--border)]">
                <div className="flex items-center gap-2.5">
                  <Avatar initials={m.initials} bg={m.avatarBg} size={30} />
                  <div>
                    <div className="font-semibold text-[13px]">{m.name}</div>
                    <div className="text-[11px] text-[var(--text-muted)]">{m.email}</div>
                  </div>
                </div>
              </td>
              {/* Clubs */}
              <td className="px-3.5 py-3 border-b border-[var(--border)]">
                <div className="flex gap-1">
                  {m.clubs.map(c => (
                    <BubbleTag key={c.label} label={c.label} color={c.color} size="sm" />
                  ))}
                </div>
              </td>
              {/* Attendance */}
              <td className="px-3.5 py-3 border-b border-[var(--border)]">
                <ProgressBar value={m.attendance} color={m.attendanceColor} />
              </td>
              {/* Joined */}
              <td className="px-3.5 py-3 border-b border-[var(--border)] text-xs text-[var(--text-muted)]">
                {m.joined}
              </td>
              {/* Status */}
              <td className="px-3.5 py-3 border-b border-[var(--border)]">
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
    </Card>
  )
}
