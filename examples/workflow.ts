import { createPipeline, type Step } from '../mod.ts'

type Role = 'admin' | 'member'
type Meta = { auth?: boolean; role?: Role; tx?: 'ro' | 'rw' }
type Base = {}

type User = { id: string; role: Role }
const fakeUser = (token?: string): User | null =>
  token === 'adm' ? { id: 'u1', role: 'admin' } : token === 'mem' ? { id: 'u2', role: 'member' } : null

const authMacro = {
  name: 'auth',
  match: (m: Meta) => m.auth === true,
  resolve: (_b: Base, _m: Meta) => {
    const token = 'adm' // stub
    const user = fakeUser(token)
    if (!user) throw new Error('unauthorized')
    return { user }
  },
  onError: (_b: Base, _m: Meta, err: unknown) => String(err).includes('unauthorized') ? { ok: false, reason: '401' } : undefined
} as const

const roleMacro = {
  name: 'role',
  match: (m: Meta) => !!m.role,
  before: (ctx: Base & { user: User }, m: Meta) => {
    if (ctx.user.role !== m.role) return { ok: false, reason: '403' }
  }
} as const

const txMacro = {
  name: 'tx',
  match: (m: Meta) => !!m.tx,
  resolve: (_b: Base, m: Meta) => ({ tx: { mode: m.tx, committed: false } }),
  after: (ctx: Base & { tx: { committed: boolean } }, _m: Meta, result: any) => {
    ctx.tx.committed = true
    return { ...result, txCommitted: true }
  }
} as const

const macros = [authMacro, roleMacro, txMacro] as const
const { execute } = createPipeline<Meta, Base, typeof macros>(macros, () => ({}))

const adminStep: Step<Meta, Base, typeof macros, any> = {
  name: 'admin-only',
  meta: { auth: true, role: 'admin', tx: 'rw' },
  run: ({ user, tx }) => ({ ok: true, by: user.id, mode: tx.mode })
}

if (import.meta.main) {
  execute(adminStep).then(console.log)
}
