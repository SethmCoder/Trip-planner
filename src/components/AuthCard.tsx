import type { ReactNode } from 'react'
import Logo from './Logo'
export default function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--white)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: 420, maxWidth: '94vw', border: '1px solid var(--black)', borderRadius: 16, overflow: 'hidden', background: 'var(--white)' }}>
        <div style={{ background: 'var(--orange)', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ background: 'var(--white)', borderRadius: '50%', display: 'inline-flex', padding: 5 }}><Logo size={38} /></span>
          <span style={{ color: 'var(--white)', fontSize: 22, fontWeight: 800 }}>The Travel Log</span>
        </div>
        <div style={{ padding: '22px 26px 26px' }}>
          <h1 style={{ fontFamily: "'Courier New',Courier,monospace", margin: '0 0 6px', fontSize: 28 }}>{title}</h1>
          {children}
        </div>
      </div>
    </div>
  )
}
