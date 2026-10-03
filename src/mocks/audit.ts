import type { AuditEntry } from '@/domain/types'

// Append-only audit log shared by every workspace's mock handlers (PRD §12.6).

const KEY = 'ecp-mock-audit'
const log: AuditEntry[] = (() => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    return []
  }
})()

let seq = 0

export function audit(entry: Omit<AuditEntry, 'id' | 'at'>): AuditEntry {
  const full = { ...entry, id: `aud-${Date.now().toString(36)}${(seq++).toString(36)}`, at: new Date().toISOString() }
  log.unshift(full)
  log.length = Math.min(log.length, 500)
  try {
    localStorage.setItem(KEY, JSON.stringify(log))
  } catch {
    // per-tab only
  }
  return full
}

/** Newest first, optionally scoped to one entity. */
export const auditLog = (filter?: { type?: AuditEntry['entity']['type']; id?: string }) =>
  log.filter((e) => (!filter?.type || e.entity.type === filter.type) && (!filter?.id || e.entity.id === filter.id))
