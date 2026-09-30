import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { MarketType } from '@/types/market'
import { Gavel, Users, Box, ArrowRight, CheckCircle2, CalendarIcon, Clock } from 'lucide-react'

const MARKET_TYPES: { type: MarketType; label: string; description: string; icon: React.ElementType }[] = [
  { type: 'DIRECT_TRADE', label: 'Direct Trade', description: 'One-to-one matched transaction.', icon: Box },
  { type: 'COLLECTIVE_PROCUREMENT', label: 'Collective Procurement', description: 'Pool demand with others to negotiate better rates.', icon: Users },
  { type: 'REVERSE_AUCTION', label: 'Reverse Auction', description: 'Suppliers bid downwards for your demand.', icon: Gavel },
  { type: 'FORWARD_AUCTION', label: 'Forward Auction', description: 'Buyers bid upwards for your supply.', icon: Gavel },
  { type: 'SEALED_BID', label: 'Sealed Bid', description: 'Blind bidding for maximum fairness.', icon: Box },
  { type: 'DUTCH_AUCTION', label: 'Dutch Auction', description: 'Price drops until someone accepts.', icon: Gavel },
]

export default function MarketFormationPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [selectedType, setSelectedType] = useState<MarketType | null>(null)
  const [formData, setFormData] = useState({
    targetQuantity: 1000,
    unit: 'units',
    deadline: '',
    minSuppliers: 1,
    targetUnitPriceIdr: 1000,
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleNext = () => setStep(step + 1)
  const handlePrev = () => setStep(step - 1)

  const handleSubmit = async () => {
    if (!selectedType) return
    setIsSubmitting(true)
    
    await fetch('/api/v1/markets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: selectedType,
        ...formData
      })
    })
    
    setIsSubmitting(false)
    setStep(3)
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-10 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
          <Gavel className="h-5 w-5 text-emerald-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Market Formation</h1>
          <p className="text-slate-400">Initialize a new market structure for your opportunity</p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-8">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2 flex-1">
            <div className={`h-2 flex-1 rounded-full ${s <= step ? 'bg-emerald-500' : 'bg-slate-800'}`} />
          </div>
        ))}
      </div>

      {step === 1 && (
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-slate-100">Select Market Type</CardTitle>
            <CardDescription>Choose the appropriate market mechanism for your goal.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {MARKET_TYPES.map((mt) => {
                const Icon = mt.icon
                const isSelected = selectedType === mt.type
                return (
                  <div
                    key={mt.type}
                    onClick={() => setSelectedType(mt.type)}
                    className={`p-4 rounded-xl border cursor-pointer transition-all ${
                      isSelected 
                        ? 'bg-emerald-500/10 border-emerald-500/50' 
                        : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`p-2 rounded-lg ${isSelected ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-900 text-slate-400'}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                      <h3 className={`font-semibold ${isSelected ? 'text-emerald-400' : 'text-slate-200'}`}>
                        {mt.label}
                      </h3>
                    </div>
                    <p className="text-sm text-slate-400">{mt.description}</p>
                  </div>
                )
              })}
            </div>
            
            <div className="mt-8 flex justify-end">
              <Button 
                onClick={handleNext} 
                disabled={!selectedType}
                className="bg-emerald-500 hover:bg-emerald-600 text-white"
              >
                Next Step <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-slate-100">Configure Market Parameters</CardTitle>
            <CardDescription>Set the rules and targets for {MARKET_TYPES.find(m => m.type === selectedType)?.label}.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Target Quantity</label>
                <Input 
                  type="number" 
                  value={formData.targetQuantity}
                  onChange={e => setFormData({...formData, targetQuantity: Number(e.target.value)})}
                  className="bg-slate-950 border-slate-800 text-slate-100"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Unit</label>
                <Input 
                  value={formData.unit}
                  onChange={e => setFormData({...formData, unit: e.target.value})}
                  className="bg-slate-950 border-slate-800 text-slate-100"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Target Unit Price (IDR)</label>
                <Input 
                  type="number" 
                  value={formData.targetUnitPriceIdr}
                  onChange={e => setFormData({...formData, targetUnitPriceIdr: Number(e.target.value)})}
                  className="bg-slate-950 border-slate-800 text-slate-100"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Minimum Suppliers</label>
                <Input 
                  type="number" 
                  value={formData.minSuppliers}
                  onChange={e => setFormData({...formData, minSuppliers: Number(e.target.value)})}
                  className="bg-slate-950 border-slate-800 text-slate-100"
                />
              </div>
              <div className="col-span-2 space-y-2 flex flex-col">
                <label className="text-sm font-medium text-slate-300">Deadline</label>
                <Popover>
                  <PopoverTrigger render={
                    <Button
                      variant="outline"
                      className={`dark justify-start text-left font-normal bg-slate-950 border-slate-800 text-slate-100 hover:bg-slate-900 hover:text-slate-100 ${!formData.deadline && "text-slate-500"}`}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4 text-slate-400" />
                      {formData.deadline ? format(new Date(formData.deadline), "PPP - HH:mm") : <span>Pick a date and time</span>}
                    </Button>
                  } />
                  <PopoverContent className="dark w-auto p-0 bg-slate-950 border-slate-800" align="start">
                    <Calendar
                      mode="single"
                      selected={formData.deadline ? new Date(formData.deadline) : undefined}
                      onSelect={(date) => {
                        if (date) {
                          const time = formData.deadline ? formData.deadline.split('T')[1] : '23:59'
                          const dateString = format(date, 'yyyy-MM-dd')
                          setFormData({ ...formData, deadline: `${dateString}T${time}` })
                        }
                      }}
                      className="text-slate-100 bg-slate-950"
                    />
                    <div className="p-3 border-t border-slate-800 flex items-center gap-2">
                      <Clock className="h-4 w-4 text-slate-400" />
                      <Input
                        type="time"
                        value={formData.deadline ? formData.deadline.split('T')[1] : ''}
                        onChange={(e) => {
                          const dateString = formData.deadline ? formData.deadline.split('T')[0] : format(new Date(), 'yyyy-MM-dd')
                          setFormData({ ...formData, deadline: `${dateString}T${e.target.value}` })
                        }}
                        style={{ colorScheme: 'dark' }}
                        className="bg-slate-900 border-slate-800 text-slate-100 h-8"
                      />
                    </div>
                  </PopoverContent>
                </Popover>
                <p className="text-xs text-slate-500 mt-1">Select the exact date and time when bidding will close.</p>
              </div>
            </div>

            <div className="flex justify-between mt-8">
              <Button variant="outline" onClick={handlePrev} className="border-slate-700 text-slate-300 hover:bg-slate-800">
                Back
              </Button>
              <Button 
                onClick={handleSubmit} 
                disabled={isSubmitting || !formData.deadline}
                className="bg-emerald-500 hover:bg-emerald-600 text-white"
              >
                {isSubmitting ? 'Forming Market...' : 'Form Market Now'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card className="bg-slate-900/50 border-slate-800 text-center py-12">
          <CardContent>
            <div className="h-20 w-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="h-10 w-10 text-emerald-400" />
            </div>
            <h2 className="text-2xl font-bold text-slate-100 mb-2">Market Successfully Formed</h2>
            <p className="text-slate-400 mb-8 max-w-md mx-auto">
              Your {MARKET_TYPES.find(m => m.type === selectedType)?.label} market has been broadcasted to the network. Participants can now discover and interact with it.
            </p>
            <div className="flex justify-center gap-4">
              <Button 
                variant="outline" 
                onClick={() => navigate('/auctions')}
                className="border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
              >
                View Active Markets & Auctions →
              </Button>
              <Button 
                onClick={() => {
                  setStep(1)
                  setSelectedType(null)
                }}
                className="bg-slate-700 hover:bg-slate-600 text-white"
              >
                Form Another Market
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
