import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Loader2, MailCheck, XCircle } from 'lucide-react'
import { ApiError, fieldError } from '@/lib/api'
import { safeReturnTo } from '@/lib/utils'
import {
  ONBOARDING_GOAL_KEY, ONBOARDING_RETURN_KEY, useForgotPassword, useGoogleSignIn, useMe, useRegister, useResendVerification, useResetPassword, useSetMe,
  useVerifyEmail,
} from './hooks'
import { AuthHeading, Field, FormError, GoogleButton, MockOutbox, OrDivider, StrengthMeter } from './ui'
import { IconChip } from '@/components/IconChip'
import { Button } from '@/components/ui/button'

export function RegisterPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const register = useRegister()
  const setMe = useSetMe()
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value })

  function submit(e: FormEvent) {
    e.preventDefault()
    const goal = params.get('goal')
    const returnTo = params.get('returnTo')
    try {
      if (goal) sessionStorage.setItem(ONBOARDING_GOAL_KEY, goal)
      if (returnTo) sessionStorage.setItem(ONBOARDING_RETURN_KEY, safeReturnTo(returnTo))
    } catch {
      // optional pre-selection only
    }
    register.mutate(form, {
      onSuccess: (user) => {
        setMe(user)
        navigate('/verify-email', { replace: true })
      },
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <AuthHeading title="Buat akun">
        Sudah punya akun?{' '}
        <Link to={`/login?${params}`} className="font-medium text-primary hover:underline">Masuk</Link>
      </AuthHeading>
      <GoogleButton label="Daftar dengan Google" />
      <OrDivider />
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Nama lengkap" autoComplete="name" required value={form.name} onChange={set('name')} error={fieldError(register.error, 'name')} />
        <Field label="Email" type="email" autoComplete="email" required value={form.email} onChange={set('email')} error={fieldError(register.error, 'email')} />
        <div className="flex flex-col gap-2">
          <Field
            label="Password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={form.password}
            onChange={set('password')}
            error={fieldError(register.error, 'password')}
          />
          <StrengthMeter password={form.password} />
        </div>
        <FormError error={register.error} />
        {fieldError(register.error, 'email') && (
          <p className="text-sm">
            <Link to={`/login?${params}`} className="font-medium text-primary hover:underline">Masuk dengan email ini</Link>
          </p>
        )}
        <Button type="submit" className="mt-1 h-10" disabled={register.isPending}>
          {register.isPending ? 'Membuat akun…' : 'Buat akun'}
        </Button>
        <p className="text-xs text-muted-foreground">Dengan mendaftar kamu menyetujui Ketentuan Layanan dan Kebijakan Privasi Ecopurnity.</p>
      </form>
    </div>
  )
}

function ResendButton() {
  const resend = useResendVerification()
  const [cooldown, setCooldown] = useState(0)
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])
  return (
    <Button variant="outline" className="h-10" disabled={cooldown > 0 || resend.isPending} onClick={() => resend.mutate(undefined, { onSuccess: () => setCooldown(60) })}>
      {cooldown > 0 ? `Kirim ulang dalam ${cooldown} dtk` : 'Kirim ulang email'}
    </Button>
  )
}

export function VerifyEmailPage() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const { data: me } = useMe()
  const verify = useVerifyEmail()
  const fired = useRef(false)

  useEffect(() => {
    if (token && !fired.current) {
      fired.current = true // StrictMode runs effects twice; the token is single-use.
      verify.mutate(token)
    }
  }, [token, verify])

  if (token) {
    if (verify.isError)
      return (
        <div className="flex flex-col gap-4">
          <IconChip icon={XCircle} tone="red" size="lg" />
          <AuthHeading title="Link tidak valid">{verify.error.message}. Minta link baru dari halaman verifikasi.</AuthHeading>
          {me && <ResendButton />}
          {!me && <Button render={<Link to="/login" />} className="h-10">Masuk</Button>}
        </div>
      )
    if (verify.isSuccess)
      return (
        <div className="flex flex-col gap-4">
          <IconChip icon={CheckCircle2} tone="green" size="lg" />
          <AuthHeading title="Email terverifikasi">Akunmu sudah aktif sepenuhnya.</AuthHeading>
          <Button className="h-10" render={<Link to={me?.onboarded ? '/app' : '/onboarding'} />}>Lanjut</Button>
        </div>
      )
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 className="size-4 animate-spin" /> Memverifikasi…
      </div>
    )
  }

  if (!me) return <Navigate to="/login" replace />
  if (me.emailVerified) return <Navigate to={me.onboarded ? '/app' : '/onboarding'} replace />

  return (
    <div className="flex flex-col gap-5">
      <IconChip icon={MailCheck} tone="teal" size="lg" />
      <AuthHeading title="Cek email kamu">
        Kami mengirim link verifikasi ke <b className="text-foreground">{me.email}</b>. Klik link itu untuk mengaktifkan akun.
      </AuthHeading>
      <ResendButton />
      <MockOutbox kind="verify" />
      <p className="text-sm text-muted-foreground">
        Bisa diverifikasi nanti.{' '}
        <Link to="/onboarding" className="font-medium text-primary hover:underline">Lanjut atur profil</Link>
      </p>
    </div>
  )
}

