import { FileText, Table, MessageCircle, PlayCircle, CheckCircle, ExternalLink } from 'lucide-react'
import { links } from '../data/sampleData'
import { Card } from './ui'

const iconMap = { FileText, Table, MessageCircle, PlayCircle, CheckCircle }

export default function LinksResources() {
  return (
    <Card className="p-[22px]" delay={6}>
      <div className="flex items-center justify-between mb-[18px]">
        <h2 className="text-base font-bold text-[var(--text)]">Links & Resources</h2>
        <button
          className="px-3.5 py-1.5 rounded-full bg-[var(--blue)] text-white border-none
            text-xs font-semibold cursor-pointer hover:opacity-90 transition-opacity"
        >
          + Add Link
        </button>
      </div>

      <div className="flex flex-col gap-2.5">
        {links.map(link => {
          const Icon = iconMap[link.icon]
          return (
            <a
              key={link.id}
              href="#"
              className="flex items-center gap-3 px-3.5 py-3 rounded-[var(--radius-sm)]
                bg-[var(--bg-surface)] no-underline transition-colors duration-200
                hover:bg-[var(--blue-light)] group"
              style={{ textDecoration: 'none' }}
            >
              <div
                className="w-9 h-9 rounded-[10px] flex items-center justify-center shrink-0"
                style={{ background: `var(--${link.color}-light)` }}
              >
                {Icon && <Icon size={18} style={{ color: `var(--${link.color})` }} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-[var(--text)]">{link.title}</div>
                <div className="text-[11px] text-[var(--text-muted)]">{link.subtitle}</div>
              </div>
              <ExternalLink size={16} className="text-[var(--text-light)] shrink-0" />
            </a>
          )
        })}
      </div>
    </Card>
  )
}
