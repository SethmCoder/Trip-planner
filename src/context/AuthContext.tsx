import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Profile } from '../lib/types'
import * as api from '../lib/data'
interface Ctx { profile: Profile | null; loading: boolean; login: typeof api.login; createAccount: typeof api.createAccount; logout: () => Promise<void>; setProfile: (p: Profile) => void }
const C = createContext<Ctx>(null as any); export const useAuth = () => useContext(C)
export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null); const [loading, setLoading] = useState(true)
  useEffect(() => { api.getSessionProfile().then(p => { setProfile(p); setLoading(false) }).catch(() => setLoading(false)) }, [])
  const login: typeof api.login = async (a, b) => { const p = await api.login(a, b); setProfile(p); return p }
  const createAccount: typeof api.createAccount = async (a, b, c) => { const p = await api.createAccount(a, b, c); setProfile(p); return p }
  const logout = async () => { await api.logout(); setProfile(null) }
  return <C.Provider value={{ profile, loading, login, createAccount, logout, setProfile }}>{children}</C.Provider>
}