export function ForgotPasswordPage() {
  const forgot = useForgotPassword()
  const [email, setEmail] = useState('')

  if (forgot.isSuccess)
    return (
      <div className="flex flex-col gap-5">
        <IconChip icon={MailCheck} tone="teal" size="lg" />
        {/* Same message whether or not the email exists (PRD §7). */}
        <AuthHeading title="Cek email kamu">Jika {email} terdaftar, kami sudah mengirim link untuk membuat password baru.</AuthHeading>
        <MockOutbox email={email} kind="reset" />
        <Link to="/login" className="text-sm font-medium text-primary hover:underline">Kembali ke halaman masuk</Link>
      </div>
    )

  return (
    <form onSubmit={(e) => (e.preventDefault(), forgot.mutate(email))} className="flex flex-col gap-5">
      <AuthHeading title="Lupa password">Masukkan email akunmu, kami kirim link untuk membuat password baru.</AuthHeading>
      <Field label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <FormError error={forgot.error} />
      <Button type="submit" className="h-10" disabled={forgot.isPending}>{forgot.isPending ? 'Mengirim…' : 'Kirim link reset'}</Button>
      <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground">Kembali ke halaman masuk</Link>
    </form>
  )
}

export function ResetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const reset = useResetPassword()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const mismatch = confirm.length > 0 && confirm !== password

  if (!token || (reset.error instanceof ApiError && reset.error.code === 'invalid_token'))
    return (
      <div className="flex flex-col gap-4">
        <IconChip icon={XCircle} tone="red" size="lg" />
        <AuthHeading title="Link reset tidak valid">Link sudah kedaluwarsa atau sudah dipakai. Minta link baru.</AuthHeading>
        <Button className="h-10" render={<Link to="/forgot-password" />}>Minta link baru</Button>
      </div>
    )

  if (reset.isSuccess)
    return (
      <div className="flex flex-col gap-4">
        <IconChip icon={CheckCircle2} tone="green" size="lg" />
        <AuthHeading title="Password diperbarui">Masuk dengan password barumu.</AuthHeading>
        <Button className="h-10" render={<Link to="/login" />}>Masuk</Button>
      </div>
    )

  return (
    <form onSubmit={(e) => (e.preventDefault(), !mismatch && reset.mutate({ token, password }))} className="flex flex-col gap-5">
      <AuthHeading title="Buat password baru" />
      <div className="flex flex-col gap-2">
        <Field label="Password baru" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} error={fieldError(reset.error, 'password')} />
        <StrengthMeter password={password} />
      </div>
      <Field label="Ulangi password" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} error={mismatch ? 'Password tidak sama' : undefined} />
      <FormError error={reset.error} />
      <Button type="submit" className="h-10" disabled={reset.isPending || mismatch}>{reset.isPending ? 'Menyimpan…' : 'Simpan password'}</Button>
    </form>
  )
}

/** OAuth redirect target: exchanges the provider code for a session. */
export function GoogleCallbackPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const google = useGoogleSignIn()
  const setMe = useSetMe()
  const fired = useRef(false)

  useEffect(() => {
    if (fired.current) return
    fired.current = true
    google.mutate(params.get('code') ?? '', {
      onSuccess: (user) => {
        setMe(user)
        navigate(user.onboarded ? safeReturnTo(params.get('returnTo')) : '/onboarding', { replace: true })
      },
    })
  }, [google, navigate, params, setMe])

  if (google.isError)
    return (
      <div className="flex flex-col gap-4">
        <IconChip icon={XCircle} tone="red" size="lg" />
        <AuthHeading title="Gagal masuk dengan Google">{google.error.message}</AuthHeading>
        <Button className="h-10" render={<Link to="/login" />}>Coba lagi</Button>
      </div>
    )
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
      <Loader2 className="size-4 animate-spin" /> Menghubungkan akun Google…
    </div>
  )
}

