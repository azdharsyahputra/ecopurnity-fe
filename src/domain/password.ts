/** 0–4: length ≥ 8, then one point each for mixed case, a digit, a symbol. Length < 8 is always 0. */
export function passwordStrength(pw: string) {
  if (pw.length < 8) return 0
  return 1 + [/[a-z]/.test(pw) && /[A-Z]/.test(pw), /\d/.test(pw), /[^A-Za-z0-9]/.test(pw)].filter(Boolean).length
}

export const STRENGTH_LABEL = ['Terlalu pendek', 'Lemah', 'Cukup', 'Kuat', 'Sangat kuat']
