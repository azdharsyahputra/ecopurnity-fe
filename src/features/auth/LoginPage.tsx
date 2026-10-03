import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useLogin } from './hooks'
import { safeReturnTo } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tag } from '@/components/Tag'
import { DEMO_ACCOUNTS } from '@/mocks/db'

const MOCKS = import.meta.env.VITE_USE_MOCKS !== 'false'

// ponytail: email/password only for F0. Google OAuth, register, verify and reset arrive in F1 (PRD §7).
export function LoginPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const login = useLogin()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  function submit(e: FormEvent) {
    e.preventDefault()
    login.mutate({ email, password }, { onSuccess: () => navigate(safeReturnTo(params.get('returnTo')), { replace: true }) })
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Masuk</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Belum punya akun?{' '}
        <Link to={`/register?${params}`} className="font-medium text-primary hover:underline">
          Daftar gratis
        </Link>
      </p>

      <form onSubmit={submit} className="mt-8 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Email
          <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-10" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          <span className="flex justify-between">
            Password
            <Link to="/forgot-password" className="font-normal text-muted-foreground hover:text-foreground">
              Lupa password?
            </Link>
          </span>
          <Input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-10"
          />
        </label>
        {login.isError && (
          <p role="alert" className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--tag-red-bg)', color: 'var(--tag-red-fg)' }}>
            {login.error.message}
          </p>
        )}
        <Button type="submit" size="lg" className="mt-2 h-10" disabled={login.isPending}>
          {login.isPending ? 'Memproses…' : 'Masuk'}
        </Button>
      </form>

      {MOCKS && (
        <div className="mt-10 rounded-xl border border-dashed p-4">
          <p className="text-xs font-medium text-muted-foreground">Akun demo (mock) · klik untuk mengisi</p>
          <ul className="mt-2 flex flex-col">
            {DEMO_ACCOUNTS.map((a) => (
              <li key={a.email}>
                <button
                  type="button"
                  onClick={() => {
                    setEmail(a.email)
                    setPassword(a.password)
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-hover"
                >
                  <span className="flex-1 truncate">{a.name}</span>
                  <Tag tone={a.tone}>{a.role}</Tag>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
