
export function passwordStrength(pw: string) {
  if (pw.length < 8) return 0
  return 1 + [/[a-z]/.test(pw) && /[A-Z]/.test(pw), /\d/.test(pw), /[^A-Za-z0-9]/.test(pw)].filter(Boolean).length
}

export const STRENGTH_LABEL = ['Terlalu pendek', 'Lemah', 'Cukup', 'Kuat', 'Sangat kuat']
