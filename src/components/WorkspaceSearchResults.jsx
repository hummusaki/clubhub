import { useId, useMemo } from 'react'
import { ArrowRight, Calendar, Heart, Link, Users } from 'lucide-react'
import { cleanText } from './ui'
import { getWorkspaceSearchGroups } from '../utils/workspaceSearch'

const icons = { club: Heart, event: Calendar, resource: Link, person: Users }

function display(type, item) {
  switch (type) {
    case 'club': return [item.name, item.instagram ? `@${item.instagram}` : (item.categoryLabel || item.category)]
    case 'event': return [item.event || item.title, [item.club, item.day, item.date, item.location].filter(Boolean).join(' · ')]
    case 'resource': return [item.title || item.rawLabel, [item.clubName, item.category].filter(Boolean).join(' · ')]
    case 'person': return [item.name, [item.role, item.club].filter(Boolean).join(' · ')]
  }
}

export default function WorkspaceSearchResults({ query, sources, onSelect }) {
  const prefix = useId()
  const groups = useMemo(() => getWorkspaceSearchGroups(query, sources), [query, sources])
  const hasQuery = Boolean(query.trim())
  return (
    <div className="space-y-2 p-2.5">
      <p role="status" className={groups.length ? 'sr-only' : 'px-3 py-2 text-sm text-[var(--text-muted)] break-words'}>
        {!hasQuery ? 'Search for a club, event, resource, or public officer.'
          : !groups.length ? `No results for “${query.trim()}”. Try a shorter name, a club handle, or a location.`
          : `Results for “${query.trim()}” in ${groups.map(group => group.label).join(', ')}.`}
      </p>
      {groups.map(({ type, label, items }) => {
        const Icon = icons[type]
        const id = `${prefix}-${type}`
        return (
          <section key={type} aria-labelledby={id}>
            <h2 id={id} className="px-3 py-1 text-xs font-medium text-[var(--text-muted)]">{label}</h2>
            <ul className="list-none">
              {items.map(item => {
                const [name, context] = display(type, item)
                return (
                  <li key={item.id}>
                    <button type="button" data-search-result onClick={() => onSelect(type, item)}
                      className="ui-touch w-full min-h-11 rounded-xl flex items-center gap-2.5 px-3 py-1.5 text-left cursor-pointer hover:bg-[var(--bg-subtle)] focus-visible:bg-[var(--bg-subtle)]">
                      <Icon size={17} aria-hidden="true" className="shrink-0 text-[var(--blue)]" />
                      <span className="min-w-0 flex-1 break-words">
                        <span className="block text-sm font-medium text-[var(--text)]">{cleanText(name)}</span>
                        {context && <span className="block text-xs text-[var(--text-muted)]">{cleanText(context)}</span>}
                      </span>
                      <ArrowRight size={14} aria-hidden="true" className="shrink-0 text-[var(--text-muted)]" />
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
