import { delay, http, HttpResponse } from 'msw'
import type { ActivityEvent, AuctionDetail, Market, MarketDetail } from '@/domain/types'
import type { MarketStatus } from '@/domain/status'
import { statusMeta } from '@/domain/status'
import { MECHANISMS, OBJECTIVES } from '@/domain/catalog'
import { formatIdr, formatNumber } from '@/domain/format'
import {
  canMove, lowLiquidity, PIPELINE_STAGES, ROUND_TYPE, type CreateMarketInput, type CreateRoundInput, type DisputeAction, type MarketStatusAction, type MmAlert,
  type MmAnalytics, type MmMarketOps, type MmMarketRow, type MmOverview, type MmParticipant, type ParticipantAction, type PipelineCard,
  type PipelineStage, type RoundResult,
} from '@/domain/mm'
import { activeVersion, addVersion, diffRules, rulesToLabeled, validateRules, VISIBILITY, type MarketRules } from '@/domain/marketRules'
import { audit, auditLog } from './audit'
import { db } from './db'
import { economy, toAuction, toOpportunity } from './economy'
import { actor, currentRound, emitEvent, hash, isMaker, mm, mmId, notifyMarket, operatedIds, ops, saveMm, startedRounds, type MarketOps } from './mm'
import { allPersonal, notify } from './personal'

// Market Maker API (PRD §10). Every mutation is audited; anything that changes a participant's market notifies them.

const api = (path: string) => `/api/v1${path}`
const fail = (status: number, code: string, message: string, fields?: Record<string, string>) =>
  HttpResponse.json({ error: { code, message, fields } }, { status })
const now = () => new Date().toISOString()
const isLive = (a: { status: string }) => a.status === 'live' || a.status === 'extended'
const label = (s: MarketStatus) => statusMeta('market', s).label

type Ctx = { userId: string; params: Record<string, string | readonly string[] | undefined>; request: Request }

/** Session + market_maker capability, else 401/403. */
const maker = (fn: (ctx: Ctx) => Response | Promise<Response>) =>
  async ({ params, request }: { params: Ctx['params']; request: Request }) => {
    await delay(250)
    const userId = db.sessionUserId
    if (!userId || !db.users.some((u) => u.id === userId)) return fail(401, 'unauthenticated', 'Belum login')
    if (!isMaker(userId)) return fail(403, 'forbidden', 'Butuh capability Market Maker')
    return fn({ userId, params, request })
  }

/** One of this maker's markets, with its ops state; 404 for anyone else's. */
function mine(userId: string, id: unknown) {
  if (!operatedIds(userId).includes(String(id))) return undefined
  const m = economy.markets.find((x) => x.id === id)!
  return { m, o: ops(m.id) }
}

const summary = ({ description: _d, rules: _r, priceHistory: _p, activity: _a, auctions: _u, ...m }: MarketDetail): Market => m

function alerts(m: Market, o: MarketOps): MmAlert[] {
  if (m.status === 'closed') return []
  const pending = o.participants.filter((p) => p.status === 'pending').length
  const disputes = o.disputes.filter((d) => d.status !== 'resolved').length
  return [
    ...(lowLiquidity(m) ? [{ kind: 'low_liquidity' as const, label: `Likuiditas rendah (${m.buyers}:${m.suppliers})` }] : []),
    ...(disputes ? [{ kind: 'disputes' as const, label: `${disputes} dispute terbuka` }] : []),
    ...(pending ? [{ kind: 'approvals' as const, label: `${pending} menunggu approval` }] : []),
  ]
}

const audited = (userId: string, m: Market, action: string, extra: { reason?: string; changes?: { field: string; before?: string; after?: string }[] } = {}) =>
  audit({ actor: actor(userId), action, entity: { type: 'market', id: m.id, label: m.name }, ...extra })

// ── Prices per round (recorded results are derived, never editable) ──

