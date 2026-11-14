// ── Sample data for the ClubHub dashboard ──

export const clubs = [
  {
    id: 1,
    name: 'Computer Science Club',
    abbr: 'CS',
    members: 128,
    category: 'academic',
    tags: [
      { label: 'Tech', color: 'blue' },
      { label: 'Coding', color: 'purple' },
    ],
    schedule: 'Tuesdays 2 PM',
    gradient: 'from-[var(--blue)] to-[#5B8DEF]',
    avatarBg: 'linear-gradient(135deg, var(--blue), #5B8DEF)',
    active: true,
  },
  {
    id: 2,
    name: 'Debate Society',
    abbr: 'DS',
    members: 64,
    category: 'social',
    tags: [
      { label: 'Speech', color: 'red' },
      { label: 'Social', color: 'yellow' },
    ],
    schedule: 'Thursdays 4:30 PM',
    avatarBg: 'linear-gradient(135deg, var(--red), #D46B6B)',
    active: true,
  },
  {
    id: 3,
    name: 'Art Collective',
    abbr: 'AC',
    members: 45,
    category: 'arts',
    tags: [
      { label: 'Visual Arts', color: 'purple' },
      { label: 'Studio', color: 'teal' },
    ],
    schedule: 'Sundays 1 PM',
    avatarBg: 'linear-gradient(135deg, var(--purple), #9575CD)',
    active: true,
  },
  {
    id: 4,
    name: 'Econ Society',
    abbr: 'EC',
    members: 89,
    category: 'academic',
    tags: [
      { label: 'Finance', color: 'green' },
      { label: 'Academic', color: 'blue' },
    ],
    schedule: 'Wednesdays 5 PM',
    avatarBg: 'linear-gradient(135deg, var(--green), #66BB6A)',
    active: true,
  },
  {
    id: 5,
    name: 'A Cappella Group',
    abbr: '🎵',
    members: 22,
    category: 'social',
    tags: [
      { label: 'Music', color: 'yellow' },
      { label: 'Performance', color: 'red' },
    ],
    schedule: 'M/W/F 6 PM',
    avatarBg: 'linear-gradient(135deg, var(--yellow), #F0B93B)',
    active: true,
  },
]

export const todaySchedule = [
  {
    id: 1,
    club: 'CS Club',
    event: 'Weekly Standup',
    time: '2:00 PM',
    location: 'Engineering Hall 204',
    duration: '45 min',
    color: 'blue',
    upcoming: false,
  },
  {
    id: 2,
    club: 'Debate Society',
    event: 'Practice',
    time: '4:30 PM',
    location: 'Humanities Building 110',
    duration: '1 hr',
    color: 'green',
    upcoming: false,
  },
  {
    id: 3,
    club: 'Art Collective',
    event: 'Studio Session',
    time: 'Tomorrow',
    location: 'Arts Center 3B',
    duration: '2 hrs',
    color: 'muted',
    upcoming: true,
  },
]

export const announcements = [
  {
    id: 1,
    type: 'Urgent',
    color: 'red',
    time: '2h ago',
    title: 'Room change for CS Club meeting',
    description: 'Moved from EH 302 → EH 204. Same time!',
  },
  {
    id: 2,
    type: 'Event',
    color: 'yellow',
    time: '5h ago',
    title: 'Hackathon sign-ups are live!',
    description: 'Teams of 4 · Nov 22-23 · Register by Nov 18',
  },
  {
    id: 3,
    type: 'Update',
    color: 'green',
    time: '1d ago',
    title: 'New club approved: Robotics League',
    description: 'Interest meeting next Monday at 5 PM',
  },
]

