export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

export function withTimeout<T>(p: Promise<T>, ms: number, label = 'timeout'): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(label)), ms)
    p.then(x => { clearTimeout(t); resolve(x) }, e => { clearTimeout(t); reject(e) })
  })
}

export const compose = <A>(...fs: Array<(a: A) => A>) => (a: A) => fs.reduce((x, f) => f(x), a)