function results(m: MarketDetail, o: MarketOps): RoundResult[] {
  const up = ROUND_TYPE[m.mechanism] === 'forward'
  const past: RoundResult[] = (o.pastRounds ? m.priceHistory.slice(-o.pastRounds) : []).map((p, i) => ({
    round: i + 1, title: `Round ${i + 1}`, status: 'closed', at: p.week, openingIdr: up ? p.lowIdr : p.highIdr, medianIdr: p.medianIdr,
    clearingIdr: Math.round(up ? p.medianIdr + (p.highIdr - p.medianIdr) * 0.6 : p.medianIdr - (p.medianIdr - p.lowIdr) * 0.6),
  }))
  const real = startedRounds(m.id)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    .map((a, i): RoundResult => {
      const live = isLive(a)
      const hidden = a.type === 'sealed' && live
      const best = a.type === 'dutch' ? a.currentPriceIdr : economy.bestPrice.get(a.id)
      const prices = a.bids.map((b) => b.priceIdr).sort((x, y) => x - y)
      const median = prices.length ? prices[Math.floor(prices.length / 2)] : best !== undefined ? Math.round((a.openingPriceIdr + best) / 2) : undefined
      return {
        round: past.length + i + 1, auctionId: a.id, title: a.title, status: live ? 'live' : 'closed', at: a.startsAt, openingIdr: a.openingPriceIdr,
        currentIdr: live && !hidden ? best : undefined, medianIdr: hidden ? undefined : median, clearingIdr: live ? undefined : best,
      }
    })
  return [...past, ...real]
}

// ── Analytics ────────────────────────────────────────────────────

const mid = (m: Market) => (m.priceRange.minIdr + m.priceRange.maxIdr) / 2
const weekLabel = (k: number) => {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7 * k)
  return d.toISOString().slice(0, 10)
}

/** Matched demand and supply utilization now, weighted by market value so units don't matter. */
function efficiency(markets: Market[]) {
  let demand = 0, supply = 0, matched = 0
  for (const m of markets) {
    const f = 0.78 + (hash(m.id) % 12) / 100
    const q = Math.min(m.demand.value, m.supply.value) * f * mid(m)
    demand += m.demand.value * mid(m)
    supply += m.supply.value * mid(m)
    matched += q
  }
  return { matched: demand ? matched / demand : 0, utilization: supply ? matched / supply : 0 }
}

function analytics(markets: MarketDetail[]): MmAnalytics {
  const buyers = markets.reduce((s, m) => s + m.buyers, 0)
  const suppliers = markets.reduce((s, m) => s + m.suppliers, 0)
  const live = economy.auctions.filter((a) => isLive(a) && markets.some((m) => m.id === a.marketId))
  const eff = efficiency(markets)
  const seed = markets.reduce((s, m) => s + hash(m.id), 0)
  // Latest week (k = 0) is exact so it matches the overview's matched-demand tile.
  const wobble = (k: number) => (k === 0 ? 1 : 0.97 + ((seed >>> k) % 7) / 100)
  const weeks = Array.from({ length: 8 }, (_, i) => 7 - i)
  return {
    liquidity: {
      buyers, suppliers, ratio: suppliers ? buyers / suppliers : 0,
      activeOrders: live.reduce((s, a) => s + a.bidCount, 0) + Math.round((buyers + suppliers) * 0.35),
    },
    byMarket: markets.map((m) => ({ id: m.id, name: m.name, buyers: m.buyers, suppliers: m.suppliers })),
    efficiency: weeks.map((k) => {
      const matched = Math.min(1, eff.matched * (1 - k * 0.018) * wobble(k))
      return { week: weekLabel(k), matched, unmatched: 1 - matched, utilization: Math.min(1, eff.utilization * (1 - k * 0.015) * wobble(k + 3)) }
    }),
    growth: weeks.map((k) => {
      const t = 1 - k * 0.045
      const participants = Math.round((buyers + suppliers) * t)
      const transactions = Math.round(participants * 0.32 * t * wobble(k))
      return { week: weekLabel(k), participants, transactions, connections: Math.round(participants * 1.9 * t), repeat: Math.round(transactions * (0.22 + 0.2 * (1 - k / 7))) }
    }),
    priceDiscovery: markets.map((m) => ({ marketId: m.id, name: m.name, unit: m.priceRange.unit, rounds: results(m, ops(m.id)) })),
  }
}

// ── Participants & rounds helpers ────────────────────────────────

