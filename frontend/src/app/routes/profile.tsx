import { useEffect, useRef, useState } from 'react'
import type { FormEvent, RefObject } from 'react'
import { motion } from 'framer-motion'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UseMutationResult } from '@tanstack/react-query'
import {
  Activity,
  BadgeCheck,
  Calendar,
  CircleAlert,
  Edit3,
  EyeOff,
  Globe,
  Mail,
  MapPin,
  Save,
  Shield,
  X,
  Zap,
} from 'lucide-react'

import { ChangePasswordCard } from '@/components/account/ChangePasswordCard'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/Skeleton'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { PROFILE_LIMITS, UsersAPI, UsersApiError } from '@/lib/api/users'
import type { UpdateProfileRequest, UserPost, UserProfile } from '@/lib/api/users'

const PROFILE_KEY = ['profile', 'me'] as const
const STATS_KEY = ['profile', 'stats'] as const
const postsKey = (userId: string) => ['profile', 'posts', userId] as const

/** How many of the user's latest posts the Posts tab asks the API for. */
const RECENT_POSTS_LIMIT = 5

type ProfileTab = 'overview' | 'posts' | 'settings'

/** The profile fields edited as text, in the order the form shows them. */
type TextField = 'display_name' | 'bio' | 'location' | 'website_url' | 'avatar_url'
type FormValues = Record<TextField, string>
type FieldErrors = Partial<Record<TextField, string>>

const TEXT_FIELDS: readonly TextField[] = ['display_name', 'bio', 'location', 'website_url', 'avatar_url']
const CLEARABLE_FIELDS = ['bio', 'location', 'website_url', 'avatar_url'] as const

const FIELD_LABELS: Record<TextField, string> = {
  display_name: 'Display name',
  bio: 'Bio',
  location: 'Location',
  website_url: 'Website',
  avatar_url: 'Avatar URL',
}

const POST_TYPE_LABELS: Record<string, string> = {
  SPOTTED: 'Spotted',
  STOCK_CHECK: 'Stock check',
  LINE_UPDATE: 'Line update',
  GENERAL: 'General',
  HEAT_CHECK: 'Heat check',
  INTEL_REPORT: 'Intel report',
}

/** Shown on a post that is not public, so the author knows who else can see it. */
const RESTRICTED_VISIBILITY_LABELS: Record<string, string> = {
  local: 'Local',
  friends: 'Friends',
  private: 'Private',
}

const numberFormat = new Intl.NumberFormat('en-US')

function formatNumber(value: number): string {
  return numberFormat.format(value)
}

function countOf(value: number, singular: string): string {
  return `${formatNumber(value)} ${value === 1 ? singular : `${singular}s`}`
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString()
}

/** The API counts characters (code points), not UTF-16 units. */
function characterCount(value: string): number {
  return Array.from(value).length
}

