import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Loader2, MailCheck, XCircle } from 'lucide-react'
import { ApiError, fieldError } from '@/lib/api'
import { safeReturnTo } from '@/lib/utils'
import {
  ONBOARDING_GOAL_KEY, ONBOARDING_RETURN_KEY, useForgotPassword, useGoogleSignIn, useMe, useRegister, useResendVerification, useResetPassword, useSetMe,
  useVerifyEmail,
} from './hooks'
import { AuthHeading, GoogleButton, MockOutbox, OrDivider, StrengthMeter } from './ui'
import { Field, FormError, PasswordField } from '@/components/form'
import { IconChip } from '@/components/IconChip'
import { Button } from '@/components/ui/button'

export function RegisterPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const register = useRegister()
  const setMe = useSetMe()
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [confirmAttempted, setConfirmAttempted] = useState(false)
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value })

  function submit(e: FormEvent) {
    e.preventDefault()
    setConfirmAttempted(true)
    if (form.password !== form.confirmPassword) return

    const goal = params.get('goal')
    const returnTo = params.get('returnTo')
    try {
      if (goal) sessionStorage.setItem(ONBOARDING_GOAL_KEY, goal)
      if (returnTo) sessionStorage.setItem(ONBOARDING_RETURN_KEY, safeReturnTo(returnTo))
    } catch {
      // optional pre-selection only
    }
    register.mutate({ name: form.name, email: form.email, password: form.password }, {
      onSuccess: (user) => {
        setMe(user)
        navigate('/verify-email', { replace: true })
      },
    })
  }

  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm sm:p-7">
      <div className="mb-6 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
        <span className="size-2 rounded-full bg-lime" /> Ecopurnity
      </div>
      <div className="flex flex-col gap-5">
        <div>
          <AuthHeading title="Mulai dari sini">
            Buat akun untuk menemukan peluang dan terhubung dengan jaringan Ecopurnity.
          </AuthHeading>
          <p className="mt-3 text-sm text-muted-foreground">
            Sudah punya akun?{' '}
            <Link to={`/login?${params}`} className="font-medium text-primary hover:underline">Masuk</Link>
          </p>
        </div>
        <GoogleButton label="Daftar dengan Google" />
        <OrDivider />
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Nama lengkap" autoComplete="name" required value={form.name} onChange={set('name')} error={fieldError(register.error, 'name')} />
          <Field label="Email" type="email" autoComplete="email" required value={form.email} onChange={set('email')} error={fieldError(register.error, 'email')} />
          <div className="flex flex-col gap-2">
            <PasswordField
              label="Password"
              autoComplete="new-password"
              required
              minLength={8}
              value={form.password}
              onChange={set('password')}
              error={fieldError(register.error, 'password')}
              visible={showPassword}
              onToggle={() => setShowPassword((shown) => !shown)}
            />
            <StrengthMeter password={form.password} />
          </div>
          <PasswordField
            label="Konfirmasi password"
            autoComplete="new-password"
            required
            minLength={8}
            value={form.confirmPassword}
            onChange={set('confirmPassword')}
            error={confirmAttempted && form.password !== form.confirmPassword ? 'Password belum sama.' : undefined}
            visible={showConfirmPassword}
            onToggle={() => setShowConfirmPassword((shown) => !shown)}
          />
          <FormError error={register.error} />
          {fieldError(register.error, 'email') && (
            <p className="text-sm">
              <Link to={`/login?${params}`} className="font-medium text-primary hover:underline">Masuk dengan email ini</Link>
            </p>
          )}
          <Button type="submit" className="mt-1 h-10 w-full" disabled={register.isPending}>
            {register.isPending ? 'Membuat akun…' : 'Buat akun'}
          </Button>
          <p className="text-center text-xs leading-relaxed text-muted-foreground">Dengan mendaftar kamu menyetujui Ketentuan Layanan dan Kebijakan Privasi Ecopurnity.</p>
        </form>
      </div>
    </div>
  )
}

function ResendButton() {
  const resend = useResendVerification()
  const [cooldown, setCooldown] = useState(60) // a code was just sent with the registration
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="outline"
        className="h-10"
        disabled={cooldown > 0 || resend.isPending}
        onClick={() =>
          resend.mutate(undefined, {
            onSuccess: () => setCooldown(60),
            onError: (e) => e instanceof ApiError && e.code === 'resend_cooldown' && setCooldown(Number(/\d+/.exec(e.message)?.[0] ?? 60)),
          })
        }
      >
        {cooldown > 0 ? `Kirim ulang kode dalam ${cooldown} dtk` : 'Kirim ulang kode'}
      </Button>
      {resend.isSuccess && cooldown > 50 && <p className="text-xs text-muted-foreground" role="status">Kode baru sudah dikirim.</p>}
    </div>
  )
}

export function VerifyEmailPage() {
  const { data: me } = useMe()
  const verify = useVerifyEmail()
  const [code, setCode] = useState('')

  if (!me) return <Navigate to="/login" replace />
  if (verify.isSuccess)
    return (
      <div className="flex flex-col gap-4">
        <IconChip icon={CheckCircle2} tone="green" size="lg" />
        <AuthHeading title="Email terverifikasi">Akunmu sudah aktif sepenuhnya.</AuthHeading>
        <Button className="h-10" render={<Link to={me.onboarded ? '/app' : '/onboarding'} />}>Lanjut</Button>
      </div>
    )
  if (me.emailVerified) return <Navigate to={me.onboarded ? '/app' : '/onboarding'} replace />

  const submit = (value: string) => {
    if (/^\d{6}$/.test(value) && !verify.isPending) verify.mutate(value)
  }
  return (
    <form className="flex flex-col gap-5" onSubmit={(e) => (e.preventDefault(), submit(code))}>
      <IconChip icon={MailCheck} tone="teal" size="lg" />
      <AuthHeading title="Masukkan kode verifikasi">
        Kami mengirim 6 digit kode ke <b className="text-foreground">{me.email}</b>. Kode berlaku 10 menit.
      </AuthHeading>
      <Field
        label="Kode verifikasi"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        autoFocus
        value={code}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, '').slice(0, 6)
          setCode(v)
          if (v.length === 6) submit(v) // paste or the last digit submits right away
        }}
        error={fieldError(verify.error, 'code')}
        className="h-12 text-center font-mono text-2xl tracking-[0.5em]"
      />
      {verify.error && !fieldError(verify.error, 'code') && <FormError error={verify.error} />}
      <Button type="submit" className="h-10" disabled={code.length !== 6 || verify.isPending}>
        {verify.isPending ? <><Loader2 className="animate-spin" /> Memverifikasi…</> : 'Verifikasi'}
      </Button>
      <ResendButton />
      <MockOutbox kind="verify" />
      <p className="text-sm text-muted-foreground">
        Bisa diverifikasi nanti.{' '}
        <Link to="/onboarding" className="font-medium text-primary hover:underline">Lanjut atur profil</Link>
      </p>
    </form>
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