const counts = (m: Market, p: MmParticipant, delta: 1 | -1) => {
  if (p.role === 'buyer') m.buyers = Math.max(0, m.buyers + delta)
  else m.suppliers = Math.max(0, m.suppliers + delta)
}

const PARTICIPANT_VERB: Record<ParticipantAction, string> = { approve: 'Approve', reject: 'Tolak', verify: 'Verifikasi supplier', suspend: 'Suspend' }

export const mmHandlers = [
  // Operations overview (PRD §10.1)
  http.get(api('/mm/overview'), maker(({ userId }) => {
    const markets = operatedIds(userId).map((id) => economy.markets.find((m) => m.id === id)!)
    const rows: MmMarketRow[] = markets.map((m) => ({
      ...summary(m), liveRounds: economy.auctions.filter((a) => a.marketId === m.id && isLive(a)).length, alerts: alerts(m, ops(m.id)),
    }))
    const live = economy.auctions.filter((a) => isLive(a) && markets.some((m) => m.id === a.marketId))
    const bids: ActivityEvent[] = live.flatMap((a) => a.bids.slice(0, 2).map((b) => ({
      id: `bid-${b.id}`, type: 'bid_placed' as const, title: `${b.bidder} bid di ${a.title}`, amountIdr: b.priceIdr * a.lot.quantity.value, at: b.at,
    })))
    const overview: MmOverview = {
      stats: {
        activeMarkets: markets.filter((m) => m.status === 'active').length,
        participants: markets.reduce((s, m) => s + m.buyers + m.suppliers, 0),
        activeAuctions: live.length,
        volumeIdr: markets.reduce((s, m) => s + m.volume30dIdr, 0),
        matchedDemand: efficiency(markets).matched,
      },
      markets: rows,
      events: [...(mm.events[userId] ?? []), ...bids].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 15),
      liveAuctions: live.map((a) => ({ id: a.id, title: a.title })),
    }
    saveMm() // persist bot-driven round state now and then
    return HttpResponse.json(overview)
  })),

  // Opportunity pipeline (PRD §10.2)
  http.get(api('/mm/opportunities'), maker(() => {
    const cards: PipelineCard[] = economy.opportunities.map((o) => {
      const p = mm.pipeline[o.id]
      return {
        ...toOpportunity(o), mechanismReason: o.mechanismReason,
        stage: p?.stage ?? (o.status === 'closed' ? 'dismissed' : o.status), dismissReason: p?.reason, marketId: p?.marketId ?? o.markets[0]?.id,
      }
    })
    return HttpResponse.json(cards)
  })),
  http.post(api('/mm/opportunities/:id/stage'), maker(async ({ userId, params, request }) => {
    const o = economy.opportunities.find((x) => x.id === params.id)
    if (!o) return fail(404, 'not_found', 'Opportunity tidak ditemukan')
    const { stage, reason } = (await request.json()) as { stage: PipelineStage; reason?: string }
    const from: PipelineStage = mm.pipeline[o.id]?.stage ?? (o.status === 'closed' ? 'dismissed' : o.status)
    if (!canMove(from, stage)) return fail(409, 'invalid_transition', 'Perpindahan tahap ini tidak diizinkan')
    if (stage === 'dismissed' && !reason?.trim()) return fail(422, 'validation', 'Alasan wajib diisi', { reason: 'Jelaskan kenapa opportunity ini di-dismiss' })
    mm.pipeline[o.id] = { stage, reason: stage === 'dismissed' ? reason!.trim() : undefined }
    o.status = stage === 'evaluating' ? 'detected' : stage
    audit({
      actor: actor(userId), action: `Pipeline: ${PIPELINE_STAGES[from].label} → ${PIPELINE_STAGES[stage].label}`, entity: { type: 'opportunity', id: o.id, label: `${o.code} · ${o.title}` },
      reason: stage === 'dismissed' ? reason!.trim() : undefined, changes: [{ field: 'Tahap', before: PIPELINE_STAGES[from].label, after: PIPELINE_STAGES[stage].label }],
    })
    emitEvent(userId, { type: 'opportunity_detected', title: `${o.title} dipindah ke ${PIPELINE_STAGES[stage].label}` })
    saveMm()
    return new HttpResponse(null, { status: 204 })
  })),

  // Market creation wizard (PRD §10.3)
  http.post(api('/mm/markets'), maker(async ({ userId, request }) => {
    const input = (await request.json()) as CreateMarketInput
    const fields: Record<string, string> = { ...validateRules(input.rules) }
    if (!input.name?.trim()) fields.name = 'Nama market wajib diisi'
    if (!input.unit?.trim()) fields.unit = 'Isi satuan'
    if (!(input.referencePriceIdr > 0)) fields.referencePriceIdr = 'Isi harga acuan per unit'
    if (!(input.demand > 0)) fields.demand = 'Isi perkiraan demand'
    if (Object.keys(fields).length) return fail(422, 'validation', 'Periksa kembali isian market', fields)
    const o = input.opportunityId ? economy.opportunities.find((x) => x.id === input.opportunityId) : undefined
    const user = db.users.find((u) => u.id === userId)!
    const id = mmId('mkt')
    const unit = input.unit.trim()
    const status: MmParticipant['status'] = input.approval === 'auto' ? 'active' : 'pending'
    const participants: MmParticipant[] = input.autoInvite && o
      ? o.participantsPreview.map((p, i) => ({ ...p, id: `${id}-p${i}`, status, reputation: 80 + ((hash(p.name) >>> 3) % 18), joinedAt: now() }))
      : []
    const active = participants.filter((p) => p.status === 'active')
    const ref = input.referencePriceIdr
    const m: MarketDetail = {
      id, code: `MKT-${400 + economy.markets.length}`, name: input.name.trim(), categoryId: input.categoryId, region: input.rules.region,
      objective: input.objective, mechanism: input.mechanism, status: 'active', maker: { name: user.orgs[0]?.orgName ?? user.name, kind: 'business', verified: true },
      demand: { value: input.demand, unit }, supply: { value: Math.max(0, input.supply), unit },
      buyers: active.filter((p) => p.role === 'buyer').length, suppliers: active.filter((p) => p.role === 'supplier').length,
      priceRange: { minIdr: Math.round(ref * 0.95), maxIdr: Math.round(ref * 1.05), unit }, volume30dIdr: 0, activeAuctions: 0,
      description: `${input.name.trim()} dibentuk oleh ${user.orgs[0]?.orgName ?? user.name}${o ? ` dari opportunity ${o.code}` : ''}. Objective ${OBJECTIVES[input.objective].toLowerCase()} dengan mekanisme ${MECHANISMS[input.mechanism].label.toLowerCase()}.`,
      rules: rulesToLabeled(input.rules, unit),
      priceHistory: [{ week: now().slice(0, 10), medianIdr: ref, lowIdr: Math.round(ref * 0.97), highIdr: Math.round(ref * 1.03) }],
      activity: [], auctions: [],
    }
    economy.markets.unshift(m)
    mm.createdMarkets.unshift(m)
    ;(mm.operated[userId] ??= []).push(id)
    mm.ops[id] = {
      participants, disputes: [], pastRounds: 0, opportunityId: o?.id,
      ruleVersions: [{ version: 1, rules: input.rules, effectiveFromRound: 1, createdAt: now(), author: actor(userId) }],
      settings: { approval: input.approval, supplierVerification: input.supplierVerification },
    }
    db.stats.activeMarkets++
    if (o) {
      o.status = 'market_live'
      o.markets.push(m)
      mm.pipeline[o.id] = { stage: 'market_live', marketId: id }
      for (const [uid, p] of allPersonal()) {
        if (p.opportunities[o.id]) notify(uid, { type: 'new_market', title: `Market baru dari ${o.title}`, body: `${m.name} sudah live. Gabung untuk ikut round pertama.`, href: `/markets/${id}` })
      }
    }
    audited(userId, m, 'Publish market', {
      changes: [
        { field: 'Status', after: label('active') }, { field: 'Mekanisme', after: MECHANISMS[m.mechanism].label },
        ...(o ? [{ field: 'Opportunity', before: o.code, after: 'Market Live' }] : []),
      ],
    })
    emitEvent(userId, { type: 'market_formed', title: `Market terbentuk: ${m.name}` }, true)
    saveMm()
    return HttpResponse.json({ id }, { status: 201 })
  })),

  // Market operations detail (PRD §10.4)
  http.get(api('/mm/markets/:id'), maker(({ userId, params }) => {
    const x = mine(userId, params.id)
    if (!x) return fail(404, 'not_found', 'Market tidak ditemukan atau bukan operasimu')
    const { m, o } = x
    const detail: MmMarketOps = {
      market: { ...m, auctions: economy.auctions.filter((a) => a.marketId === m.id).map(toAuction) },
      participants: o.participants, disputes: o.disputes, ruleVersions: o.ruleVersions, currentRound: currentRound(m.id, o),
      rounds: economy.auctions.filter((a) => a.marketId === m.id).map(toAuction), results: results(m, o), settings: o.settings, alerts: alerts(m, o),
    }
    return HttpResponse.json(detail)
  })),
  http.get(api('/mm/markets/:id/audit'), maker(({ userId, params }) => {
    if (!mine(userId, params.id)) return fail(404, 'not_found', 'Market tidak ditemukan')
    return HttpResponse.json(auditLog({ type: 'market', id: String(params.id) }))
  })),

  http.post(api('/mm/markets/:id/participants/:pid'), maker(async ({ userId, params, request }) => {
    const x = mine(userId, params.id)
    const p = x?.o.participants.find((y) => y.id === params.pid)
    if (!x || !p) return fail(404, 'not_found', 'Participant tidak ditemukan')
    const { m } = x
    const { action, reason } = (await request.json()) as { action: ParticipantAction; reason?: string }
    const allowed = { approve: p.status === 'pending', reject: p.status === 'pending', verify: p.role === 'supplier' && !p.verified && p.status !== 'rejected', suspend: p.status === 'active' }
    if (!allowed[action]) return fail(409, 'invalid_transition', 'Aksi ini tidak tersedia untuk status participant sekarang')
    if ((action === 'reject' || action === 'suspend') && !reason?.trim()) return fail(422, 'validation', 'Alasan wajib diisi', { reason: 'Alasan wajib diisi dan akan tercatat di audit log' })
    const before = p.status
    if (action === 'approve') { p.status = 'active'; counts(m, p, 1) }
    if (action === 'reject') p.status = 'rejected'
    if (action === 'suspend') { p.status = 'suspended'; counts(m, p, -1) }
    if (action === 'verify') p.verified = true
    p.note = reason?.trim() || p.note
    audited(userId, m, `${PARTICIPANT_VERB[action]} participant ${p.name}`, {
      reason: reason?.trim() || undefined,
      changes: action === 'verify' ? [{ field: 'Verifikasi', before: 'Belum', after: 'Terverifikasi' }] : [{ field: 'Status', before, after: p.status }],
    })
    if (p.userId) {
      const body = { approve: `Kamu sekarang peserta aktif ${m.name}.`, reject: `Pendaftaranmu ditolak: ${reason?.trim()}`, suspend: `Kamu disuspend dari ${m.name}: ${reason?.trim()}`, verify: `Status supplier kamu di ${m.name} terverifikasi.` }[action]
      notify(p.userId, { type: 'new_market', title: `${m.name}: ${PARTICIPANT_VERB[action].toLowerCase()}`, body, href: `/markets/${m.id}` })
    }
    emitEvent(userId, { type: 'market_formed', title: `${PARTICIPANT_VERB[action]} ${p.name} di ${m.name}` })
    saveMm()
    return HttpResponse.json(p)
  })),

  http.post(api('/mm/markets/:id/rounds'), maker(async ({ userId, params, request }) => {
    const x = mine(userId, params.id)
    if (!x) return fail(404, 'not_found', 'Market tidak ditemukan')
    const { m, o } = x
    if (m.status !== 'active' && m.status !== 'formation') return fail(409, 'market_inactive', `Market berstatus ${label(m.status)}; round baru tidak bisa dibuka`)
    const input = (await request.json()) as CreateRoundInput
    const fields: Record<string, string> = {}
    if (!input.title?.trim()) fields.title = 'Isi judul round'
    if (!(input.quantity > 0)) fields.quantity = 'Kuantitas harus lebih dari 0'
    if (!(input.openingPriceIdr > 0)) fields.openingPriceIdr = 'Isi harga pembuka'
    if (!(input.durationMinutes > 0)) fields.durationMinutes = 'Pilih durasi'
    if (Object.keys(fields).length) return fail(422, 'validation', 'Periksa isian round', fields)

    const round = currentRound(m.id, o) + 1
    const rules: MarketRules = activeVersion(o.ruleVersions, round).rules
    const type = ROUND_TYPE[m.mechanism]
    const visibility = type === 'sealed' ? 'sealed' : rules.visibility
    const unit = m.priceRange.unit
    const step = Math.max(1, Math.round((input.openingPriceIdr * rules.minStepPct) / 100))
    const id = mmId('auc')
    const a: AuctionDetail = {
      id, code: `AUC-${id.slice(-4).toUpperCase()}`, title: input.title.trim(), marketId: m.id, marketName: m.name, categoryId: m.categoryId,
      type, status: 'live', visibility, lot: { item: m.name, quantity: { value: input.quantity, unit }, spec: `Round ${round}, aturan market v${activeVersion(o.ruleVersions, round).version}` },
      startsAt: now(), endsAt: new Date(Date.now() + input.durationMinutes * 60_000).toISOString(), participants: 0, bidCount: 0,
      openingPriceIdr: input.openingPriceIdr, currentPriceIdr: visibility === 'full' || type === 'dutch' ? input.openingPriceIdr : undefined,
      minStepIdr: step, extension: { windowMinutes: 2, extendMinutes: 5 }, bids: [],
      rules: [
        { label: 'Round', value: `${round} di ${m.name}` },
        { label: 'Visibilitas bid', value: VISIBILITY[visibility] },
        { label: type === 'dutch' ? 'Penurunan harga' : 'Langkah minimum', value: `${formatIdr(step)} per ${unit}` },
        { label: 'Perpanjangan otomatis', value: '+5 menit jika ada bid di 2 menit terakhir' },
        ...rulesToLabeled(rules, unit).filter((r) => ['Eligibility', 'Penetapan pemenang', 'Wilayah'].includes(r.label)),
      ],
    }
    economy.auctions.unshift(a)
    economy.bestPrice.set(id, input.openingPriceIdr)
    mm.rounds.unshift(a)
    m.activeAuctions++
    const before = m.status
    if (m.status === 'formation') m.status = 'active'
    // The round that just started may switch the public rule list to a pending version.
    m.rules = rulesToLabeled(rules, unit)
    audited(userId, m, `Buka round ${round}: ${a.title}`, {
      changes: [
        { field: 'Round', after: `${round} (${a.code})` }, { field: 'Harga pembuka', after: formatIdr(input.openingPriceIdr) },
        ...(before !== m.status ? [{ field: 'Status', before: label(before), after: label(m.status) }] : []),
      ],
    })
    notifyMarket(m.id, { type: 'auction_invitation', title: `Round ${round} dibuka di ${m.name}`, body: `${a.title}: ${formatNumber(input.quantity)} ${unit}, harga pembuka ${formatIdr(input.openingPriceIdr)}.`, href: `/auctions/${id}` })
    emitEvent(userId, { type: 'auction_started', title: `Round ${round} dibuka: ${a.title}`, amountIdr: input.openingPriceIdr * input.quantity }, true)
    saveMm()
    return HttpResponse.json({ id }, { status: 201 })
  })),

  http.put(api('/mm/markets/:id/rules'), maker(async ({ userId, params, request }) => {
    const x = mine(userId, params.id)
    if (!x) return fail(404, 'not_found', 'Market tidak ditemukan')
    const { m, o } = x
    if (m.status === 'closed') return fail(409, 'market_closed', 'Market sudah ditutup')
    const { rules, reason } = (await request.json()) as { rules: MarketRules; reason?: string }
    const fields = validateRules(rules)
    if (Object.keys(fields).length) return fail(422, 'validation', 'Aturan belum valid', fields)
    const latest = o.ruleVersions[o.ruleVersions.length - 1]
    const changes = diffRules(latest.rules, rules, m.priceRange.unit)
    if (!changes.length) return fail(422, 'no_change', 'Tidak ada perubahan dibanding versi terakhir')
    const round = currentRound(m.id, o)
    o.ruleVersions = addVersion(o.ruleVersions, rules, round, actor(userId), reason?.trim() || undefined)
    audited(userId, m, `Aturan v${o.ruleVersions.length} dibuat (berlaku mulai round ${round + 1})`, { reason: reason?.trim() || undefined, changes })
    notifyMarket(m.id, { type: 'new_market', title: `Aturan ${m.name} berubah`, body: `${changes.length} perubahan berlaku mulai round ${round + 1}. Round yang sudah berjalan tidak terpengaruh.`, href: `/markets/${m.id}` })
    emitEvent(userId, { type: 'market_formed', title: `Aturan v${o.ruleVersions.length} untuk ${m.name}` })
    saveMm()
    return HttpResponse.json(o.ruleVersions)
  })),

  http.post(api('/mm/markets/:id/status'), maker(async ({ userId, params, request }) => {
    const x = mine(userId, params.id)
    if (!x) return fail(404, 'not_found', 'Market tidak ditemukan')
    const { m } = x
    const { action, reason } = (await request.json()) as { action: MarketStatusAction; reason?: string }
    const next: Record<MarketStatusAction, [MarketStatus[], MarketStatus]> = {
      pause: [['active', 'formation'], 'paused'], resume: [['paused'], 'active'], close: [['active', 'formation', 'paused'], 'closed'],
    }
    const [from, to] = next[action]
    if (!from.includes(m.status)) return fail(409, 'invalid_transition', `Market berstatus ${label(m.status)}`)
    if (!reason?.trim()) return fail(422, 'validation', 'Alasan wajib diisi', { reason: 'Alasan wajib diisi dan dikirim ke participant' })
    const before = m.status
    m.status = to
    if (to === 'closed') db.stats.activeMarkets = Math.max(0, db.stats.activeMarkets - 1)
    audited(userId, m, { pause: 'Pause market', resume: 'Lanjutkan market', close: 'Tutup market' }[action], { reason: reason.trim(), changes: [{ field: 'Status', before: label(before), after: label(to) }] })
    notifyMarket(m.id, { type: 'new_market', title: `${m.name}: ${label(to)}`, body: reason.trim(), href: `/markets/${m.id}` })
    emitEvent(userId, { type: 'market_formed', title: `${m.name} → ${label(to)}` }, to === 'closed')
    saveMm()
    return HttpResponse.json(summary(m))
  })),

  http.post(api('/mm/markets/:id/disputes/:did'), maker(async ({ userId, params, request }) => {
    const x = mine(userId, params.id)
    const d = x?.o.disputes.find((y) => y.id === params.did)
    if (!x || !d) return fail(404, 'not_found', 'Dispute tidak ditemukan')
    const { action, note } = (await request.json()) as { action: DisputeAction; note?: string }
    if (d.status === 'resolved' || (action === 'review' && d.status === 'review')) return fail(409, 'invalid_transition', 'Dispute sudah di tahap ini')
    if (action === 'resolve' && !note?.trim()) return fail(422, 'validation', 'Isi keputusan', { note: 'Tulis keputusan moderasi; dikirim ke kedua pihak' })
    const before = d.status
    d.status = action === 'review' ? 'review' : 'resolved'
    if (action === 'resolve') d.resolution = note!.trim()
    audited(userId, x.m, `Moderasi dispute: ${d.title}`, { reason: note?.trim() || undefined, changes: [{ field: 'Status dispute', before, after: d.status }] })
    saveMm()
    return HttpResponse.json(d)
  })),

  // Analytics (PRD §10.5); ?market= scopes to one market.
  http.get(api('/mm/analytics'), maker(({ userId, request }) => {
    const only = new URL(request.url).searchParams.get('market')
    const ids = operatedIds(userId).filter((id) => !only || id === only)
    if (only && !ids.length) return fail(404, 'not_found', 'Market tidak ditemukan')
    return HttpResponse.json(analytics(ids.map((id) => economy.markets.find((m) => m.id === id)!)))
  })),
]
