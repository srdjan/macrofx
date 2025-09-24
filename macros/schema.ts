import type { Macro } from '../core.ts'

export type Person = { id: number; name: string; age: number }
const isPersonArray = (x: unknown): x is Person[] =>
  Array.isArray(x) && x.every(r =>
    typeof r?.id === 'number' && typeof r?.name === 'string' && typeof r?.age === 'number'
  )

export type SchemaMeta = { schema?: 'Person[]' }

export const schemaMacro: Macro<SchemaMeta, {}, { data: Person[] }> = {
  name: 'schema',
  match: m => m.schema === 'Person[]',
  resolve: async () => {
    const rows = [{ id: 1, name: 'Ada', age: 31 }, { id: 2, name: 'Grace', age: 29 }]
    if (!isPersonArray(rows)) throw new Error('schema: invalid data')
    return { data: rows }
  }
}
