import { useId, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Award,
  CircleAlert,
  Coins,
  Crown,
  MapPin,
  Medal,
  Radio,
  RefreshCw,
  Search,
  Trophy,
  UserRound,
  Users
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/Skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/cn'
import { LeaderboardAPI } from '@/lib/api/leaderboard'
import type { Leaderboard as LeaderboardData, LeaderboardEntry, LeaderboardType } from '@/lib/api/leaderboard'

interface BoardOption {
  type: LeaderboardType
  /** Label of the tab that selects the board. */
  label: string
  icon: LucideIcon
  /** Shown when the API returns no rows for the board. */
  emptyHint: string
}

const BOARDS: BoardOption[] = [
  { type: 'laces', label: 'LACES', icon: Coins, emptyHint: 'There are no active members to rank yet.' },
  { type: 'posts', label: 'Signals', icon: Radio, emptyHint: 'No one has posted a public signal yet.' },
  { type: 'checkins', label: 'Check-ins', icon: MapPin, emptyHint: 'No one has checked in at a drop zone yet.' }
]

/** How many members to ask the API for (it accepts 1 to 50). */
const LIMITS = [10, 25, 50] as const

const LEADERBOARD_KEY = ['leaderboard'] as const

const numberFormat = new Intl.NumberFormat('en-US')

function boardOption(type: LeaderboardType): BoardOption {
  return BOARDS.find((board) => board.type === type) ?? BOARDS[0]
}

function isBoardType(value: string): value is LeaderboardType {
  return BOARDS.some((board) => board.type === value)
}

/**
 * Where the signed-in user stands on the board. `settled` is false while the rows on
 * screen are still those of a shorter list, when "not in the list" proves nothing yet.
 */
function standingMessage(board: LeaderboardData, limit: number, settled: boolean): string | null {
  const own = board.items.find((entry) => entry.isCurrentUser)
  if (own) return `Your rank: #${own.rank}`
  if (!settled) return null
  return board.items.length >= limit ? `You are outside the top ${limit}` : 'You are not on this board yet'
}

function RankMark({ rank }: { rank: number }) {
  if (rank > 3) {
    return <span className="text-sm font-bold text-muted-foreground">#{rank}</span>
  }
  return (
    <>
      {rank === 1 && <Crown className="h-5 w-5 text-yellow-500" aria-hidden="true" />}
      {rank === 2 && <Medal className="h-5 w-5 text-gray-400" aria-hidden="true" />}
      {rank === 3 && <Award className="h-5 w-5 text-amber-600" aria-hidden="true" />}
      <span className="sr-only">Rank {rank}</span>
    </>
  )
}

function EntryRow({ entry, unit, index }: { entry: LeaderboardEntry; unit: string; index: number }) {
  // Anonymous members come back without an id, as "anonymous" and without an avatar.
  const isAnonymous = entry.userId === null

  return (
    <motion.li
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index, 10) * 0.02 }}
      aria-current={entry.isCurrentUser ? 'true' : undefined}
      className={cn(
        'flex items-center gap-3 p-3 lg:gap-4 lg:p-4 rounded-lg transition-colors duration-200 hover:bg-muted/50',
        entry.rank <= 3 && 'bg-gradient-to-r from-primary/5 to-transparent border border-primary/20',
        entry.isCurrentUser && 'ring-2 ring-primary/50 bg-primary/5'
      )}
    >
      <div className="flex items-center justify-center w-6 lg:w-8 shrink-0">
        <RankMark rank={entry.rank} />
      </div>

      <Avatar className="h-8 w-8 lg:h-10 lg:w-10">
        {entry.avatar && <AvatarImage src={entry.avatar} alt="" />}
        <AvatarFallback aria-hidden="true" className="text-xs lg:text-base">
          {isAnonymous ? <UserRound className="h-5 w-5 text-muted-foreground" /> : entry.username.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0 flex items-center gap-2">
        {/* A long username is cut with an ellipsis; the title keeps the whole of it within reach. */}
        <span
          title={isAnonymous ? undefined : `@${entry.username}`}
          className={cn('font-medium truncate', isAnonymous ? 'text-muted-foreground italic' : 'text-foreground')}
        >
          {isAnonymous ? 'Anonymous' : `@${entry.username}`}
        </span>
        {entry.isCurrentUser && (
          <Badge variant="secondary" className="text-xs shrink-0">You</Badge>
        )}
      </div>

      <div className="shrink-0 text-right text-sm lg:text-base font-bold text-foreground">
        {numberFormat.format(entry.value)}
        <span className="sr-only"> {unit}</span>
      </div>
    </motion.li>
  )
}

