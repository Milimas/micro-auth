import { AbilityBuilder, createMongoAbility, subject as caslSubject, type MongoAbility } from '@casl/ability'
import type { TUser, TGraph, TUserProfile, TSession } from '@fusion-d/types'

export type AppAction =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'manage'
  | 'run'
  | 'stop'
  | 'pause'
  | 'resume'
  | 'publish'
  | 'import'
export type AppSubject =
  | 'Graph'
  | 'User'
  | 'UserProfile'
  | 'Session'
  | 'all'
  | TGraph
  | TUser
  | TUserProfile
  | TSession

// Use Record<string, unknown> as the condition type so CASL accepts plain attribute objects
export type AppAbility = MongoAbility<[AppAction, AppSubject]>

/**
 * Defines CASL abilities for a user based on their role.
 *
 * admin  → manage all (full access)
 *
 * editor → authenticated user
 *          - Full lifecycle on own graphs: create, read, update, delete,
 *            run, stop, pause, resume, publish
 *          - Can read own graphs AND published (isPublic:true) graphs
 *          - Can import published graphs
 *          - No visibility into other users' private graphs
 *          - No access to other users' accounts
 *          - Cannot delete User records
 *
 * viewer → unauthenticated user
 *          - Read published (isPublic:true) graphs only
 *          - No access to User, UserProfile, Session
 */
export function defineAbilityFor(user: TUser): AppAbility {
  const { can, cannot, build } = new AbilityBuilder<AppAbility>(createMongoAbility)

  switch (user.role) {
    case 'admin':
      can('manage', 'all')
      break

    case 'editor':
      // Graphs
      can('create', 'Graph')
      can('read',   'Graph', { userId: user.id })
      can('read',   'Graph', { isPublic: true })
      can('update', 'Graph', { userId: user.id })
      can('delete', 'Graph', { userId: user.id })
      // Lifecycle — own graphs only
      can('run',    'Graph', { userId: user.id })
      can('stop',   'Graph', { userId: user.id })
      can('pause',  'Graph', { userId: user.id })
      can('resume', 'Graph', { userId: user.id })
      can('publish','Graph', { userId: user.id })
      // Import — published graphs only
      can('import', 'Graph', { isPublic: true })
      // Own profile & session
      can('read',   'UserProfile', { userId: user.id })
      can('update', 'UserProfile', { userId: user.id })
      can('read',   'Session',     { userId: user.id })
      // Own user record
      can('read', 'User', { id: user.id })
      cannot('delete', 'User')
      break

    case 'viewer':
    default:
      // Unauthenticated: published graphs only
      can('read', 'Graph', { isPublic: true })
      break
  }

  return build()
}

/**
 * Checks a permission without an Express context.
 * Used by the gRPC CheckPermission handler in auth-api.
 */
export function checkPermission(
  user: TUser,
  action: AppAction,
  subjectType: AppSubject,
  resource?: Record<string, unknown>,
): boolean {
  const ability = defineAbilityFor(user)
  if (resource && Object.keys(resource).length > 0) {
    // caslSubject() tags the object with __caslSubjectType__ as a non-enumerable
    // own property — required for CASL v6 to match rules for the given subject string.
    const instance = caslSubject(subjectType as string, { ...resource })
    return ability.can(action, instance as unknown as AppSubject)
  }
  return ability.can(action, subjectType)
}
