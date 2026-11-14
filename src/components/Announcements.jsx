import { useState } from 'react'
import { Pin, Plus, Megaphone } from 'lucide-react'
import { announcements as initialAnnouncements } from '../data/sampleData'
import { Card, BubbleTag } from './ui'

export default function Announcements() {
  const [list, setList] = useState(initialAnnouncements)
  const [composing, setComposing] = useState(false)
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')

  function togglePin(id) {
    setList(prev =>
      prev
        .map(item => (item.id === id ? { ...item, pinned: !item.pinned } : item))
        .sort((a, b) => Number(b.pinned) - Number(a.pinned))
    )
  }

  function handleAdd(e) {
    e.preventDefault()
    if (!title.trim()) return
    const next = {
      id: Date.now(),
      type: 'Update',
      color: 'blue',
      club: 'CS Club',
      time: 'Just now',
      title: title.trim(),
      description: desc.trim() || 'Posted from the ClubHub dashboard.',
      pinned: false,
      unread: true,
    }
    setList(prev => [next, ...prev])
    setTitle('')
    setDesc('')
    setComposing(false)
  }

  return (
    <Card className="p-[22px] flex flex-col" delay={4}>
      <div className="flex items-center justify-between mb-[18px]">
        <div className="flex items-center gap-2">
          <Megaphone size={16} className="text-[var(--red)]" />
          <h2 className="text-[16px] font-extrabold tracking-tight text-[var(--text)]">
            Announcements
          </h2>
          <span
            className="min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold font-mono-num
              flex items-center justify-center"
            style={{
              background: 'var(--red-light)',
              color: 'var(--red-ink)',
              border: '1px solid color-mix(in srgb, var(--red) 25%, transparent)',
            }}
          >
            {list.length}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setComposing(c => !c)}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11.5px] font-bold
            cursor-pointer border transition-colors"
          style={{
            background: composing ? 'var(--bg-subtle)' : 'var(--bg-surface)',
            color: 'var(--text-muted)',
            borderColor: 'var(--border)',
          }}
        >
          <Plus size={12} />
          {composing ? 'Cancel' : 'Post'}
        </button>
      </div>

      {composing && (
        <form
          onSubmit={handleAdd}
          className="mb-3.5 p-3 rounded-[var(--radius-sm)] bg-[var(--bg-surface)] border border-[var(--border)] flex flex-col gap-2"
        >
          <input
            type="text"
            placeholder="Announcement title…"
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)]
              text-xs text-[var(--text)] outline-none focus:border-[var(--blue)]"
          />
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Short details…"
              value={desc}
              onChange={e => setDesc(e.target.value)}
              className="flex-1 px-2.5 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border)]
                text-xs text-[var(--text)] outline-none focus:border-[var(--blue)]"
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg bg-[var(--blue)] text-white text-xs font-bold border-none cursor-pointer"
            >
              Publish
            </button>
          </div>
        </form>
      )}

      <div className="flex flex-col gap-3">
        {list.map(item => (
          <div
            key={item.id}
            className="group relative p-3.5 rounded-[var(--radius-sm)] bg-[var(--bg-card)]
              border border-[var(--border)] shadow-[var(--shadow-xs)]
              hover:border-[var(--border-strong)] hover:shadow-[var(--shadow)] transition-all duration-200"
            style={{
              borderLeftWidth: '3.5px',
              borderLeftColor: `var(--${item.color})`,
            }}
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2">
                <BubbleTag label={item.type} color={item.color} size="sm" />
                {item.club && (
                  <span className="text-[11px] font-semibold text-[var(--text-muted)]">
                    · {item.club}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-mono-num text-[var(--text-light)]">
                  {item.time}
                </span>
                <button
                  type="button"
                  onClick={() => togglePin(item.id)}
                  title={item.pinned ? 'Unpin' : 'Pin announcement'}
                  className={`p-1 rounded-md cursor-pointer border-none bg-transparent transition-opacity ${
                    item.pinned
                      ? 'opacity-100 text-[var(--blue-ink)]'
                      : 'opacity-0 group-hover:opacity-100 text-[var(--text-light)] hover:text-[var(--text)]'
                  }`}
                >
                  <Pin size={12} className={item.pinned ? 'fill-current' : ''} />
                </button>
              </div>
            </div>

            <p className="text-[13.5px] font-bold text-[var(--text)] leading-snug">
              {item.title}
            </p>
            <p className="text-[12px] text-[var(--text-muted)] mt-1 leading-relaxed">
              {item.description}
            </p>
          </div>
        ))}
      </div>
    </Card>
  )
}