export default function Leaderboard() {
  const queryClient = useQueryClient()
  const searchId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  const [boardType, setBoardType] = useState<LeaderboardType>('laces')
  const [limit, setLimit] = useState<number>(LIMITS[0])
  const [searchTerm, setSearchTerm] = useState('')

  const boardQuery = useQuery({
    queryKey: [...LEADERBOARD_KEY, boardType, limit],
    queryFn: () => LeaderboardAPI.getLeaderboard({ type: boardType, limit }),
    // Changing the list length keeps the rows of the same board on screen while the longer list loads.
    placeholderData: (previous) => (previous?.type === boardType ? previous : undefined)
  })

  const board = boardQuery.data
  const isResizing = boardQuery.isPlaceholderData
  const standing = board ? standingMessage(board, limit, !isResizing) : null

  // Rows show usernames as "@name", so accept a search typed that way too.
  const term = searchTerm.trim().toLowerCase().replace(/^@/, '')
  const visibleEntries = board
    ? board.items.filter((entry) => entry.username.toLowerCase().includes(term))
    : []

  // While a request is running, Refresh and Retry ignore clicks but are not `disabled`:
  // a button that becomes disabled while it has keyboard focus drops the focus to <body>.
  const isFetching = boardQuery.isFetching
  const busyClass = isFetching && 'cursor-default opacity-50'

  const refresh = () => {
    if (isFetching) return
    // Every cached board is out of date, not only the one on screen.
    void queryClient.invalidateQueries({ queryKey: LEADERBOARD_KEY })
  }

  const retry = () => {
    if (isFetching) return
    // The error message and its Retry button go away once the board reloads. Move keyboard
    // focus to the board's panel first, so it is not dropped back to the top of the page.
    panelRef.current?.focus()
    void boardQuery.refetch()
  }

  return (
    // A one-column grid, not a plain block: its minmax(0, 1fr) track keeps wide content (a long
    // username, which must not wrap) from stretching the page past the screen, so the name is
    // cut with an ellipsis instead of the whole app scrolling sideways on a phone.
    <div className="grid grid-cols-1 gap-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Leaderboard</h1>
          <p className="text-muted-foreground">
            See who leads the community in LACES, signals and drop zone check-ins
          </p>
        </div>

        {/* The signed-in user's place on the selected board */}
        <div role="status" aria-label="Your standing" className="shrink-0">
          {standing && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-lg"
            >
              <Trophy className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="font-medium">{standing}</span>
            </motion.div>
          )}
        </div>
      </div>

      <Tabs
        value={boardType}
        onValueChange={(value) => {
          if (isBoardType(value)) setBoardType(value)
        }}
        className="space-y-6"
      >
        {/* Controls. Below the lg breakpoint the card's own padding is dropped: its content already has one. */}
        <Card className="p-0 lg:p-6">
          <CardContent className="pt-6 space-y-4">
            <TabsList aria-label="Leaderboards" className="grid w-full grid-cols-3">
              {BOARDS.map(({ type, label, icon: Icon }) => (
                <TabsTrigger key={type} value={type}>
                  {/* Three labels with icons do not fit across a phone; the labels stay. */}
                  <Icon className="hidden sm:block h-4 w-4 mr-2 shrink-0" aria-hidden="true" />
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>

            <div className="flex flex-col lg:flex-row lg:items-center gap-4">
              {/* Search */}
              <div className="flex-1">
                <Label htmlFor={searchId} className="sr-only">Search members on this board</Label>
                <div className="relative">
                  <Search
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    id={searchId}
                    type="search"
                    placeholder="Search members..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* List length */}
              <div role="group" aria-label="Number of members shown" className="flex items-center gap-2">
                {LIMITS.map((option) => (
                  <Button
                    key={option}
                    type="button"
                    size="sm"
                    variant={limit === option ? 'default' : 'outline'}
                    aria-pressed={limit === option}
                    onClick={() => setLimit(option)}
                  >
                    Top {option}
                  </Button>
                ))}
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={refresh}
                aria-disabled={isFetching}
                className={cn(busyClass)}
              >
                <RefreshCw className={cn('h-4 w-4 mr-2', isFetching && 'animate-spin')} aria-hidden="true" />
                Refresh
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Leaderboard */}
        <TabsContent ref={panelRef} key={boardType} value={boardType} className="mt-0">
          <Card className="p-0 lg:p-6">
            {board && (
              <CardHeader className="px-4 lg:px-6">
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-primary" aria-hidden="true" />
                  {board.title}
                </CardTitle>
                <CardDescription>{board.subtitle}</CardDescription>
              </CardHeader>
            )}
            <CardContent className={cn('space-y-4 px-4 lg:px-6', !board && 'pt-6')}>
              {boardQuery.isError && (
                <div className="flex flex-col gap-3 rounded-lg border border-destructive/40 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div role="alert" className="flex items-start gap-3">
                    <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
                    <div>
                      <p className="font-medium">
                        {board
                          ? 'Could not refresh the leaderboard. Showing the last loaded rankings.'
                          : 'Could not load the leaderboard'}
                      </p>
                      <p className="text-sm text-muted-foreground">{boardQuery.error.message}</p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={retry}
                    aria-disabled={isFetching}
                    className={cn(busyClass)}
                  >
                    {isFetching ? 'Retrying…' : 'Retry'}
                  </Button>
                </div>
              )}

              {boardQuery.isPending && (
                <div role="status" aria-label="Loading leaderboard" className="space-y-3">
                  {/* A status region is announced by its content, not by its label. */}
                  <span className="sr-only">Loading leaderboard…</span>
                  {Array.from({ length: 5 }, (_, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 lg:gap-4 lg:p-4 rounded-lg bg-muted/50">
                      <Skeleton className="w-6 h-6 lg:w-8 lg:h-8 rounded-full" />
                      <Skeleton className="w-8 h-8 lg:w-10 lg:h-10 rounded-full" />
                      <Skeleton className="flex-1 h-4" />
                      <Skeleton className="w-16 h-6" />
                    </div>
                  ))}
                </div>
              )}

              {board && board.items.length === 0 && (
                <div role="status" className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" aria-hidden="true" />
                  <p className="font-medium text-foreground">No one is on this board yet</p>
                  <p className="text-sm">{boardOption(board.type).emptyHint}</p>
                </div>
              )}

              {board && board.items.length > 0 && visibleEntries.length === 0 && (
                <div role="status" className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" aria-hidden="true" />
                  <p>No members on this board match "{searchTerm.trim()}"</p>
                  <Button type="button" variant="link" className="mt-2" onClick={() => setSearchTerm('')}>
                    Clear search
                  </Button>
                </div>
              )}

              {board && visibleEntries.length > 0 && (
                <div>
                  {/* Column headings for sighted users; each row repeats the unit for screen readers. */}
                  <div
                    aria-hidden="true"
                    className="flex items-center gap-3 px-3 lg:gap-4 lg:px-4 pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    <span className="w-6 lg:w-8 text-center">#</span>
                    <span className="flex-1">Member</span>
                    <span>{board.unit}</span>
                  </div>
                  <ol
                    aria-label={board.title}
                    aria-busy={isResizing}
                    className={cn('space-y-2', isResizing && 'opacity-60')}
                  >
                    {visibleEntries.map((entry, index) => (
                      <EntryRow
                        key={`${entry.rank}-${entry.userId ?? 'anonymous'}`}
                        entry={entry}
                        unit={board.unit}
                        index={index}
                      />
                    ))}
                  </ol>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
