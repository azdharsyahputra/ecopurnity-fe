import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { MarketAuctionItem, BidItem } from '@/types/auction'
import { Gavel, Clock, ShieldCheck, ArrowUpRight, Calculator, CheckCircle2, Info, Trophy, Sparkles } from 'lucide-react'

function computeBidScore(bid: BidItem, allBids: BidItem[]): number {
  const prices = allBids.map(b => b.offeredPricePerUnitIdr)
  const capacities = allBids.map(b => b.capacityOffered)
  const minPrice = Math.min(...prices)
  const maxPrice = Math.max(...prices)
  const maxCapacity = Math.max(...capacities)

  const priceScore = maxPrice === minPrice
    ? 100
    : ((maxPrice - bid.offeredPricePerUnitIdr) / (maxPrice - minPrice)) * 100

  const reliabilityScore = bid.supplierReliability
  const capacityScore = maxCapacity === 0 ? 0 : (bid.capacityOffered / maxCapacity) * 100

  return Math.round(priceScore * 0.5 + reliabilityScore * 0.3 + capacityScore * 0.2)
}

export default function MarketAuctionPage() {
  const [auctions, setAuctions] = useState<MarketAuctionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAuction, setSelectedAuction] = useState<MarketAuctionItem | null>(null)
  const [dialogType, setDialogType] = useState<'JOIN' | 'BID' | null>(null)
  const [inputQuantity, setInputQuantity] = useState<number>(1000)
  const [inputBidPrice, setInputBidPrice] = useState<number>(1400)
  const [inputBidCapacity, setInputBidCapacity] = useState<number>(100000)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/v1/auctions')
      .then((res) => res.json())
      .then((data) => {
        setAuctions(data)
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    if (loading) return
    const interval = setInterval(() => {
      setAuctions(prev => prev.map(auc => {
        if (auc.status === 'BIDDING_OPEN' && Math.random() > 0.6) {
          const newBid = {
            id: `bid-${Date.now()}`,
            supplierId: `sup-${Math.floor(Math.random() * 1000)}`,
            supplierName: ['PT Maju Bersama', 'EcoPack Ltd', 'CV Logistik Hijau'][Math.floor(Math.random() * 3)],
            supplierReliability: Math.floor(Math.random() * 20) + 80,
            offeredPricePerUnitIdr: auc.bids.length > 0 ? auc.bids[0].offeredPricePerUnitIdr - (Math.floor(Math.random() * 50) + 10) : auc.targetUnitPriceIdr,
            capacityOffered: Math.floor(Math.random() * 200000) + 100000,
            submittedAt: 'Just now',
          }
          return {
            ...auc,
            bids: [newBid, ...auc.bids].sort((a, b) => a.offeredPricePerUnitIdr - b.offeredPricePerUnitIdr)
          }
        }
        return auc
      }))
    }, 4000)

    return () => clearInterval(interval)
  }, [loading])

  const handleJoinPool = async () => {
    if (!selectedAuction) return
    setIsSubmitting(true)

    await fetch(`/api/v1/auctions/${selectedAuction.id}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: inputQuantity }),
    })

    setIsSubmitting(false)
    setActionSuccess(`Successfully added ${inputQuantity.toLocaleString()} ${selectedAuction.unit} to the pool!`)
    setTimeout(() => {
      setActionSuccess(null)
      setDialogType(null)
    }, 1500)
  }

  const handleSubmitBid = async () => {
    if (!selectedAuction) return
    setIsSubmitting(true)

    await fetch(`/api/v1/auctions/${selectedAuction.id}/bid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ price: inputBidPrice, capacity: inputBidCapacity }),
    })

    setIsSubmitting(false)
    setActionSuccess(`Bid submitted: Rp ${inputBidPrice.toLocaleString()} / unit!`)
    setTimeout(() => {
      setActionSuccess(null)
      setDialogType(null)
    }, 1500)
  }

  if (loading) {
    return <div className="text-slate-400 text-sm">Loading market auctions & order pools...</div>
  }

  const renderAuctionCards = (list: MarketAuctionItem[]) => {
    if (list.length === 0) {
      return (
        <div className="col-span-full py-24 flex flex-col items-center justify-center text-center border-2 border-dashed border-slate-800/50 rounded-2xl bg-slate-900/20 backdrop-blur-sm">
          <div className="h-16 w-16 bg-slate-800/50 rounded-full flex items-center justify-center mb-4 border border-slate-700/50">
            <Sparkles className="h-8 w-8 text-slate-500" />
          </div>
          <h3 className="text-lg font-medium text-slate-300">No Markets Found</h3>
          <p className="text-slate-500 text-sm mt-1 max-w-sm">There are currently no active markets in this category. Check back later.</p>
        </div>
      )
    }
    return list.map((auc) => {
      const poolingPercentage = Math.min(
        100,
        Math.round((auc.currentPooledQuantity / auc.targetQuantity) * 100)
      )
      const baselineTotal = auc.currentPooledQuantity * auc.baselineUnitPriceIdr
      const targetTotal = auc.currentPooledQuantity * auc.targetUnitPriceIdr
      const totalSavingsIdr = baselineTotal - targetTotal
      const savingsPercent = Math.round(((auc.baselineUnitPriceIdr - auc.targetUnitPriceIdr) / auc.baselineUnitPriceIdr) * 100)

      const bidsWithScores = auc.bids.map(bid => ({
        ...bid,
        compositeScore: computeBidScore(bid, auc.bids),
      }))

      const deadlineDate = new Date(auc.deadline)
      const deadlineStr = deadlineDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
      const isBiddingOpen = auc.status === 'BIDDING_OPEN'

      return (
        <Card key={auc.id} className="group bg-slate-900/60 backdrop-blur-md border-slate-800/80 flex flex-col justify-between hover:border-emerald-500/30 hover:shadow-[0_8px_30px_-12px_rgba(16,185,129,0.2)] transition-all duration-500 overflow-hidden relative">
          {/* Subtle background glow on hover */}
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
          
          <CardHeader className="pb-3 relative z-10">
            <div className={`absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r ${isBiddingOpen ? 'from-emerald-400 via-teal-500 to-emerald-400' : 'from-blue-400 via-indigo-500 to-blue-400'} bg-[length:200%_100%] animate-[pulse_3s_ease-in-out_infinite]`}></div>
            <div className="flex items-center justify-between mb-3 mt-1">
              <Badge
                variant="outline"
                className={
                  isBiddingOpen
                    ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.1)]'
                    : 'bg-blue-500/10 text-blue-300 border-blue-500/30 shadow-[0_0_10px_rgba(59,130,246,0.1)]'
                }
              >
                <span className={`h-1.5 w-1.5 rounded-full mr-2 ${isBiddingOpen ? 'bg-emerald-400 animate-pulse' : 'bg-blue-400'}`}></span>
                {auc.status.replace('_', ' ')}
              </Badge>
              <span className="text-[11px] font-medium text-slate-400 bg-slate-950/50 px-2.5 py-1 rounded-full border border-slate-800/50 flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-slate-300" /> Closes {deadlineStr}
              </span>
            </div>
            <CardTitle className="text-xl text-slate-100 font-bold tracking-tight">{auc.title}</CardTitle>
            <CardDescription className="text-slate-400 flex items-center gap-2 mt-1.5 text-xs">
              <span className="bg-slate-800/50 px-2 py-0.5 rounded text-slate-300">{auc.category}</span>
              <span>•</span>
              <span className="flex items-center gap-1 text-slate-300">
                <span className="font-semibold text-slate-200">{auc.buyersCount}</span> Buyers Pooled
              </span>
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-5 z-10 relative">
            {/* Progress Pooling */}
            <div className="space-y-2 bg-slate-950/40 p-3 rounded-xl border border-slate-800/50">
              <div className="flex justify-between items-end text-sm">
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-500 font-medium uppercase tracking-wider mb-0.5">Pooled Demand</span>
                  <span className="text-slate-300">
                    <strong className="text-slate-100 text-base">{auc.currentPooledQuantity.toLocaleString()}</strong> <span className="text-xs">/ {auc.targetQuantity.toLocaleString()} {auc.unit}</span>
                  </span>
                </div>
                <div className="text-right flex flex-col items-end">
                  <span className="text-emerald-400 font-bold text-lg leading-none">{poolingPercentage}%</span>
                </div>
              </div>
              <div className="relative h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800/80">
                <div 
                  className={`absolute top-0 left-0 h-full rounded-full bg-gradient-to-r ${isBiddingOpen ? 'from-emerald-600 to-emerald-400' : 'from-blue-600 to-blue-400'} transition-all duration-1000 ease-out`}
                  style={{ width: `${poolingPercentage}%` }}
                >
                  <div className="absolute inset-0 bg-white/20 w-full animate-[shimmer_2s_infinite]" style={{ backgroundImage: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)' }}></div>
                </div>
              </div>
            </div>

            {/* Calculator Savings Box */}
            <div className="p-3.5 bg-gradient-to-br from-slate-950 to-slate-900 border border-slate-800/80 rounded-xl space-y-3 relative overflow-hidden group/calc">
              <div className="absolute -right-4 -top-4 w-16 h-16 bg-emerald-500/10 rounded-full blur-xl group-hover/calc:bg-emerald-500/20 transition-all duration-500"></div>
              
              <div className="flex items-center justify-between text-xs border-b border-slate-800/80 pb-2.5">
                <span className="flex items-center gap-1.5 text-slate-300 font-medium">
                  <Calculator className="h-4 w-4 text-amber-400" /> Retail vs Pool Price
                </span>
                <Badge variant="secondary" className="bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-0 font-bold tracking-wide">
                  SAVE {savingsPercent}%
                </Badge>
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="space-y-0.5">
                  <p className="text-[11px] text-slate-500 font-medium">Normal Baseline</p>
                  <p className="font-semibold text-slate-400 line-through decoration-slate-600/50 decoration-2">Rp {auc.baselineUnitPriceIdr.toLocaleString()}</p>
                </div>
                <div className="space-y-0.5 border-l border-slate-800/80 pl-4">
                  <p className="text-[11px] text-slate-500 font-medium">Target Collective</p>
                  <p className="font-bold text-emerald-400 text-base">Rp {auc.targetUnitPriceIdr.toLocaleString()}</p>
                </div>
              </div>
              
              <div className="pt-2.5 border-t border-slate-800/50 flex justify-between items-center text-xs">
                <span className="text-slate-400">Estimated Pool Savings</span>
                <strong className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded text-sm">Rp {totalSavingsIdr.toLocaleString()}</strong>
              </div>
            </div>

            {/* Supplier Bids Section with Multi-Factor Score */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
                  Supplier Bids
                  <span className="group/tooltip relative">
                    <Info className="h-3.5 w-3.5 text-slate-500 cursor-help hover:text-slate-300 transition-colors" />
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-slate-800 text-[10px] text-slate-200 rounded opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none text-center shadow-xl border border-slate-700 z-20">
                      Score = Price 50% + Reliability 30% + Capacity 20%
                    </span>
                  </span>
                </h4>
                <Badge variant="outline" className="text-[10px] bg-slate-900 border-slate-700 text-slate-400 px-2 py-0 h-5">
                  {auc.bids.length} Submitted
                </Badge>
              </div>

              {bidsWithScores.length === 0 ? (
                <div className="py-6 text-center bg-slate-900/50 rounded-xl border border-dashed border-slate-800">
                  <p className="text-xs text-slate-400">No supplier bids submitted yet.</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">Be the first to secure this demand!</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {bidsWithScores.slice(0, 3).map((bid, i) => {
                    const isBest = i === 0;
                    return (
                      <div
                        key={bid.id}
                        className={`p-3 rounded-xl border transition-all duration-300 relative overflow-hidden ${
                          isBest
                            ? 'bg-gradient-to-r from-emerald-500/10 to-transparent border-emerald-500/30 shadow-[0_0_15px_-3px_rgba(16,185,129,0.1)]'
                            : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        {isBest && (
                          <div className="absolute top-0 right-0 p-1.5 bg-emerald-500/20 rounded-bl-lg border-b border-l border-emerald-500/20">
                            <Trophy className="h-3 w-3 text-emerald-400" />
                          </div>
                        )}
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`font-semibold text-sm ${isBest ? 'text-emerald-300' : 'text-slate-200'}`}>
                                {bid.supplierName}
                              </span>
                            </div>
                            <p className="text-slate-500 text-[11px]">Cap: <span className="text-slate-300">{bid.capacityOffered.toLocaleString()}</span> {auc.unit}</p>
                          </div>
                          <div className="text-right pr-6">
                            <p className={`font-bold text-sm ${isBest ? 'text-emerald-400' : 'text-slate-100'}`}>Rp {bid.offeredPricePerUnitIdr.toLocaleString()}</p>
                            <p className="text-[10px] text-slate-500">/ {auc.unit}</p>
                          </div>
                        </div>
                        
                        {/* Multi-factor mini bar */}
                        <div className="flex items-center gap-3">
                          <div className="flex-1 h-1.5 bg-slate-900 rounded-full overflow-hidden shadow-inner">
                            <div
                              className={`h-full rounded-full transition-all duration-1000 ${isBest ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' : 'bg-slate-600'}`}
                              style={{ width: `${bid.compositeScore}%` }}
                            />
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-slate-400 flex-shrink-0">
                            <span className="flex items-center gap-1" title="Reliability Score">
                              <ShieldCheck className={`h-3 w-3 ${isBest ? 'text-emerald-500/70' : 'text-slate-500'}`} />
                              {bid.supplierReliability}%
                            </span>
                            <span className={`font-bold px-1.5 py-0.5 rounded ${isBest ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-300'}`}>
                              {bid.compositeScore} pts
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </CardContent>

          <CardFooter className="p-4 pt-0 mt-4 z-10 relative">
            <div className="flex gap-3 w-full">
              <Button
                onClick={() => {
                  setSelectedAuction(auc)
                  setDialogType('JOIN')
                }}
                variant="outline"
                className="flex-1 border-slate-700 bg-slate-900 hover:bg-slate-800 hover:text-white text-slate-200 transition-colors"
              >
                Join Order Pool
              </Button>
              <Button
                onClick={() => {
                  setSelectedAuction(auc)
                  setDialogType('BID')
                }}
                className={`flex-1 text-white transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 ${
                  isBiddingOpen 
                    ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 shadow-emerald-500/20' 
                    : 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 shadow-blue-500/20'
                }`}
              >
                Submit Bid <ArrowUpRight className="ml-1.5 h-4 w-4" />
              </Button>
            </div>
          </CardFooter>
        </Card>
      )
    })
  }

  return (
    <div className="space-y-8 max-w-6xl pb-10">
      <div className="relative">
        <div className="absolute -left-4 -top-4 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl"></div>
        <div className="relative flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/30 flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.15)]">
            <Gavel className="h-6 w-6 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-slate-100 mb-1">Market & Auction Clearing</h2>
            <p className="text-slate-400 text-sm">
              Form demand pools to unlock bulk pricing or bid as a supplier to fulfill aggregate capacity.
            </p>
          </div>
        </div>
      </div>

      <Tabs defaultValue="all" className="w-full flex flex-col">
        <TabsList className="inline-flex h-auto w-max max-w-full overflow-x-auto bg-slate-900/60 backdrop-blur-md border border-slate-700/50 text-slate-400 p-1.5 rounded-xl shadow-xl self-start">
          <TabsTrigger value="all" className="rounded-lg px-6 py-2.5 data-[state=active]:bg-slate-800 data-[state=active]:text-emerald-400 data-[state=active]:shadow-sm transition-all whitespace-nowrap">
            All Markets <Badge variant="secondary" className="ml-2 bg-slate-950/50 text-slate-300">{auctions.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="bidding" className="rounded-lg px-6 py-2.5 data-[state=active]:bg-emerald-500/10 data-[state=active]:text-emerald-400 data-[state=active]:shadow-sm transition-all whitespace-nowrap">
            Active Bidding <Badge variant="secondary" className="ml-2 bg-slate-950/50 text-slate-300">{auctions.filter(a => a.status === 'BIDDING_OPEN').length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="pooling" className="rounded-lg px-6 py-2.5 data-[state=active]:bg-blue-500/10 data-[state=active]:text-blue-400 data-[state=active]:shadow-sm transition-all whitespace-nowrap">
            Open Pooling <Badge variant="secondary" className="ml-2 bg-slate-950/50 text-slate-300">{auctions.filter(a => a.status === 'OPEN_POOLING').length}</Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {renderAuctionCards(auctions)}
        </TabsContent>
        <TabsContent value="bidding" className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {renderAuctionCards(auctions.filter(a => a.status === 'BIDDING_OPEN'))}
        </TabsContent>
        <TabsContent value="pooling" className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
          {renderAuctionCards(auctions.filter(a => a.status === 'OPEN_POOLING'))}
        </TabsContent>
      </Tabs>

      {/* Interactive Modal / Dialog */}
      <Dialog open={!!dialogType} onOpenChange={() => setDialogType(null)}>
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg">
              {dialogType === 'JOIN' ? 'Join Demand Consortium' : 'Submit Supplier Bid'}
            </DialogTitle>
            <DialogDescription className="text-slate-400 text-xs">
              {selectedAuction?.title}
            </DialogDescription>
          </DialogHeader>

          {actionSuccess ? (
            <div className="py-8 text-center space-y-2">
              <CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto animate-bounce" />
              <p className="text-sm font-semibold text-slate-200">{actionSuccess}</p>
            </div>
          ) : dialogType === 'JOIN' ? (
            <div className="space-y-4 py-2 text-xs">
              <div>
                <label className="text-slate-300 block mb-1">Quantity to Pool ({selectedAuction?.unit})</label>
                <Input
                  type="number"
                  value={inputQuantity}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputQuantity(Number(e.target.value))}
                  className="bg-slate-950 border-slate-800 text-slate-100"
                />
              </div>
              <div className="p-3 bg-slate-950 rounded border border-slate-800 space-y-1">
                <div className="flex justify-between text-slate-400">
                  <span>Target Unit Price:</span>
                  <span className="text-emerald-400 font-bold">Rp {selectedAuction?.targetUnitPriceIdr.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Estimated Total Commitment:</span>
                  <span className="text-slate-100 font-bold">
                    Rp {((selectedAuction?.targetUnitPriceIdr || 0) * inputQuantity).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-2 text-xs">
              <div>
                <label className="text-slate-300 block mb-1">Offered Price Per Unit (Rp)</label>
                <Input
                  type="number"
                  value={inputBidPrice}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputBidPrice(Number(e.target.value))}
                  className="bg-slate-950 border-slate-800 text-slate-100"
                />
              </div>
              <div>
                <label className="text-slate-300 block mb-1">Capacity Offered ({selectedAuction?.unit})</label>
                <Input
                  type="number"
                  value={inputBidCapacity}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInputBidCapacity(Number(e.target.value))}
                  className="bg-slate-950 border-slate-800 text-slate-100"
                />
              </div>
              {/* Live score preview */}
              {selectedAuction && selectedAuction.bids.length > 0 && (
                <div className="p-3 bg-slate-950 rounded border border-slate-800 space-y-1">
                  <p className="text-slate-400 text-[11px] mb-1 flex items-center gap-1">
                    <Info className="h-3 w-3" /> Estimated Composite Score (vs current bids)
                  </p>
                  {(() => {
                    const previewBid = {
                      id: 'preview', supplierId: 'me', supplierName: 'You',
                      supplierReliability: 95, offeredPricePerUnitIdr: inputBidPrice,
                      capacityOffered: inputBidCapacity, submittedAt: 'now'
                    }
                    const allBids = [...selectedAuction.bids, previewBid]
                    const score = computeBidScore(previewBid, allBids)
                    return (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${score}%` }} />
                        </div>
                        <span className="text-blue-400 font-bold text-xs">{score} / 100</span>
                      </div>
                    )
                  })()}
                  <p className="text-[10px] text-slate-600">Price 50% + Reliability 30% + Capacity 20%</p>
                </div>
              )}
            </div>
          )}

          {!actionSuccess && (
            <DialogFooter>
              <Button variant="ghost" onClick={() => setDialogType(null)} className="text-slate-400 text-xs">
                Cancel
              </Button>
              <Button
                onClick={dialogType === 'JOIN' ? handleJoinPool : handleSubmitBid}
                disabled={isSubmitting}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs"
              >
                {isSubmitting ? 'Processing...' : 'Confirm'}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}