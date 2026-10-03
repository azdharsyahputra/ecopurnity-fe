import { describe, expect, it } from 'vitest'
import { mmApplicationErrors, mmApplyBlocked, newOrgErrors } from './roles'

const app = { organization: 'Koperasi Tani Maju', categories: ['agri' as const], experience: 'Lima tahun mengagregasi panen 200 petani kopi Garut.', documents: '' }

describe('market maker application', () => {
  it('validates fields', () => {
    expect(mmApplicationErrors(app)).toEqual({})
    expect(Object.keys(mmApplicationErrors({ organization: ' ', categories: [], experience: 'singkat', documents: '' }))).toEqual(['organization', 'categories', 'experience'])
  })

  it('blocks market makers and pending applicants, lets rejected reapply', () => {
    expect(mmApplyBlocked(['market_maker'])).toBeDefined()
    expect(mmApplyBlocked([], { status: 'pending' })).toBeDefined()
    expect(mmApplyBlocked([], { status: 'rejected' })).toBeUndefined()
    expect(mmApplyBlocked(['admin'], null)).toBeUndefined()
  })
})

describe('new organisation', () => {
  const org = { name: 'CV Maju Jaya', type: 'CV' as const, categoryId: 'packaging' as const }
  it('accepts optional NPWP of 15 or 16 digits', () => {
    expect(newOrgErrors(org)).toEqual({})
    expect(newOrgErrors({ ...org, npwp: '01.234.567.8-901.000' })).toEqual({})
    expect(newOrgErrors({ ...org, npwp: '3201234567890001' })).toEqual({})
    expect(newOrgErrors({ ...org, npwp: '1234' }).npwp).toBeDefined()
  })
  it('rejects short or duplicate names', () => {
    expect(newOrgErrors({ ...org, name: 'ab' }).name).toBeDefined()
    expect(newOrgErrors(org, ['cv maju jaya']).name).toBeDefined()
  })
})
