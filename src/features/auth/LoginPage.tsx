import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAppeal, useLogin, useSetMe } from './hooks'
import { safeReturnTo } from '@/lib/utils'
import { AuthHeading, GoogleButton, MOCKS, OrDivider } from './ui'
import { Field, FormError, PasswordField, TextareaField } from '@/components/form'
import { ApiError, fieldError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Tag } from '@/components/Tag'
import { DEMO_ACCOUNTS } from '@/mocks/db'

function Appeal({ email, password }: { email: string; password: string }) {
  const appeal = useAppeal()
  const [reason, setReason] = useState('')
  if (appeal.isSuccess) return <p className="rounded-lg border bg-card p-3 text-sm">Banding terkirim. Tim governance meninjau dalam 3 hari kerja; hasilnya tampil saat kamu mencoba masuk lagi.</p>
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-3">
      <TextareaField label="Ajukan banding" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} error={fieldError(appeal.error, 'reason')} hint="Jelaskan kenapa suspend ini perlu ditinjau ulang. Banding hanya bisa diajukan sekali." />
      {appeal.error && !fieldError(appeal.error, 'reason') && <FormError error={appeal.error} />}
      <Button type="button" variant="outline" className="h-9" disabled={appeal.isPending} onClick={() => appeal.mutate({ email, password, reason })}>Kirim banding</Button>
    </div>
  )
}

export function LoginPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const login = useLogin()
  const setMe = useSetMe()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

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
    <div>
      <div className="mb-6 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
        <span className="size-2 rounded-full bg-lime" /> Ecopurnity
      </div>
      <div className="flex flex-col gap-5">
        <div>
          <AuthHeading title="Masuk ke akunmu">
            Lanjutkan menemukan peluang dan mengelola aktivitasmu.
          </AuthHeading>
          <p className="mt-3 text-sm text-muted-foreground">
            Belum punya akun?{' '}
            <Link to={`/register?${params}`} className="font-medium text-primary hover:underline">Daftar gratis</Link>
          </p>
        </div>
        <GoogleButton />
        <OrDivider />
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <PasswordField
            label="Kata sandi"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            visible={showPassword}
            onToggle={() => setShowPassword((shown) => !shown)}
            aside={<Link to="/forgot-password" className="font-normal text-muted-foreground hover:text-foreground">Lupa kata sandi?</Link>}
          />
          <FormError error={login.error} />
          {login.error instanceof ApiError && login.error.code === 'account_suspended' && <Appeal email={email} password={password} />}
          <Button type="submit" className="mt-1 h-10 w-full" disabled={login.isPending}>
            {login.isPending ? 'Memproses…' : 'Masuk'}
          </Button>
        </form>

        {MOCKS && (
          <div className="rounded-xl border border-dashed bg-muted/30 p-4">
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
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-hover"
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
    </div>
  )
}
