import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useLogin, useSetMe } from './hooks'
import { safeReturnTo } from '@/lib/utils'
import { AuthHeading, GoogleButton, MOCKS, OrDivider } from './ui'
import { Field, FormError } from '@/components/form'
import { Button } from '@/components/ui/button'
import { Tag } from '@/components/Tag'
import { DEMO_ACCOUNTS } from '@/mocks/db'

export function LoginPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const login = useLogin()
  const setMe = useSetMe()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  function submit(e: FormEvent) {
    e.preventDefault()
    login.mutate(
      { email, password },
      {
        onSuccess: (user) => {
          setMe(user)
          navigate(user.onboarded ? safeReturnTo(params.get('returnTo')) : '/onboarding', { replace: true })
        },
      },
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <AuthHeading title="Masuk">
        Belum punya akun?{' '}
        <Link to={`/register?${params}`} className="font-medium text-primary hover:underline">Daftar gratis</Link>
      </AuthHeading>
      <GoogleButton />
      <OrDivider />
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aside={<Link to="/forgot-password" className="font-normal text-muted-foreground hover:text-foreground">Lupa password?</Link>}
        />
        <FormError error={login.error} />
        <Button type="submit" className="mt-1 h-10" disabled={login.isPending}>
          {login.isPending ? 'Memproses…' : 'Masuk'}
        </Button>
      </form>

      {MOCKS && (
        <div className="rounded-xl border border-dashed p-4">
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
