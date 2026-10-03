import { useEffect, useState, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
} from '@xyflow/react'
import type { Node, Edge } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Network } from 'lucide-react'

interface RawGraphNode {
  id: string
  position: { x: number; y: number }
  data: { label: string; role: string; detail?: string }
}

function getRoleStyle(role: string): { bg: string; border: string } {
  if (role === 'BUYER')       return { bg: '#0f172a', border: '#3b82f6' }
  if (role === 'DEMAND')      return { bg: '#1e1b4b', border: '#f59e0b' }
  if (role === 'SUPPLIER')    return { bg: '#0f172a', border: '#10b981' }
  if (role === 'MARKET_MAKER') return { bg: '#2e1065', border: '#a855f7' }
  return { bg: '#0f172a', border: '#334155' }
}

export default function OpportunityGraphPage() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  const [loading, setLoading] = useState(true)
  const location = useLocation()

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const oppId = params.get('opp')
    const url = oppId ? `/api/v1/opportunities/graph?opp=${oppId}` : '/api/v1/opportunities/graph'

    fetch(url)
      .then((res) => res.json())
      .then((data: { nodes: RawGraphNode[]; edges: Edge[] }) => {
        const styledNodes = data.nodes.map((node) => {
          const { bg, border } = getRoleStyle(node.data.role)
          return {
            ...node,
            style: {
              background: bg,
              color: '#f8fafc',
              border: `2px solid ${border}`,
              borderRadius: '8px',
              padding: '10px 14px',
              fontSize: '12px',
              fontWeight: '500',
            },
          }
        })
        setNodes(styledNodes)
        setEdges(data.edges)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [setNodes, setEdges, location.search])

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node)
  }, [])

  if (loading) {
    return <div className="text-slate-400 text-sm">Building Knowledge Graph...</div>
  }

  return (
    <div className="space-y-4 max-w-6xl h-[calc(100vh-140px)] flex flex-col">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Network className="h-6 w-6 text-emerald-400" />
            <h2 className="text-2xl font-bold tracking-tight text-slate-100">Opportunity Graph</h2>
          </div>
          <p className="text-slate-400 text-sm mt-0.5">
            Visual representation of aggregated regional economic dependencies.
          </p>
        </div>

        {/* Legend Node */}
        <div className="flex items-center gap-3 text-xs bg-slate-900 px-3 py-2 rounded-lg border border-slate-800">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-500"></span> Buyer</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-purple-500"></span> Market Maker</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500"></span> Aggregate Demand</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500"></span> Supplier</span>
        </div>
      </div>

      {/* Main Canvas Graph */}
      <div className="flex-1 border border-slate-800 rounded-xl bg-slate-950 overflow-hidden relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          proOptions={{ hideAttribution: true }}
          fitView
        >
          <Controls 
            className="flex flex-col gap-1 shadow-lg [&>button]:bg-slate-900 [&>button]:border-slate-700 [&>button]:border [&>button]:fill-slate-300 [&>button]:text-slate-300 [&>button:hover]:bg-slate-800 rounded-md overflow-hidden" 
          />
          <Background color="#334155" variant={BackgroundVariant.Dots} gap={20} size={1} />
        </ReactFlow>

        {/* Selected Node Drawer / Info Overlay */}
        {selectedNode && (
          <Card className="absolute bottom-4 right-4 w-80 bg-slate-900/90 backdrop-blur border-slate-800 shadow-xl">
            <CardHeader className="p-4 pb-2">
              <div className="flex justify-between items-center mb-1">
                <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-500/30">
                  {String(selectedNode.data.role)}
                </Badge>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="text-slate-400 hover:text-slate-200 text-xs"
                >
                  ✕
                </button>
              </div>
              <CardTitle className="text-sm text-slate-100">{String(selectedNode.data.label)}</CardTitle>
              <CardDescription className="text-xs text-slate-400">
                {String(selectedNode.data.detail)}
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </div>
  )
}