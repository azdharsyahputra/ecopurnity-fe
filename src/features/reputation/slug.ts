/** URL slug for public business profiles: "PT Solusi Kemasan Nusantara" → "pt-solusi-kemasan-nusantara". */
export const slugify = (name: string) =>
  name.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-')
