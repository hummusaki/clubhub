import { useState } from 'react'
import { Copy, Check, Mail } from 'lucide-react'
import { boardMembers } from '../data/sampleData'
import { Card, Avatar, BubbleTag } from './ui'

export default function ClubBoard() {
  const [copiedId, setCopiedId] = useState(null)

  function copyEmail(member) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(member.email).catch(() => {})
    }
    setCopiedId(member.id)
    setTimeout(() => {
      setCopiedId(prev => (prev === member.id ? null : prev))
    }, 1600)
  }

  return (
    <Card className="p-[22px] flex flex-col" delay={5}>
      <div className="flex items-center justify-between mb-[18px]">
        <div>
          <h2 className="text-[16px] font-extrabold tracking-tight text-[var(--text)]">
            CS Club — Board
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Executive officers &amp; weekly office hours
          </p>
        </div>
        <BubbleTag label="2026–27 Term" color="blue" size="sm" />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {['Officer', 'Role', 'Office Hours', 'Contact'].map(h => (
                <th
                  key={h}
                  className="text-left px-3 py-2.5 text-[var(--text-muted)] font-bold
                    text-[10.5px] uppercase tracking-wider border-b border-[var(--border)]"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {boardMembers.map((m, idx) => {
              const isLast = idx === boardMembers.length - 1
              const isCopied = copiedId === m.id
              return (
                <tr
                  key={m.id}
                  className="group hover:bg-[var(--bg-surface)] transition-colors"
                >
                  <td
                    className={`px-3 py-3 ${
                      !isLast ? 'border-b border-[var(--border-subtle)]' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Avatar
                        initials={m.initials}
                        bg={`linear-gradient(135deg, var(--${m.color}), var(--${m.color}-ink))`}
                        size={32}
                      />
                      <span className="font-bold text-[13px] text-[var(--text)]">
                        {m.name}
                      </span>
                    </div>
                  </td>

                  <td
                    className={`px-3 py-3 ${
                      !isLast ? 'border-b border-[var(--border-subtle)]' : ''
                    }`}
                  >
                    <BubbleTag label={m.role} color={m.color} size="sm" />
                  </td>

                  <td
                    className={`px-3 py-3 text-xs font-mono-num text-[var(--text-muted)] ${
                      !isLast ? 'border-b border-[var(--border-subtle)]' : ''
                    }`}
                  >
                    {m.office || 'By appt'}
                  </td>

                  <td
                    className={`px-3 py-3 ${
                      !isLast ? 'border-b border-[var(--border-subtle)]' : ''
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => copyEmail(m)}
                      title="Click to copy email"
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-mono-num
                        text-[var(--text-muted)] hover:text-[var(--blue-ink)] hover:bg-[var(--blue-light)]
                        transition-colors cursor-pointer bg-transparent border-none"
                    >
                      {isCopied ? (
                        <>
                          <Check size={12} className="text-[var(--green-ink)]" />
                          <span className="text-[var(--green-ink)] font-semibold">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Mail size={12} className="opacity-70" />
                          <span>{m.email}</span>
                          <Copy
                            size={11}
                            className="opacity-0 group-hover:opacity-70 transition-opacity"
                          />
                        </>
                      )}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