export const boardMembers = [
  { id: 1, name: 'Alex Lee',       initials: 'AL', role: 'President',    color: 'blue',   email: 'alee@uni.edu' },
  { id: 2, name: 'Maya Rodriguez', initials: 'MR', role: 'VP',           color: 'green',  email: 'mrod@uni.edu' },
  { id: 3, name: 'Sam Kim',        initials: 'SK', role: 'Treasurer',    color: 'purple', email: 'skim@uni.edu' },
  { id: 4, name: 'Tara Patel',     initials: 'TP', role: 'Secretary',    color: 'yellow', email: 'tpatel@uni.edu' },
  { id: 5, name: 'Jamie Chen',     initials: 'JC', role: 'Social Chair', color: 'teal',   email: 'jchen@uni.edu' },
]

export const links = [
  { id: 1, title: 'CS Club Constitution', subtitle: 'Google Docs · Updated Oct 28',    color: 'blue',   icon: 'FileText' },
  { id: 2, title: 'Budget Spreadsheet',   subtitle: 'Google Sheets · Updated Nov 10',  color: 'green',  icon: 'Table' },
  { id: 3, title: 'Discord Server',       subtitle: 'discord.gg/csclub · 312 online',  color: 'purple', icon: 'MessageCircle' },
  { id: 4, title: 'Workshop Recordings',  subtitle: 'YouTube · 18 videos',             color: 'yellow', icon: 'PlayCircle' },
  { id: 5, title: 'Hackathon Registration', subtitle: 'Google Forms · Closes Nov 18',  color: 'red',    icon: 'CheckCircle' },
]

export const memberActivity = [
  {
    id: 1, name: 'Emily Richards', initials: 'ER', email: 'erich@uni.edu',
    avatarBg: 'linear-gradient(135deg, var(--blue), var(--purple))',
    clubs: [{ label: 'CS', color: 'blue' }, { label: 'Art', color: 'purple' }],
    attendance: 92, attendanceColor: 'var(--green)',
    joined: 'Sep 2025', status: 'Active', statusColor: 'green',
  },
  {
    id: 2, name: 'David Wang', initials: 'DW', email: 'dwang@uni.edu',
    avatarBg: 'linear-gradient(135deg, var(--green), var(--teal))',
    clubs: [{ label: 'CS', color: 'blue' }, { label: 'Debate', color: 'red' }, { label: 'Econ', color: 'green' }],
    attendance: 78, attendanceColor: 'var(--blue)',
    joined: 'Aug 2024', status: 'Active', statusColor: 'green',
  },
  {
    id: 3, name: 'Sofia Johnson', initials: 'SJ', email: 'sjohn@uni.edu',
    avatarBg: 'linear-gradient(135deg, var(--yellow), var(--red))',
    clubs: [{ label: 'Music', color: 'yellow' }, { label: 'Art', color: 'purple' }],
    attendance: 65, attendanceColor: 'var(--yellow)',
    joined: 'Jan 2026', status: 'Moderate', statusColor: 'yellow',
  },
  {
    id: 4, name: 'Raj Nair', initials: 'RN', email: 'rnair@uni.edu',
    avatarBg: 'linear-gradient(135deg, var(--teal), var(--blue))',
    clubs: [{ label: 'CS', color: 'blue' }],
    attendance: 100, attendanceColor: 'linear-gradient(90deg, var(--green), var(--teal))',
    joined: 'Sep 2023', status: 'Active', statusColor: 'green',
  },
]

export const stats = [
  { label: 'Active Clubs',    value: 42, color: 'blue',   icon: 'Users' },
  { label: 'Your Clubs',      value: 5,  color: 'green',  icon: 'Heart' },
  { label: 'Upcoming Events', value: 8,  color: 'yellow', icon: 'Calendar' },
  { label: 'Shared Links',    value: 24, color: 'purple', icon: 'Link' },
]

export const navItems = [
  { id: 'overview', label: 'Overview',          icon: 'LayoutGrid' },
  { id: 'myclubs',  label: 'My Clubs',          icon: 'Heart' },
  { id: 'discover', label: 'Discover',          icon: 'Search' },
  { id: 'calendar', label: 'Calendar',          icon: 'Calendar' },
  { id: 'members',  label: 'Members',           icon: 'Users' },
  { id: 'links',    label: 'Links & Resources', icon: 'Link' },
]
