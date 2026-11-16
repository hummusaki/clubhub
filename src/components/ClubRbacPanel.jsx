import Select from './Select'
import { useState, useEffect, useCallback, useMemo, useId, useRef } from 'react'
import {
  Shield,
  Users,
  X,
  Plus,
  Trash2,
  Layers,
  Megaphone,
  ArrowRight,
  UserPlus,
} from 'lucide-react'
import { Card, BubbleTag, Avatar, SectionHeader, cleanText, Button, IconButton, FilterChip } from './ui'
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

const OTHER_ROLE = '__other_role__'
const roleFieldClass = 'ui-touch min-w-0 min-h-10 rounded-lg bg-[var(--bg-surface)] border border-[var(--md-outline)] text-base sm:text-sm text-[var(--text)]'

const GROUP_COLORS = ['blue', 'purple', 'teal', 'green', 'yellow', 'red']

export default function ClubRbacPanel({
  clubs = [],
  selectedClubId: externalClubId = '',
  initialSeatId = '',
  initialRoleTitle = '',
  onSelectClub,
  user = null,
  isDemo = false,
  onMembershipConfirmed,
  onOpenTasks,
  onRefreshAnnouncements,
  onNotify,
}) {
  const joinedClubs = useMemo(() => clubs.filter(c => c.joined), [clubs])
  const [internalClubId, setInternalClubId] = useState(
    () => externalClubId && externalClubId !== 'all' ? externalClubId : joinedClubs[0]?.id || clubs[0]?.id || ''
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
  const [roleChoice, setRoleChoice] = useState(() => initialSeatId || (initialRoleTitle ? OTHER_ROLE : ''))
  const [customRoleTitle, setCustomRoleTitle] = useState(() => initialRoleTitle || '')
  const [claimNotes, setClaimNotes] = useState('')
  const [busyAction, setBusyAction] = useState('')
  const [roleError, setRoleError] = useState('')
  const [submittedClaim, setSubmittedClaim] = useState(null)
  const writingClaim = useRef(false)
  const request = useRef(null)
  const fieldId = useId()

  useEffect(() => {
    setRoleChoice(initialSeatId || (initialRoleTitle ? OTHER_ROLE : ''))
    setCustomRoleTitle(initialRoleTitle || '')
    setClaimNotes('')
    setRoleError('')
  }, [activeClub?.id, initialSeatId, initialRoleTitle])

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
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    const res = await getClubPeopleAndGroups(activeClub.id, controller.signal)
    if (controller.signal.aborted) return
    setLoading(false)
    if (res.ok) setClubPeople(res)
    return res.ok
  }, [activeClub?.id])

  useEffect(() => {
    setClubPeople(null)
    refreshClubData()
    return () => request.current?.abort()
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

  const rosterPositions = useMemo(() => (clubPeople?.publicRoster || [])
    .filter(r => r.id && !r.isSyntheticContact && r.personType !== 'member')
    .map(r => ({
      rosterId: r.id,
      role: r.role || 'Officer',
      rosterName: r.name,
      claimed: Boolean(r.claimed),
      isClaimedByYou: Boolean(r.isClaimedByYou),
      isPublic: !r.isPrivate && (!r.visibility || r.visibility === 'public'),
    })), [clubPeople?.publicRoster])

  useEffect(() => {
    if (clubPeople && initialSeatId && roleChoice === initialSeatId &&
        !rosterPositions.some(position => position.rosterId === initialSeatId)) {
      setRoleChoice(initialRoleTitle ? OTHER_ROLE : '')
    }
  }, [clubPeople, initialSeatId, initialRoleTitle, roleChoice, rosterPositions])

  const myPendingClaim = (clubPeople?.pendingClaims || []).find(c => c.userId === user?.id)
    || (submittedClaim?.clubId === activeClub?.id ? submittedClaim : null)

  async function handleJoinClub() {
    if (!activeClub?.id || busyAction || loading) return
    if (isDemo || !user) {
      onNotify?.('Sign in with a verified account to join clubs & claim roster positions.', { type: 'error' })
      return
    }
    setBusyAction('join')
    const res = await joinWorkspaceClub(activeClub.id)
    setBusyAction('')
    if (res.ok) {
      onMembershipConfirmed?.(activeClub.id)
      onNotify?.(`Joined ${cleanText(activeClub.name)}!`)
      refreshClubData()
    } else {
      onNotify?.(res.error || 'Could not join club.', { type: 'error' })
    }
  }

  async function handleClaimSubmit(e) {
    e.preventDefault()
    if (!activeClub?.id || !user || isDemo || loading || writingClaim.current || busyAction || myPendingClaim || perm.isBoard) return
    const isCustom = roleChoice === OTHER_ROLE
    const seat = isCustom ? null : rosterPositions.find(p => p.rosterId === roleChoice)
    const roleToClaim = (isCustom ? customRoleTitle : seat?.role || '').trim()
    if (!roleToClaim || seat?.claimed) {
      setRoleError(isCustom ? 'Enter a role title.' : 'Choose an available officer role.')
      document.getElementById(`${fieldId}-${isCustom ? 'title' : 'role'}`)?.focus()
      return
    }

    writingClaim.current = true
    setRoleError('')
    setBusyAction('claim')
    try {
      const res = await claimClubRosterPosition(activeClub.id, {
        rosterId: seat?.rosterId || '',
        requestedRole: roleToClaim,
        rosterName: seat?.rosterName || user.fullName || '',
        notes: claimNotes.trim(),
      })
      if (!res.ok) {
        setRoleError(res.error || 'Could not request the role. Try again.')
        if (res.status === 409) await refreshClubData()
        return
      }

      onMembershipConfirmed?.(activeClub.id)
      setRoleChoice('')
      setCustomRoleTitle('')
      setClaimNotes('')
      if (res.clubPeople) setClubPeople(res.clubPeople)
      if (res.claimStatus !== 'approved') setSubmittedClaim({ clubId: activeClub.id, requestedRole: roleToClaim })
      onNotify?.(res.claimStatus === 'approved'
        ? `Role verified: ${roleToClaim}.`
        : `Requested ${roleToClaim}. Awaiting review.`,
      { type: res.claimStatus === 'approved' ? 'success' : 'info' })
      if (await refreshClubData()) setSubmittedClaim(null)
    } catch {
      setRoleError('Could not request the role. Try again.')
    } finally {
      writingClaim.current = false
      setBusyAction('')
    }
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
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 pb-4 border-b border-[var(--border)]">
        <SectionHeader
          icon={<Shield size={18} />}
          color="purple"
          title="Membership & roles"
        />

        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label="Select club for governance"
            value={activeClub.id}
            disabled={Boolean(busyAction)}
            onValueChange={nextValue => {
              setInternalClubId(nextValue)
              onSelectClub?.(nextValue)
            }}
            className="w-full sm:w-auto min-h-[40px] px-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] text-base sm:text-xs font-semibold text-[var(--text)]"
            search
            options={clubs.map(c => ({ value: c.id, label: cleanText(c.name) }))}
          />

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
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--border)] pb-3">
            <span className="text-sm font-medium">Membership</span>
            {(perm.isMember || activeClub.joined) ? (
              <span className="text-sm text-[var(--text-muted)]">Member</span>
            ) : user && !isDemo ? (
              <Button variant="outlined" size="sm" leadingIcon={<UserPlus size={14} />}
                disabled={loading || Boolean(busyAction && busyAction !== 'join')}
                pending={busyAction === 'join'} pendingLabel="Joining…" onClick={handleJoinClub}>
                Join club
              </Button>
            ) : null}
          </div>

          {!user || isDemo ? (
            <p className="text-sm text-[var(--text-muted)]">Sign in to join this club or request an officer role.</p>
          ) : perm.isBoard ? (
            <div className="space-y-2.5">
              <p className="text-sm">Your role: <strong>{perm.roleTitle || 'Officer'}</strong></p>
              <Button variant="outlined-neutral" size="sm" disabled={busyAction === 'revoke'} onClick={handleStepDown}>
                Release role
              </Button>
            </div>
          ) : myPendingClaim ? (
            <p role="status" className="text-sm text-[var(--text-muted)]">
              Awaiting review: <strong>{myPendingClaim.requestedRole}</strong>
            </p>
          ) : (
            <form onSubmit={handleClaimSubmit} className="grid gap-2.5 w-full min-w-0">
              <p className="text-sm text-[var(--text-muted)]">Role requests may be reviewed by club officers.</p>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <div className={roleChoice === OTHER_ROLE ? 'min-w-0' : 'min-w-0 sm:col-span-2'}>
                  <label className="block mb-1 text-sm font-medium" htmlFor={`${fieldId}-role`}>Officer role</label>
                  <Select
                    id={`${fieldId}-role`}
                    value={roleChoice}
                    onValueChange={value => { setRoleChoice(value); setRoleError('') }}
                    fullWidth
                    disabled={loading || Boolean(busyAction)}
                    aria-describedby={roleError ? `${fieldId}-error` : undefined}
                    placeholder="Choose a role…"
                    className={roleFieldClass}
                    options={[
                      ...rosterPositions.map(pos => ({
                        value: pos.rosterId,
                        label: cleanText(pos.role),
                        description: pos.isClaimedByYou ? 'Your role' : pos.claimed ? 'Claimed'
                          : pos.isPublic && pos.rosterName && rosterPositions.some(other => other !== pos && other.role === pos.role)
                            ? `Available · ${cleanText(pos.rosterName)}`
                            : 'Available',
                        disabled: pos.claimed || pos.isClaimedByYou,
                      })),
                      { value: OTHER_ROLE, label: 'Other role…' },
                    ]}
                  />
                </div>
                {roleChoice === OTHER_ROLE && (
                  <div className="min-w-0">
                    <label className="block mb-1 text-sm font-medium" htmlFor={`${fieldId}-title`}>Role title</label>
                    <input id={`${fieldId}-title`} type="text" value={customRoleTitle} maxLength={80}
                      onChange={e => { setCustomRoleTitle(e.target.value); setRoleError('') }}
                      disabled={Boolean(busyAction)} placeholder="e.g. Outreach Coordinator"
                      aria-describedby={roleError ? `${fieldId}-error` : undefined} className={`${roleFieldClass} w-full px-3`} />
                  </div>
                )}
              </div>
              <div className="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <div className="min-w-0">
                  <label className="block mb-1 text-sm font-medium" htmlFor={`${fieldId}-note`}>Verification note (optional)</label>
                  <input id={`${fieldId}-note`} type="text" value={claimNotes}
                    onChange={e => setClaimNotes(e.target.value)} disabled={Boolean(busyAction)}
                    className={`${roleFieldClass} w-full px-3`} />
                </div>
                <Button variant="filled" size="md" type="submit" disabled={(loading || Boolean(busyAction)) && busyAction !== 'claim'}
                  pending={busyAction === 'claim'} pendingLabel="Requesting…" className="h-10">
                  Request role
                </Button>
              </div>
              {roleError && <p role="alert" id={`${fieldId}-error`} className="text-sm text-[var(--red-ink)]">{roleError}</p>}
            </form>
          )}

          {/* Pending Claim Review Queue (Strictly Board Only) */}
          {perm.isBoard && (clubPeople?.pendingClaims || []).length > 0 && (
            <div className="pt-2.5 border-t border-[var(--border)] space-y-2">
              <div className="text-xs font-medium text-[var(--purple-ink)]">
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
                    <Button
                      variant="filled"
                      size="sm"
                      onClick={() => handleReviewClaim(cl.id, 'approve')}
                    >
                      Approve
                    </Button>
                    <Button
                      variant="danger-tonal"
                      size="sm"
                      onClick={() => handleReviewClaim(cl.id, 'reject')}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section 2: Club Sub-Groups ("Marketing", "Events", etc.) */}
        <div className="content-tile p-4 rounded-2xl space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)]">
              <Layers size={13} className="text-[var(--teal-ink)]" />
              <span>Club Sub-Groups ({clubPeople?.groups?.length || 0})</span>
            </div>
            {perm.isBoard && (
              <Button
                variant="tonal"
                size="sm"
                leadingIcon={showGroupForm ? <X size={12} /> : <Plus size={12} />}
                onClick={() => setShowGroupForm(v => !v)}
              >
                {showGroupForm ? 'Close' : 'New Sub-Group'}
              </Button>
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
                  className="min-h-[40px] px-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--md-outline)] text-base sm:text-xs text-[var(--text)] outline-none focus:border-[var(--blue)]"
                />
                <Select
                  value={groupColor}
                  onValueChange={setGroupColor}
                  aria-label="Sub-group color"
                  className="min-h-[40px] px-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--md-outline)] text-base sm:text-xs text-[var(--text)] outline-none focus:border-[var(--blue)]"
                  options={GROUP_COLORS.map(c => ({ value: c, label: String(c) }))}
                />
              </div>
              <input
                type="text"
                value={groupDesc}
                onChange={e => setGroupDesc(e.target.value)}
                placeholder="Optional purpose / channel description…"
                className="w-full min-h-[40px] px-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--md-outline)] text-base sm:text-xs text-[var(--text)] outline-none focus:border-[var(--blue)]"
              />
              {(clubPeople?.everyone || []).length > 0 && (
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                  {clubPeople.everyone.map(p => {
                    const checked = selectedGroupMemberKeys.includes(p.memberKey)
                    return (
                      <FilterChip
                        key={p.memberKey}
                        selected={checked}
                        onClick={() =>
                          setSelectedGroupMemberKeys(prev =>
                            checked ? prev.filter(k => k !== p.memberKey) : [...prev, p.memberKey]
                          )
                        }
                        label={p.name}
                      />
                    )
                  })}
                </div>
              )}
              <Button
                variant="filled"
                size="sm"
                type="submit"
                disabled={busyAction === 'create_group'}
              >
                Create Sub-Group
              </Button>
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
                      <Select
                        value={addingMemberByGroup[grp.id] || ''}
                        onValueChange={nextValue => setAddingMemberByGroup(prev => ({ ...prev, [grp.id]: nextValue }))}
                        aria-label={`Assign club member to ${grp.name}`}
                        className="flex-1 min-h-[38px] px-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] text-base sm:text-xs text-[var(--text)]"
                        search
                        options={[
                          { value: "", label: `Assign club member to ${grp.name}…` },
                          ...clubPeople.everyone
                            .filter(person => !(grp.members || []).some(member => member.memberKey === person.memberKey))
                            .map(person => ({ value: person.memberKey, label: `${person.name} (${person.roleTitle})` })),
                        ]}
                      />
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
