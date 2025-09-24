import { createPipeline, type Step } from '../mod.ts'

type Meta = { theme?: 'light'|'dark'; i18n?: { lang: 'en'|'fr' } }
type Base = {}
const makeBase = (): Base => ({})

const themeMacro = {
  name: 'theme',
  match: (m: Meta) => !!m.theme,
  resolve: (_b: Base, m: Meta) => ({
    tokens: m.theme === 'dark'
      ? { bg: '#111', fg: '#eee', accent: '#6cf' }
      : { bg: '#fff', fg: '#111', accent: '#06f' }
  })
} as const

const i18nMacro = {
  name: 'i18n',
  match: (m: Meta) => !!m.i18n,
  resolve: (_b: Base, m: Meta) => {
    const t = (k: string) =>
      m.i18n!.lang === 'fr'
        ? ({ hello: 'Bonjour', bye: 'Au revoir' } as Record<string,string>)[k] ?? k
        : ({ hello: 'Hello',  bye: 'Goodbye' } as Record<string,string>)[k] ?? k
    return { t }
  }
} as const

const macros = [themeMacro, i18nMacro] as const
const { execute } = createPipeline<Meta, Base, typeof macros>(macros, makeBase)

const renderCard: Step<Meta, Base, typeof macros, string> = {
  name: 'card',
  meta: { theme: 'dark', i18n: { lang: 'fr' } },
  run: ({ tokens, t }) =>
    `<div style="background:${tokens.bg};color:${tokens.fg};padding:12px">
      <h1>${t('hello')}</h1>
      <button style="background:${tokens.accent};color:${tokens.bg}">${t('bye')}</button>
    </div>`
}

if (import.meta.main) {
  execute(renderCard).then(html => console.log('SSR HTML:\n', html))
}