function isHttpUrl(value: string): boolean {
  if (/\s/.test(value) || !/^https?:\/\//i.test(value)) return false
  try {
    return new URL(value).hostname !== ''
  } catch {
    return false
  }
}

/**
 * For every text a member typed. A name, bio or tag can be one long word (the API allows
 * 100 to 500 characters without a space): it has to break inside the word, and has to count
 * as breakable when the layout is sized, or the whole page becomes as wide as that word.
 * (break-words only does the first of the two.)
 */
const USER_TEXT = '[overflow-wrap:anywhere]'

/** Registration accepts a display name made of spaces only: such an account goes by its username. */
function shownName(profile: UserProfile): string {
  return profile.display_name.trim() || profile.username
}

function initialsOf(profile: UserProfile): string {
  const words = profile.display_name.trim().split(/\s+/).filter(Boolean)
  const letters = words.slice(0, 2).map((word) => Array.from(word)[0])
  return (letters.join('') || profile.username.charAt(0)).toUpperCase()
}

function valuesFrom(profile: UserProfile): FormValues {
  return {
    display_name: profile.display_name,
    bio: profile.bio ?? '',
    location: profile.location ?? '',
    website_url: profile.website_url ?? '',
    avatar_url: profile.avatar_url ?? '',
  }
}

/** The same rules PATCH /users/me enforces, checked before sending. */
function validate(values: FormValues): FieldErrors {
  const errors: FieldErrors = {}

  if (values.display_name.trim() === '') {
    errors.display_name = 'Display name is required'
  }
  for (const field of TEXT_FIELDS) {
    const limit = PROFILE_LIMITS[field]
    if (!errors[field] && characterCount(values[field].trim()) > limit) {
      errors[field] = `${FIELD_LABELS[field]} must be ${limit} characters or fewer`
    }
  }
  for (const field of ['website_url', 'avatar_url'] as const) {
    const value = values[field].trim()
    if (!errors[field] && value !== '' && !isHttpUrl(value)) {
      errors[field] = `${FIELD_LABELS[field]} must be a link starting with http:// or https://`
    }
  }
  return errors
}

/** Only what differs from the saved profile; a blank optional field is sent as null to clear it. */
function changesBetween(profile: UserProfile, values: FormValues): UpdateProfileRequest {
  const changes: UpdateProfileRequest = {}
  const displayName = values.display_name.trim()
  if (displayName !== profile.display_name) changes.display_name = displayName
  for (const field of CLEARABLE_FIELDS) {
    const next = values[field].trim() || null
    if (next !== (profile[field] || null)) changes[field] = next
  }
  return changes
}

type ProfileUpdate = UseMutationResult<UserProfile, Error, UpdateProfileRequest>

/**
 * PATCH /users/me. The answer replaces the profile on this page, and every other place
 * that shows the user (the app shell, the dashboard, the leaderboard) is told to reload.
 */
function useUpdateProfile(): ProfileUpdate {
  const queryClient = useQueryClient()
  return useMutation<UserProfile, Error, UpdateProfileRequest>({
    mutationFn: (changes) => UsersAPI.updateMe(changes),
    // Every answer is the whole account as it was when that request was handled. The edit
    // form and the privacy switch can both be saving: one request at a time, so an older
    // answer can never arrive last and put back what the newer request changed.
    scope: { id: 'profile-update' },
    onSuccess: async (updated) => {
      // A profile reload that started before the save must not overwrite its result.
      await queryClient.cancelQueries({ queryKey: PROFILE_KEY })
      queryClient.setQueryData<UserProfile>(PROFILE_KEY, updated)
      void queryClient.invalidateQueries({ queryKey: ['currentUser'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      void queryClient.invalidateQueries({ queryKey: ['leaderboard'] })
    },
  })
}

function ErrorNotice({
  title,
  error,
  retryLabel,
  onRetry,
  isRetrying,
}: {
  title: string
  error: Error
  retryLabel: string
  onRetry: () => void
  isRetrying: boolean
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-destructive/40 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div role="alert" className="flex items-start gap-3">
        <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
        <div>
          <p className="font-medium">{title}</p>
          <p className={`text-sm text-muted-foreground ${USER_TEXT}`}>{error.message}</p>
        </div>
      </div>
      <Button variant="outline" size="sm" aria-label={retryLabel} onClick={onRetry} disabled={isRetrying}>
        Retry
      </Button>
    </div>
  )
}

function ProfileSkeleton() {
  return (
    <div role="status" aria-label="Loading profile" className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-20 w-20 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-24 w-full rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-48 w-full rounded-lg" />
    </div>
  )
}

function ProfileHeader({
  profile,
  isEditing,
  onEdit,
  editButtonRef,
}: {
  profile: UserProfile
  isEditing: boolean
  onEdit: () => void
  editButtonRef: RefObject<HTMLButtonElement>
}) {
  const avatarUrl = profile.avatar_url && isHttpUrl(profile.avatar_url) ? profile.avatar_url : undefined

  return (
    <Card role="region" aria-label="Profile" className="overflow-hidden">
      <div className="h-32 bg-gradient-to-r from-primary/20 via-primary/10 to-secondary/20" />
      <CardContent className="relative pt-0">
        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4 -mt-10">
          <Avatar className="w-20 h-20 border-4 border-background">
            {avatarUrl && <AvatarImage src={avatarUrl} alt="" />}
            <AvatarFallback className="text-lg">{initialsOf(profile)}</AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className={`text-2xl font-bold text-foreground ${USER_TEXT}`}>{shownName(profile)}</h1>
              {profile.is_verified && (
                <Badge variant="secondary" className="gap-1">
                  <BadgeCheck className="h-3 w-3" aria-hidden="true" />
                  Verified
                </Badge>
              )}
              {profile.is_anonymous && (
                <Badge variant="outline" className="gap-1">
                  <EyeOff className="h-3 w-3" aria-hidden="true" />
                  Anonymous to others
                </Badge>
              )}
            </div>
            <p className={`text-muted-foreground ${USER_TEXT}`}>@{profile.username}</p>
            {profile.created_at && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" aria-hidden="true" />
                <span>
                  Joined <time dateTime={profile.created_at}>{formatDay(profile.created_at)}</time>
                </span>
              </div>
            )}
          </div>

          {!isEditing && (
            <Button ref={editButtonRef} size="sm" variant="outline" onClick={onEdit}>
              <Edit3 className="h-4 w-4 mr-2" aria-hidden="true" />
              Edit Profile
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function StatCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <Card role="group" aria-label={label}>
      <CardContent className="pt-6">
        <div className="text-center">
          <div className="text-2xl font-bold text-primary">{value}</div>
          <p className="text-sm text-muted-foreground">{label}</p>
          {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

function StatsSection({ profile }: { profile: UserProfile }) {
  const statsQuery = useQuery({
    queryKey: STATS_KEY,
    queryFn: () => UsersAPI.getStats(),
    // These numbers change on other pages (posting, check-ins, boosts): reload on every visit.
    staleTime: 0,
  })
  const stats = statsQuery.data

  return (
    <section aria-labelledby="profile-stats-heading" className="space-y-3">
      <h2 id="profile-stats-heading" className="sr-only">
        Your stats
      </h2>

      {statsQuery.isError && (
        <ErrorNotice
          title={
            stats
              ? 'Could not refresh your stats. Showing the last loaded numbers.'
              : 'Could not load your rank and activity'
          }
          error={statsQuery.error}
          retryLabel="Retry loading stats"
          onRetry={() => void statsQuery.refetch()}
          isRetrying={statsQuery.isFetching}
        />
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="LACES Balance"
          value={formatNumber(profile.laces_balance)}
          detail={stats ? `${formatNumber(stats.lacesEarnedThisWeek)} earned this week` : undefined}
        />
        {stats ? (
          <>
            <StatCard
              label="Community Rank"
              value={`#${formatNumber(stats.communityRank)}`}
              detail={`of ${countOf(stats.totalUsers, 'member')}`}
            />
            <StatCard
              label="Signals Posted"
              value={formatNumber(stats.signalsPosted)}
              detail={countOf(stats.totalViews, 'view')}
            />
            <StatCard label="Check-ins" value={formatNumber(stats.checkIns)} detail="at drop zones" />
          </>
        ) : (
          statsQuery.isPending && (
            <div
              role="status"
              aria-label="Loading stats"
              className="col-span-2 md:col-span-3 grid grid-cols-2 md:grid-cols-3 gap-4"
            >
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-24 w-full rounded-lg" />
              ))}
            </div>
          )
        )}
      </div>
    </section>
  )
}

function AboutDetails({ profile }: { profile: UserProfile }) {
  const website = profile.website_url

  return (
    <div className="space-y-4">
      {profile.bio ? (
        <p className={`text-muted-foreground whitespace-pre-wrap ${USER_TEXT}`}>{profile.bio}</p>
      ) : (
        <p className="text-muted-foreground italic">No bio yet. Use Edit Profile to add one.</p>
      )}

      <Separator />

      <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <dt className="text-sm font-medium text-muted-foreground">Location</dt>
          <dd className="flex items-center gap-2 mt-1 min-w-0">
            <MapPin className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className={USER_TEXT}>{profile.location || 'Not specified'}</span>
          </dd>
        </div>

        <div>
          <dt className="text-sm font-medium text-muted-foreground">Website</dt>
          <dd className="flex items-center gap-2 mt-1 min-w-0">
            <Globe className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            {website && isHttpUrl(website) ? (
              <a
                href={website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline break-all"
              >
                {website}
              </a>
            ) : (
              <span className="break-all">{website || 'Not specified'}</span>
            )}
          </dd>
        </div>

        <div>
          <dt className="text-sm font-medium text-muted-foreground">Email (only you can see this)</dt>
          <dd className="flex items-center gap-2 mt-1 min-w-0">
            <Mail className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="break-all">{profile.email}</span>
          </dd>
        </div>
      </dl>
    </div>
  )
}

function ProfileTextField({
  field,
  value,
  onChange,
  error,
  hint,
  type = 'text',
  multiline = false,
  required = false,
  placeholder,
  disabled,
  focusOnMount = false,
}: {
  field: TextField
  value: string
  onChange: (value: string) => void
  error?: string
  hint?: string
  type?: 'text' | 'url'
  multiline?: boolean
  required?: boolean
  placeholder?: string
  disabled: boolean
  /** The form replaces the button that opened it: focus moves into its first field. */
  focusOnMount?: boolean
}) {
  const id = `profile-edit-${field}`
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined
  const invalidClass = error ? 'border-destructive focus-visible:ring-destructive' : undefined

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {FIELD_LABELS[field]}
        {required && (
          <span className="text-destructive ml-1" aria-hidden="true">
            *
          </span>
        )}
      </Label>
      {multiline ? (
        <Textarea
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          rows={4}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={invalidClass}
        />
      ) : (
        <Input
          id={id}
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          autoFocus={focusOnMount}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={invalidClass}
        />
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  )
}

function EditProfileForm({
  profile,
  onDone,
  onCancel,
}: {
  profile: UserProfile
  /** Called when the form is finished, with the message to confirm it. */
  onDone: (message: string) => void
  onCancel: () => void
}) {
  const [values, setValues] = useState<FormValues>(() => valuesFrom(profile))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const save = useUpdateProfile()

  const setField = (field: TextField) => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }))
    // The message described the old value.
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current))
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (save.isPending) return

    const found = validate(values)
    setErrors(found)
    setFormError(null)
    const firstInvalid = TEXT_FIELDS.find((field) => found[field])
    if (firstInvalid) {
      document.getElementById(`profile-edit-${firstInvalid}`)?.focus()
      return
    }

    const changes = changesBetween(profile, values)
    if (Object.keys(changes).length === 0) {
      onDone('No changes to save.')
      return
    }

    save.mutate(changes, {
      onSuccess: () => onDone('Profile updated.'),
      onError: (error) => {
        // A 422 names the fields it refused: show each message next to its field.
        const refused: FieldErrors = {}
        if (error instanceof UsersApiError) {
          for (const field of TEXT_FIELDS) {
            const message = error.fieldErrors[field]
            if (message) refused[field] = message
          }
        }
        setErrors(refused)
        setFormError(
          Object.keys(refused).length > 0
            ? 'Your profile was not saved: some fields were not accepted. Fix them and save again.'
            : `Your profile was not saved: ${error.message}`,
        )
      },
    })
  }

  const disabled = save.isPending

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="Edit profile" className="space-y-4">
      <ProfileTextField
        field="display_name"
        value={values.display_name}
        onChange={setField('display_name')}
        error={errors.display_name}
        hint={`The name shown on your profile. Up to ${PROFILE_LIMITS.display_name} characters.`}
        required
        focusOnMount
        disabled={disabled}
      />
      <ProfileTextField
        field="bio"
        value={values.bio}
        onChange={setField('bio')}
        error={errors.bio}
        hint={`${characterCount(values.bio.trim())}/${PROFILE_LIMITS.bio} characters`}
        placeholder="Tell the community about yourself..."
        multiline
        disabled={disabled}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ProfileTextField
          field="location"
          value={values.location}
          onChange={setField('location')}
          error={errors.location}
          placeholder="City, Country"
          disabled={disabled}
        />
        <ProfileTextField
          field="website_url"
          value={values.website_url}
          onChange={setField('website_url')}
          error={errors.website_url}
          type="url"
          placeholder="https://yourwebsite.com"
          disabled={disabled}
        />
      </div>
      <ProfileTextField
        field="avatar_url"
        value={values.avatar_url}
        onChange={setField('avatar_url')}
        error={errors.avatar_url}
        hint="A link to an image. Leave it empty to show your initials."
        type="url"
        placeholder="https://example.com/avatar.png"
        disabled={disabled}
      />

      {formError && (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="outline" onClick={onCancel} disabled={disabled}>
          <X className="h-4 w-4 mr-2" aria-hidden="true" />
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={disabled}>
          <Save className="h-4 w-4 mr-2" aria-hidden="true" />
          {save.isPending ? 'Saving...' : 'Save changes'}
        </Button>
      </div>
    </form>
  )
}

function postTypeLabel(type: string): string {
  const known = POST_TYPE_LABELS[type]
  if (known) return known
  const words = type.toLowerCase().replaceAll('_', ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

function PostRow({ post }: { post: UserPost }) {
  const restricted = post.visibility === 'public' ? undefined : RESTRICTED_VISIBILITY_LABELS[post.visibility] ?? post.visibility
  const isPinned = post.geo_tag_lat !== null && post.geo_tag_long !== null
  const tags = post.tags ?? []

  return (
    <li className="space-y-2 p-3 border rounded-lg">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{postTypeLabel(post.post_type)}</Badge>
        {restricted && <Badge variant="outline">{restricted}</Badge>}
        <time dateTime={post.timestamp} className="text-xs text-muted-foreground">
          {formatDateTime(post.timestamp)}
        </time>
      </div>

      {post.content_text?.trim() ? (
        <p className={`whitespace-pre-wrap ${USER_TEXT}`}>{post.content_text}</p>
      ) : (
        <p className="italic text-muted-foreground">This post has no text.</p>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Zap className="h-3 w-3" aria-hidden="true" />
          {formatNumber(post.boost_score)} LACES in boosts
        </span>
        {isPinned && (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3 w-3" aria-hidden="true" />
            Pinned to a location
          </span>
        )}
        {tags.map((tag, index) => (
          // The API does not remove repeated tags, so the tag alone is not a unique key.
          <span key={`${index}-${tag}`} className={USER_TEXT}>
            #{tag}
          </span>
        ))}
      </div>
    </li>
  )
}

function RecentPostsCard({ userId }: { userId: string }) {
  const postsQuery = useQuery({
    queryKey: postsKey(userId),
    queryFn: () => UsersAPI.getPosts(userId, { limit: RECENT_POSTS_LIMIT }),
    staleTime: 0,
  })
  const posts = postsQuery.data

  return (
    <Card role="region" aria-labelledby="profile-posts-heading">
      <CardHeader>
        <CardTitle id="profile-posts-heading" className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" aria-hidden="true" />
          Recent Posts
        </CardTitle>
        <CardDescription>
          Your latest posts, newest first. Posts that are not public are only listed for you.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {postsQuery.isError && (
          <ErrorNotice
            title={posts ? 'Could not refresh your posts. Showing the last loaded list.' : 'Could not load your posts'}
            error={postsQuery.error}
            retryLabel="Retry loading posts"
            onRetry={() => void postsQuery.refetch()}
            isRetrying={postsQuery.isFetching}
          />
        )}

        {posts ? (
          posts.length > 0 ? (
            <ul className="space-y-2">
              {posts.map((post) => (
                <PostRow key={post.post_id} post={post} />
              ))}
            </ul>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" aria-hidden="true" />
              <p>You have not posted anything yet.</p>
              <p className="text-sm">Your posts will show up here once you share one.</p>
            </div>
          )
        ) : (
          postsQuery.isPending && (
            <div role="status" aria-label="Loading posts" className="space-y-2">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-20 w-full" />
              ))}
            </div>
          )
        )}
      </CardContent>
    </Card>
  )
}

function PrivacyCard({
  profile,
  update,
}: {
  profile: UserProfile
  /** Owned by the page, so a change still being saved survives a look at another tab. */
  update: ProfileUpdate
}) {
  // While the change is being saved the switch shows what was asked for.
  const checked = update.isPending ? update.variables.is_anonymous ?? profile.is_anonymous : profile.is_anonymous

  return (
    <Card role="region" aria-labelledby="profile-privacy-heading">
      <CardHeader>
        <CardTitle id="profile-privacy-heading" className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" aria-hidden="true" />
          Privacy Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="profile-anonymous" className="text-base font-medium">
              Appear as anonymous
            </Label>
            <p id="profile-anonymous-description" className="text-sm text-muted-foreground">
              Other members see &ldquo;anonymous&rdquo; instead of your username and avatar in the activity feed and
              on leaderboards, and you are left out of the member list.
            </p>
          </div>
          <Switch
            id="profile-anonymous"
            checked={checked}
            onCheckedChange={(next) => update.mutate({ is_anonymous: next })}
            disabled={update.isPending}
            aria-describedby="profile-anonymous-description"
          />
        </div>

        {/* Always mounted so screen readers announce the confirmation when it appears. */}
        <div role="status" className={update.isSuccess ? 'text-sm text-green-600' : 'sr-only'}>
          {update.isSuccess &&
            (profile.is_anonymous
              ? 'Saved. Other members now see you as anonymous.'
              : 'Saved. Other members now see your username and avatar.')}
        </div>
        {update.isError && (
          <p role="alert" className="text-sm text-destructive">
            Your privacy setting was not changed: {update.error.message}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export default function Profile() {
  const [activeTab, setActiveTab] = useState<ProfileTab>('overview')
  const [isEditing, setIsEditing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const privacyUpdate = useUpdateProfile()
  const editButtonRef = useRef<HTMLButtonElement>(null)
  // Set when the form closes: the Edit button that comes back in its place gets the focus.
  const formJustClosed = useRef(false)

  useEffect(() => {
    if (isEditing || !formJustClosed.current) return
    formJustClosed.current = false
    // A save can be answered while another tab is looked at: the focus then stays where
    // the user is. (Read here, not where the form reports back: that callback was created
    // when the save started and only knows the tab that was open then.)
    if (activeTab === 'overview') editButtonRef.current?.focus()
  }, [isEditing, activeTab])

  const profileQuery = useQuery({
    queryKey: PROFILE_KEY,
    queryFn: () => UsersAPI.getMe(),
    // The balance changes on other pages: reload on every visit.
    staleTime: 0,
  })
  const profile = profileQuery.data

  if (!profile) {
    if (profileQuery.isError) {
      return (
        <ErrorNotice
          title="Could not load your profile"
          error={profileQuery.error}
          retryLabel="Retry loading profile"
          onRetry={() => void profileQuery.refetch()}
          isRetrying={profileQuery.isFetching}
        />
      )
    }
    return <ProfileSkeleton />
  }

  const startEditing = () => {
    setActiveTab('overview')
    setNotice(null)
    setIsEditing(true)
  }

  const finishEditing = (message: string | null) => {
    formJustClosed.current = true
    setIsEditing(false)
    setNotice(message)
  }

  const changeTab = (value: string) => {
    if (value !== 'overview' && value !== 'posts' && value !== 'settings') return
    if (value === activeTab) return
    // A confirmation is dropped once the user leaves the tab it was shown on. One that
    // arrived while they were elsewhere (a save that finished later) waits for them.
    if (activeTab === 'overview') setNotice(null)
    if (activeTab === 'settings' && !privacyUpdate.isPending) privacyUpdate.reset()
    setActiveTab(value)
  }

  return (
    <div className="space-y-6">
      {profileQuery.isError && (
        <ErrorNotice
          title="Could not refresh your profile. Showing the last loaded details."
          error={profileQuery.error}
          retryLabel="Retry loading profile"
          onRetry={() => void profileQuery.refetch()}
          isRetrying={profileQuery.isFetching}
        />
      )}

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <ProfileHeader
          profile={profile}
          isEditing={isEditing}
          onEdit={startEditing}
          editButtonRef={editButtonRef}
        />
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <StatsSection profile={profile} />
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Tabs value={activeTab} onValueChange={changeTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="posts">Posts</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          {/* An open edit form stays mounted (hidden) on the other tabs, so what was typed is not lost. */}
          <TabsContent
            value="overview"
            forceMount={isEditing || undefined}
            hidden={activeTab !== 'overview'}
            className="space-y-6"
          >
            <Card role="region" aria-labelledby="profile-about-heading">
              <CardHeader>
                <CardTitle id="profile-about-heading">{isEditing ? 'Edit Profile' : 'About'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {isEditing ? (
                  <EditProfileForm profile={profile} onDone={finishEditing} onCancel={() => finishEditing(null)} />
                ) : (
                  <AboutDetails profile={profile} />
                )}
                {/* Always mounted so screen readers announce the confirmation when it appears. */}
                <div role="status" className={notice ? 'text-sm text-green-600' : 'sr-only'}>
                  {notice}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="posts" className="space-y-6">
            <RecentPostsCard userId={profile.user_id} />
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <PrivacyCard profile={profile} update={privacyUpdate} />
            <ChangePasswordCard />
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  )
}
