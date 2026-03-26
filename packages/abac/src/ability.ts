import { AbilityBuilder, createMongoAbility, type MongoAbility } from '@casl/ability'
import type { TUser, TGraph, TUserProfile, TSession } from '@fusion-d/types'

export type AppAction = 'create' | 'read' | 'update' | 'delete' | 'manage'
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
 * admin  → full access to everything
 * editor → CRUD on own Graphs, read public Graphs, manage own profile
 * viewer → read own + public Graphs, read own profile (no mutations)
 */
export function defineAbilityFor(user: TUser): AppAbility {
  const { can: _can, cannot: _cannot, build } = new AbilityBuilder<AppAbility>(createMongoAbility)
  const can = _can
  const cannot = _cannot

  switch (user.role) {
    case 'admin':
      _can('manage', 'all')
      break

    case 'editor':
      can('create', 'Graph')
      can('read', 'Graph', { userId: user.id })
      can('update', 'Graph', { userId: user.id })
      can('delete', 'Graph', { userId: user.id })
      can('read', 'Graph', { isPublic: true })
      can('read', 'User', { id: user.id })
      can('read', 'UserProfile', { userId: user.id })
      can('update', 'UserProfile', { userId: user.id })
      can('read', 'Session', { userId: user.id })
      cannot('delete', 'User')
      break

    case 'viewer':
    default:
      can('read', 'Graph', { userId: user.id })
      can('read', 'Graph', { isPublic: true })
      can('read', 'User', { id: user.id })
      can('read', 'UserProfile', { userId: user.id })
      can('read', 'Session', { userId: user.id })
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
  subject: AppSubject,
  resource?: Record<string, unknown>,
): boolean {
  const ability = defineAbilityFor(user)
  if (resource) {
    // Create a plain object tagged with the subject type for CASL subject detection
    const subjectInstance = Object.assign(
      Object.create({ __caslSubjectType__: subject }) as object,
      resource,
    )
    return ability.can(action, subjectInstance as unknown as AppSubject)
  }
  return ability.can(action, subject)
}
