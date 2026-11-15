import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Shield,
  Users,
  Check,
  X,
  Plus,
  Trash2,
  Lock,
  Layers,
  Megaphone,
  ArrowRight,
  UserPlus,
} from 'lucide-react'
import { Card, BubbleTag, Avatar, SectionHeader, cleanText } from './ui'
import {
  getClubPeopleAndGroups,
  joinWorkspaceClub,
  claimClubRosterPosition,
  reviewClubRosterClaim,
  revokeClubRosterClaim,
  assignClubMemberRole,
  createClubGroup,
  updateClubGroup,
  deleteClubGroup,
  onWorkspacePermissionChange,
} from '../api/workspaceClient'
import TargetedAnnouncementModal from './TargetedAnnouncementModal'

const STANDARD_ROSTER_SEATS = [
  { id: 'seat_president', role: 'President' },
  { id: 'seat_vp', role: 'Vice President' },
  { id: 'seat_treasurer', role: 'Treasurer' },
  { id: 'seat_secretary', role: 'Secretary' },
  { id: 'seat_events', role: 'Events Lead' },
  { id: 'seat_marketing', role: 'Marketing Lead' },
]

const GROUP_COLORS = ['blue', 'purple', 'teal', 'green', 'yellow', 'red']

export default function ClubRbacPanel({
  clubs = [],
  selectedClubId: externalClubId = '',
  initialSeatId = '',
  initialRoleTitle = '',
  onSelectClub,
  user = null,
  isDemo = false,
  onToggleJoin,
  onOpenTasks,
  onRefreshAnnouncements,
  onNotify,
}) {
  const joinedClubs = useMemo(() => clubs.filter(c => c.joined), [clubs])
  const [internalClubId, setInternalClubId] = useState(
    () => externalClubId || joinedClubs[0]?.id || clubs[0]?.id || ''
  )

  const activeClubId = externalClubId && externalClubId !== 'all' ? externalClubId : internalClubId
  const activeClub = useMemo(
    () => clubs.find(c => String(c.id) === String(activeClubId)) || clubs[0] || null,
    [clubs, activeClubId]
  )

  useEffect(() => {
    if (externalClubId && externalClubId !== 'all') {
      setInternalClubId(externalClubId)
    } else if (!activeClubId && (joinedClubs[0]?.id || clubs[0]?.id)) {
      setInternalClubId(String(joinedClubs[0]?.id || clubs[0]?.id))
    }
  }, [externalClubId, activeClubId, joinedClubs, clubs])

  const [clubPeople, setClubPeople] = useState(null)
  const [loading, setLoading] = useState(false)
  const [selectedSeatId, setSelectedSeatId] = useState(() => initialSeatId || '')
  const [customRoleTitle, setCustomRoleTitle] = useState(() => initialRoleTitle || '')
  const [claimNotes, setClaimNotes] = useState('')
  const [busyAction, setBusyAction] = useState('')

  useEffect(() => {
    if (initialSeatId) setSelectedSeatId(initialSeatId)
    if (initialRoleTitle) setCustomRoleTitle(initialRoleTitle)
  }, [initialSeatId, initialRoleTitle])

  // Sub-Group creation & member management state
  const [showGroupForm, setShowGroupForm] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [groupColor, setGroupColor] = useState('teal')
  const [groupDesc, setGroupDesc] = useState('')
  const [selectedGroupMemberKeys, setSelectedGroupMemberKeys] = useState([])
  const [addingMemberByGroup, setAddingMemberByGroup] = useState({})
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false)

  const refreshClubData = useCallback(async () => {
    if (!activeClub?.id) return
    setLoading(true)
    const res = await getClubPeopleAndGroups(activeClub.id)
    setLoading(false)
    if (res.ok) {
      setClubPeople(res)
    }
  }, [activeClub?.id])

  useEffect(() => {
    refreshClubData()
  }, [refreshClubData])

  // Re-sync live permissions immediately if board rights are revoked mid-session
  useEffect(() => {
    return onWorkspacePermissionChange(() => {
      refreshClubData()
    })
  }, [refreshClubData])

  const perm = clubPeople?.permission || {
    tier: 'none',
    isMember: false,
    isBoard: false,
    isPresident: false,
    roleTitle: '',
    claimedRosterId: null,
  }

  const rosterPositions = useMemo(() => {
    const pub = (clubPeople?.publicRoster || []).filter(r => !r.isSyntheticContact && r.personType !== 'member')
    if (pub.length > 0) {
      return pub.map(r => ({
        rosterId: r.id,
        label: `${r.role || 'Officer'} — ${r.name}`,
        role: r.role || 'Officer',
        rosterName: r.name,
        claimed: Boolean(r.claimed),
        claimedByName: r.claimedByName || null,
        isClaimedByYou: Boolean(r.isClaimedByYou),
      }))
    }
    const boardClaimsByRosterId = new Map()
    for (const b of clubPeople?.board || []) {
      if (b.rosterId) boardClaimsByRosterId.set(String(b.rosterId).toLowerCase(), b)
    }
    return STANDARD_ROSTER_SEATS.map(s => {
      const rid = `${activeClub?.id || 'club'}_${s.id}`.toLowerCase()
      const holder = boardClaimsByRosterId.get(rid) || null
      return {
        rosterId: rid,
        label: s.role,
        role: s.role,
        rosterName: user?.fullName || '',
        claimed: Boolean(holder),
        claimedByName: holder?.name || null,
        isClaimedByYou: Boolean(holder?.isYou),
      }
    })
  }, [clubPeople, activeClub?.id, user?.fullName])

  const myPendingClaim = useMemo(
    () => (clubPeople?.pendingClaims || []).find(c => c.userId === user?.id) || null,
    [clubPeople?.pendingClaims, user?.id]
  )

  async function handleJoinClub() {
    if (!activeClub?.id) return
    if (isDemo || !user) {
      onNotify?.('Sign in with a verified account to join clubs & claim roster positions.', { type: 'error' })
      return
    }
    setBusyAction('join')
    const res = await joinWorkspaceClub(activeClub.id)
    setBusyAction('')
    if (res.ok) {
      if (!activeClub.joined && onToggleJoin) onToggleJoin(activeClub.id)
      onNotify?.(`Joined ${cleanText(activeClub.name)}!`)
      refreshClubData()
    } else {
      onNotify?.(res.error || 'Could not join club.', { type: 'error' })
    }
  }

  async function handleClaimSubmit(e) {
    e.preventDefault()
    if (!activeClub?.id || !user || isDemo) {
      onNotify?.('Sign in with your account to claim a roster position.', { type: 'error' })
      return
    }
    const seat = rosterPositions.find(p => p.rosterId === selectedSeatId)
    if (seat?.claimed && !seat.isClaimedByYou) {
      onNotify?.('That position is already occupied by a verified officer.', { type: 'error' })
      return
    }
    const roleToClaim = (customRoleTitle.trim() || seat?.role || '').trim()
    if (!roleToClaim) {
      onNotify?.('Select an unclaimed roster position or enter a role title.', { type: 'error' })
      return
    }

    setBusyAction('claim')
    const res = await claimClubRosterPosition(activeClub.id, {
      rosterId: seat?.rosterId || '',
      requestedRole: roleToClaim,
      rosterName: seat?.rosterName || user.fullName || '',
      notes: claimNotes.trim(),
    })
    setBusyAction('')

    if (!res.ok) {
      onNotify?.(res.error || 'Could not claim position.', { type: 'error' })
      refreshClubData()
      return
    }

    if (!activeClub.joined && onToggleJoin) onToggleJoin(activeClub.id)
    setCustomRoleTitle('')
    setClaimNotes('')
    setClubPeople(res.clubPeople || clubPeople)
    onNotify?.(
      res.claimStatus === 'approved'
        ? `Claimed "${roleToClaim}" — Board permissions unlocked!`
        : `Submitted claim for "${roleToClaim}" — awaiting Board approval.`,
      { type: res.claimStatus === 'approved' ? 'success' : 'info' }
    )
    refreshClubData()
  }

  async function handleReviewClaim(claimId, decision) {
    if (!activeClub?.id) return
    setBusyAction(`review_${claimId}`)
    const res = await reviewClubRosterClaim(activeClub.id, claimId, decision)
    setBusyAction('')
    if (!res.ok) {
      onNotify?.(res.error || 'Could not review claim.', { type: 'error' })
      refreshClubData()
      return
    }
    setClubPeople(res.clubPeople)
    onNotify?.(decision === 'approve' ? 'Approved board roster claim!' : 'Rejected roster claim.')
  }

  async function handleStepDown() {
    if (!activeClub?.id) return
    setBusyAction('revoke')
    const statusRes = await getClubPeopleAndGroups(activeClub.id)
    const targetClaimId =
      clubPeople?.myActiveClaim?.id ||
      myPendingClaim?.id ||
      statusRes?.myActiveClaim?.id ||
      statusRes?.pendingClaims?.find(c => c.userId === user?.id)?.id
    if (targetClaimId) {
      await revokeClubRosterClaim(activeClub.id, targetClaimId)
    } else if (perm.claimedRosterId || perm.isBoard) {
      await assignClubMemberRole(activeClub.id, {
        userId: user?.id,
        tier: 'member',
        roleTitle: 'Member',
      })
    }
    setBusyAction('')
    onNotify?.('Stepped down to Regular Member.', { type: 'info' })
    refreshClubData()
  }

  async function handleCreateGroup(e) {
    e.preventDefault()
    if (!groupName.trim() || !activeClub?.id) return
    const allPeople = clubPeople?.everyone || []
    const chosenMembers = allPeople.filter(p => selectedGroupMemberKeys.includes(p.memberKey))

    setBusyAction('create_group')
    const res = await createClubGroup(activeClub.id, {
      name: groupName.trim(),
      color: groupColor,
      description: groupDesc.trim(),
      members: chosenMembers,
    })
    setBusyAction('')

    if (!res.ok) {
      onNotify?.(res.error || 'Could not create sub-group.', { type: 'error' })
      return
    }
    setGroupName('')
    setGroupDesc('')
    setSelectedGroupMemberKeys([])
    setShowGroupForm(false)
    setClubPeople(res.clubPeople)
    onNotify?.(`Created "${res.group?.name || groupName}" sub-group!`)
  }

  async function handleAddMemberToGroup(groupId) {
    const memberKey = addingMemberByGroup[groupId]
    if (!memberKey || !activeClub?.id) return
    const person = (clubPeople?.everyone || []).find(p => p.memberKey === memberKey)
    if (!person) return
    const res = await updateClubGroup(activeClub.id, groupId, { addMembers: [person] })
    if (res.ok) {
      setClubPeople(res.clubPeople)
      setAddingMemberByGroup(prev => ({ ...prev, [groupId]: '' }))
      onNotify?.(`Added ${person.name} to sub-group.`)
    } else {
      onNotify?.(res.error || 'Failed to add member.', { type: 'error' })
    }
  }

  async function handleRemoveMemberFromGroup(groupId, memberKey) {
    if (!activeClub?.id) return
    const res = await updateClubGroup(activeClub.id, groupId, { removeMemberKeys: [memberKey] })
    if (res.ok) {
      setClubPeople(res.clubPeople)
      onNotify?.('Removed member from sub-group.', { type: 'info' })
    }
  }

  async function handleDeleteGroup(groupId, name) {
    if (!activeClub?.id) return
    const res = await deleteClubGroup(activeClub.id, groupId)
    if (res.ok) {
      setClubPeople(res.clubPeople)
      onNotify?.(`Deleted sub-group "${name}".`, { type: 'info' })
    } else {
      onNotify?.(res.error || 'Could not delete group.', { type: 'error' })
    }
  }

  if (!activeClub) return null

  return (
    <Card animate={false} className="p-4 sm:p-6 space-y-5 border border-[var(--border)]">
      {/* Header: Club Selector + Live Two-Tier RBAC Badge */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 pb-4 border-b border-[var(--border)]">
        <SectionHeader
          icon={<Shield size={18} />}
          color="purple"
          title="Club Governance, Roster Claims & Sub-Groups"
          subtitle="Manage verified officer seats, committee sub-groups, and targeted broadcasts"
          badge={
            <BubbleTag
              label={
                perm.isBoard
                  ? `Board · ${perm.roleTitle || 'Officer'}`
                  : perm.isMember
                    ? 'Regular Member'
                    : 'Not Joined'
              }
              color={perm.isBoard ? 'purple' : perm.isMember ? 'green' : 'blue'}
              size="sm"
            />
          }
        />

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Select club for governance"
            value={activeClub.id}
            onChange={e => {
              setInternalClubId(e.target.value)
              onSelectClub?.(e.target.value)
            }}
            className="w-full sm:w-auto min-h-[40px] px-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] text-base sm:text-xs font-semibold text-[var(--text)]"
          >
            {clubs.map(c => (
              <option key={c.id} value={c.id}>
                {cleanText(c.name)}
              </option>
            ))}
          </select>

          {perm.isBoard && (
            <button
              type="button"
              onClick={() => setShowAnnouncementModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 min-h-[40px] rounded-xl bg-[var(--purple-light)] text-[var(--purple-ink)] text-xs font-semibold border border-[var(--purple)]/25 cursor-pointer hover:opacity-90 transition-opacity"
            >
              <Megaphone size={13} />
              <span>Announce</span>
            </button>
          )}

          {onOpenTasks && (perm.isMember || perm.isBoard || activeClub?.joined) && (
            <button
              type="button"
              onClick={() => onOpenTasks(activeClub.id)}
              className="inline-flex items-center gap-1.5 px-3.5 min-h-[40px] rounded-xl bg-[var(--blue-light)] text-[var(--blue-ink)] text-xs font-semibold border border-[var(--blue)]/25 cursor-pointer hover:opacity-90 transition-opacity"
            >
              <span>Task Board</span>
              <ArrowRight size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Section 1: Membership & Roster Position Claiming */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="content-tile p-4 rounded-2xl space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
              Account &amp; Roster Position Claiming
            </div>
            {!perm.isMember && !isDemo && user && (
              <button
                type="button"
                disabled={busyAction === 'join'}
                onClick={handleJoinClub}
                className="inline-flex items-center gap-1.5 px-3 min-h-[36px] rounded-xl bg-[var(--blue)] text-white text-xs font-semibold border-none cursor-pointer hover:opacity-90"
              >
                <UserPlus size={13} />
                <span>Join as Member</span>
              </button>
            )}
          </div>

          {!user || isDemo ? (
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              Sign in with your account to join <strong>{cleanText(activeClub.name)}</strong>, claim an unclaimed officer seat, or join sub-groups.
            </p>
          ) : perm.isBoard ? (
            <div className="space-y-2.5">
              <div className="text-xs text-[var(--text)] leading-relaxed">
                You hold the verified <strong>{perm.roleTitle}</strong> seat with elevated <strong>Board / Leadership</strong> permissions.
              </div>
              <button
                type="button"
                disabled={busyAction === 'revoke'}
                onClick={handleStepDown}
                className="px-3 min-h-[36px] rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--red-ink)] hover:border-[var(--red)]/40 cursor-pointer transition-colors"
              >
                Release Claimed Position
              </button>
            </div>
          ) : (
            <form onSubmit={handleClaimSubmit} className="space-y-2.5">
              {myPendingClaim && (
                <div className="text-xs px-3 py-2 rounded-xl bg-[var(--yellow-light)] border border-[var(--yellow)]/30 text-[var(--yellow-ink)] font-medium">
                  Pending Board verification for <strong>{myPendingClaim.requestedRole}</strong>.
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <select
                  value={selectedSeatId}
                  onChange={e => setSelectedSeatId(e.target.value)}
                  className="min-h-[40px] px-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] text-base sm:text-xs text-[var(--text)]"
                >
                  <option value="">Select roster seat…</option>
                  {rosterPositions.map(pos => (
                    <option key={pos.rosterId} value={pos.rosterId} disabled={pos.claimed && !pos.isClaimedByYou}>
                      {pos.label} {pos.claimed ? `(Claimed${pos.claimedByName ? ` by ${pos.claimedByName}` : ''})` : '(Unclaimed)'}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={customRoleTitle}
                  onChange={e => setCustomRoleTitle(e.target.value)}
                  placeholder="Or custom officer title…"
                  className="min-h-[40px] px-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] text-base sm:text-xs text-[var(--text)]"
                />
              </div>
              <div className="flex flex-col xs:flex-row items-stretch xs:items-center gap-2">
                <input
                  type="text"
                  value={claimNotes}
                  onChange={e => setClaimNotes(e.target.value)}
                  placeholder="Optional verification note for Board…"
                  className="flex-1 min-h-[40px] px-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] text-base sm:text-xs text-[var(--text)]"
                />
                <button
                  type="submit"
                  disabled={busyAction === 'claim' || loading}
                  className="px-4 min-h-[40px] rounded-xl bg-[var(--blue)] text-white text-xs font-semibold border-none cursor-pointer hover:opacity-90 disabled:opacity-50 shrink-0"
                >
                  {busyAction === 'claim' ? 'Claiming…' : 'Claim Seat'}
                </button>
              </div>
            </form>
          )}

          {/* Occupied vs Unclaimed Roster Pills */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {rosterPositions.slice(0, 6).map(pos => (
              <span
                key={pos.rosterId}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] border ${
                  pos.claimed
                    ? 'bg-[var(--bg-surface)] border-[var(--border)] text-[var(--text-muted)]'
                    : 'bg-[var(--green-light)] border-[var(--green)]/30 text-[var(--green-ink)] font-semibold'
                }`}
              >
                {pos.claimed ? <Lock size={10} /> : <Check size={10} />}
                <span>{pos.role}</span>
                {pos.claimedByName && <span className="opacity-75">· {pos.claimedByName}</span>}
              </span>
            ))}
          </div>

          {/* Pending Claim Review Queue (Strictly Board Only) */}
          {perm.isBoard && (clubPeople?.pendingClaims || []).length > 0 && (
            <div className="pt-2.5 border-t border-[var(--border)] space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--purple-ink)]">
                Pending Claim Approvals ({clubPeople.pendingClaims.length})
              </div>
              {clubPeople.pendingClaims.map(cl => (
                <div
                  key={cl.id}
                  className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] text-xs"
                >
                  <div className="min-w-0">
                    <span className="font-semibold text-[var(--text)]">{cl.claimerName}</span>
                    <span className="text-[var(--text-muted)]"> → {cl.requestedRole}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleReviewClaim(cl.id, 'approve')}
                      className="px-2.5 min-h-[32px] rounded-lg bg-[var(--green)] text-white text-[11px] font-semibold border-none cursor-pointer"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReviewClaim(cl.id, 'reject')}
                      className="px-2.5 min-h-[32px] rounded-lg bg-[var(--red-light)] text-[var(--red-ink)] text-[11px] font-semibold border-none cursor-pointer"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section 2: Club Sub-Groups ("Marketing", "Events", etc.) */}
        <div className="content-tile p-4 rounded-2xl space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
              <Layers size={13} className="text-[var(--teal-ink)]" />
              <span>Club Sub-Groups ({clubPeople?.groups?.length || 0})</span>
            </div>
            {perm.isBoard && (
              <button
                type="button"
                onClick={() => setShowGroupForm(v => !v)}
                className="inline-flex items-center gap-1 px-3 min-h-[36px] rounded-xl bg-[var(--teal)] text-white text-xs font-semibold border-none cursor-pointer hover:opacity-90"
              >
                {showGroupForm ? <X size={12} /> : <Plus size={12} />}
                <span>{showGroupForm ? 'Close' : 'New Sub-Group'}</span>
              </button>
            )}
          </div>

          {perm.isBoard && showGroupForm && (
            <form onSubmit={handleCreateGroup} className="p-3.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] space-y-2.5">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                <input
                  type="text"
                  value={groupName}
                  onChange={e => setGroupName(e.target.value)}
                  placeholder="Sub-group name (e.g., Marketing, Events)"
                  className="min-h-[40px] px-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] text-base sm:text-xs text-[var(--text)]"
                />
                <select
                  value={groupColor}
                  onChange={e => setGroupColor(e.target.value)}
                  aria-label="Sub-group color"
                  className="min-h-[40px] px-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] text-base sm:text-xs text-[var(--text)]"
                >
                  {GROUP_COLORS.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <input
                type="text"
                value={groupDesc}
                onChange={e => setGroupDesc(e.target.value)}
                placeholder="Optional purpose / channel description…"
                className="w-full min-h-[40px] px-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] text-base sm:text-xs text-[var(--text)]"
              />
              {(clubPeople?.everyone || []).length > 0 && (
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                  {clubPeople.everyone.map(p => {
                    const checked = selectedGroupMemberKeys.includes(p.memberKey)
                    return (
                      <button
                        key={p.memberKey}
                        type="button"
                        onClick={() =>
                          setSelectedGroupMemberKeys(prev =>
                            checked ? prev.filter(k => k !== p.memberKey) : [...prev, p.memberKey]
                          )
                        }
                        className={`px-2.5 min-h-[30px] rounded-lg text-[11px] font-medium border cursor-pointer transition-colors ${
                          checked
                            ? 'bg-[var(--teal)] text-white border-[var(--teal)]'
                            : 'bg-[var(--bg-surface)] text-[var(--text)] border-[var(--border)] hover:border-[var(--teal)]'
                        }`}
                      >
                        {p.name}
                      </button>
                    )
                  })}
                </div>
              )}
              <button
                type="submit"
                disabled={busyAction === 'create_group'}
                className="px-4 min-h-[38px] rounded-xl bg-[var(--blue)] text-white text-xs font-semibold border-none cursor-pointer hover:opacity-90"
              >
                Create Sub-Group
              </button>
            </form>
          )}

          {(clubPeople?.groups || []).length === 0 ? (
            <p className="text-xs text-[var(--text-muted)] leading-relaxed">
              No custom sub-groups yet. {perm.isBoard ? 'Create groups like "Marketing" or "Events" to target polls, announcements, and tasks.' : 'Board leaders can organize committees & teams here.'}
            </p>
          ) : (
            <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
              {clubPeople.groups.map(grp => (
                <div
                  key={grp.id}
                  className="p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border)] space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                      <BubbleTag label={grp.name} color={grp.color || 'teal'} size="sm" />
                      {grp.isMyGroup && <BubbleTag label="Your Group" color="green" size="sm" />}
                      <span className="text-[11px] text-[var(--text-muted)]">
                        {grp.memberCount} {grp.memberCount === 1 ? 'member' : 'members'}
                      </span>
                    </div>
                    {perm.isBoard && (
                      <button
                        type="button"
                        onClick={() => handleDeleteGroup(grp.id, grp.name)}
                        title="Delete sub-group"
                        aria-label={`Delete sub-group ${grp.name}`}
                        className="w-7 h-7 rounded-lg bg-transparent hover:bg-[var(--red-light)] text-[var(--text-light)] hover:text-[var(--red-ink)] border-none flex items-center justify-center cursor-pointer transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {(grp.members || []).map(m => (
                      <span
                        key={m.memberKey}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--bg-surface)] border border-[var(--border)] text-[11px] text-[var(--text)]"
                      >
                        <Avatar initials={m.initials} size={16} />
                        <span>{m.name}</span>
                        {perm.isBoard && (
                          <button
                            type="button"
                            onClick={() => handleRemoveMemberFromGroup(grp.id, m.memberKey)}
                            aria-label={`Remove ${m.name} from ${grp.name}`}
                            className="w-4 h-4 rounded-full bg-transparent border-none text-[var(--text-light)] hover:text-[var(--red-ink)] flex items-center justify-center cursor-pointer p-0"
                          >
                            <X size={11} />
                          </button>
                        )}
                      </span>
                    ))}
                  </div>

                  {perm.isBoard && (clubPeople?.everyone || []).length > 0 && (
                    <div className="flex items-center gap-2">
                      <select
                        value={addingMemberByGroup[grp.id] || ''}
                        onChange={e =>
                          setAddingMemberByGroup(prev => ({ ...prev, [grp.id]: e.target.value }))
                        }
                        aria-label={`Assign club member to ${grp.name}`}
                        className="flex-1 min-h-[38px] px-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] text-base sm:text-xs text-[var(--text)]"
                      >
                        <option value="">Assign club member to {grp.name}…</option>
                        {clubPeople.everyone
                          .filter(p => !(grp.members || []).some(gm => gm.memberKey === p.memberKey))
                          .map(p => (
                            <option key={p.memberKey} value={p.memberKey}>
                              {p.name} ({p.roleTitle})
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => handleAddMemberToGroup(grp.id)}
                        className="px-3.5 min-h-[38px] rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] hover:border-[var(--teal)] text-xs font-semibold text-[var(--text)] cursor-pointer shrink-0"
                      >
                        Add
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showAnnouncementModal && perm.isBoard && (
        <TargetedAnnouncementModal
          clubId={activeClub.id}
          clubName={cleanText(activeClub.name)}
          clubPeople={clubPeople}
          onClose={() => setShowAnnouncementModal(false)}
          onCreated={() => onRefreshAnnouncements?.()}
          onNotify={onNotify}
        />
      )}
    </Card>
  )
}
