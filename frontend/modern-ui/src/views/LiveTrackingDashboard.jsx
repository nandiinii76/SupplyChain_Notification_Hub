import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { motion } from 'framer-motion'
import { api } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useToast } from '../components/Toast'
import TrackingMap from '../components/TrackingMap'
import ShipmentRouteTimeline from '../components/ShipmentRouteTimeline'

export default function LiveTrackingDashboard() {
  const { user, role, isStaff } = useAuth()
  const toast = useToast()

  const [shipments, setShipments] = useState([])
  const [selectedShipment, setSelectedShipment] = useState(null)
  const [selectedDetail, setSelectedDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')

  // Fetch overview shipments
  const fetchOverview = useCallback(async () => {
    try {
      const res = await api.get('/tracking')
      if (res && res.success) {
        setShipments(res.data || [])
      }
    } catch (err) {
      console.error('Failed to load tracking data:', err)
      toast.error('Unable to fetch tracking data: ' + err.message)
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchOverview()
  }, [fetchOverview])

  // Fetch detail for a selected shipment
  const handleSelectShipment = useCallback(async (shipment) => {
    setSelectedShipment(shipment)
    setDetailLoading(true)
    try {
      const res = await api.get(`/tracking/${shipment.id || shipment.tracking_number}`)
      if (res && res.success) {
        setSelectedDetail(res.data)
      }
    } catch (err) {
      toast.error('Failed to load shipment details: ' + err.message)
    } finally {
      setDetailLoading(false)
    }
  }, [toast])

  // Auto-select first shipment once loaded if none selected
  useEffect(() => {
    if (!selectedShipment && shipments.length > 0) {
      handleSelectShipment(shipments[0])
    }
  }, [shipments, selectedShipment, handleSelectShipment])

  // Real-time SSE listener
  useEffect(() => {
    // SSE stream listener for live updates
    const token = localStorage.getItem('sc_access_token')
    if (!token) return

    const eventSource = new EventSource('/api/notifications/stream')

    eventSource.addEventListener('notification', (e) => {
      try {
        const payload = JSON.parse(e.data)
        // Refresh overview if status changed
        fetchOverview()
        if (selectedShipment && payload.shipment_id === selectedShipment.id) {
          handleSelectShipment(selectedShipment)
        }
      } catch (parseErr) {
        // Safe ignore
      }
    })

    return () => {
      eventSource.close()
    }
  }, [fetchOverview, selectedShipment, handleSelectShipment])

  // Filtered shipments
  const filteredShipments = useMemo(() => {
    return shipments.filter((s) => {
      const matchesSearch =
        s.tracking_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.origin?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.destination?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.carrier_name?.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesStatus =
        statusFilter === 'ALL' ? true : s.status === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [shipments, searchQuery, statusFilter])

  // KPI calculations
  const stats = useMemo(() => {
    const total = shipments.length
    const inTransit = shipments.filter((s) => s.status === 'IN_TRANSIT').length
    const delayed = shipments.filter((s) => s.status === 'DELAYED' || s.status === 'CUSTOMS_HOLD').length
    const delivered = shipments.filter((s) => s.status === 'DELIVERED').length

    return { total, inTransit, delayed, delivered }
  }, [shipments])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="h1-page">Live Shipment Tracking</h1>
          <p className="eyebrow mt-1">
            Real-time geospatial telemetry & route waypoints ({isStaff ? 'Fleet-wide' : 'My Shipments'})
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => {
              setSelectedShipment(null)
              setSelectedDetail(null)
            }}
          >
            Reset to Fleet View
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={fetchOverview}
          >
            Refresh Data
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid">
        <div className="glass-surface p-4 rounded-xl">
          <div className="eyebrow">Total Tracked</div>
          <div className="kpi-number mt-1">{stats.total}</div>
          <div className="kpi-caption mt-1">Monitored consignments</div>
        </div>

        <div className="glass-surface p-4 rounded-xl">
          <div className="eyebrow text-blue-400">In Transit</div>
          <div className="kpi-number text-blue-400 mt-1">{stats.inTransit}</div>
          <div className="kpi-caption mt-1">Active on ocean & air lanes</div>
        </div>

        <div className="glass-surface p-4 rounded-xl">
          <div className="eyebrow text-amber-400">At Risk / Delayed</div>
          <div className="kpi-number text-amber-400 mt-1">{stats.delayed}</div>
          <div className="kpi-caption mt-1">Customs hold or transit delay</div>
        </div>

        <div className="glass-surface p-4 rounded-xl">
          <div className="eyebrow text-emerald-400">Delivered</div>
          <div className="kpi-number text-emerald-400 mt-1">{stats.delivered}</div>
          <div className="kpi-caption mt-1">Successfully fulfilled</div>
        </div>
      </div>

      {/* Interactive Map */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="h2-section flex items-center gap-2">
            <span className="live-dot cyan blink" />
            {selectedShipment
              ? `Route: ${selectedShipment.tracking_number} (${selectedShipment.origin} → ${selectedShipment.destination})`
              : 'Global Logistics Map (Fleet Overview)'}
          </div>
          {selectedShipment && (
            <span className="text-xs text-zinc-400">
              Showing physical waypoint coordinates & leg sequence
            </span>
          )}
        </div>

        <TrackingMap
          shipments={filteredShipments}
          selectedShipmentDetail={selectedDetail}
          onSelectShipment={handleSelectShipment}
        />
      </div>

      {/* Detail and List Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Shipment Selector / Filter List */}
        <div className="glass-surface p-5 rounded-xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="h2-section">Shipments</div>
            <span className="pill-badge">{filteredShipments.length}</span>
          </div>

          <div className="space-y-2">
            <input
              type="text"
              placeholder="Search tracking, hub, carrier..."
              className="input-control text-xs"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            <select
              className="input-control text-xs"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">All Statuses</option>
              <option value="IN_TRANSIT">In Transit</option>
              <option value="DELAYED">Delayed</option>
              <option value="CUSTOMS_HOLD">Customs Hold</option>
              <option value="OUT_FOR_DELIVERY">Out For Delivery</option>
              <option value="DELIVERED">Delivered</option>
            </select>
          </div>

          <div className="space-y-2 max-h-[460px] overflow-y-auto scroll-area pr-1">
            {loading ? (
              <div className="text-xs text-zinc-500 py-6 text-center">Loading shipments...</div>
            ) : filteredShipments.length === 0 ? (
              <div className="text-xs text-zinc-500 py-6 text-center">No matching shipments found.</div>
            ) : (
              filteredShipments.map((s) => {
                const isSelected = selectedShipment?.id === s.id
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleSelectShipment(s)}
                    className={`w-full text-left p-3 rounded-lg border transition-all ${
                      isSelected
                        ? 'bg-indigo-600/15 border-indigo-500/50 shadow-sm'
                        : 'bg-white/[0.015] border-white/5 hover:border-white/15'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-semibold text-zinc-100">
                        {s.tracking_number}
                      </span>
                      <span className={`status-pill ${
                        s.status === 'DELIVERED' ? 'status-success' :
                        s.status === 'DELAYED' ? 'status-danger' :
                        s.status === 'CUSTOMS_HOLD' ? 'status-warn' : 'status-progress'
                      }`}>
                        {s.status}
                      </span>
                    </div>

                    <div className="text-xs text-zinc-400 mt-1">
                      {s.origin} &rarr; {s.destination}
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-zinc-500 mt-2">
                      <span>{s.carrier_name || s.carrier_code}</span>
                      <span>ETA: {s.expected_delivery ? new Date(s.expected_delivery).toLocaleDateString() : 'TBD'}</span>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* Selected Shipment Details & Route Timeline */}
        <div className="lg:col-span-2 glass-surface p-6 rounded-xl space-y-6">
          {detailLoading ? (
            <div className="py-12 text-center text-sm text-zinc-400">
              Loading shipment route & telemetry...
            </div>
          ) : selectedShipment ? (
            <>
              {/* Header Info */}
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 border-b border-white/10 pb-5">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="text-xl font-bold font-mono text-white">
                      {selectedShipment.tracking_number}
                    </span>
                    <span className="status-pill status-progress">
                      {selectedShipment.status}
                    </span>
                    <span className="status-pill status-neutral">
                      {selectedShipment.priority}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-400 mt-1">
                    Carrier: <b className="text-zinc-200">{selectedShipment.carrier_name}</b> | Customer: <b className="text-zinc-200">{selectedShipment.customer_name}</b>
                  </div>
                </div>

                <div className="text-left sm:text-right">
                  <div className="eyebrow">Estimated Delivery (ETA)</div>
                  <div className="text-sm font-semibold text-zinc-100 mt-0.5">
                    {selectedShipment.expected_delivery
                      ? new Date(selectedShipment.expected_delivery).toLocaleString()
                      : 'Not Scheduled'}
                  </div>
                </div>
              </div>

              {/* Waypoints Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white/[0.02] p-4 rounded-xl border border-white/5">
                <div>
                  <div className="eyebrow text-emerald-400">Origin Gateway</div>
                  <div className="text-sm font-semibold text-zinc-200 mt-1">
                    {selectedShipment.origin}
                  </div>
                  {selectedDetail?.coordinates?.origin && (
                    <div className="text-[10px] font-mono text-zinc-500 mt-0.5">
                      Lat: {selectedDetail.coordinates.origin.lat.toFixed(4)}, Lng: {selectedDetail.coordinates.origin.lng.toFixed(4)}
                    </div>
                  )}
                </div>

                <div>
                  <div className="eyebrow text-purple-400">Destination Port</div>
                  <div className="text-sm font-semibold text-zinc-200 mt-1">
                    {selectedShipment.destination}
                  </div>
                  {selectedDetail?.coordinates?.destination && (
                    <div className="text-[10px] font-mono text-zinc-500 mt-0.5">
                      Lat: {selectedDetail.coordinates.destination.lat.toFixed(4)}, Lng: {selectedDetail.coordinates.destination.lng.toFixed(4)}
                    </div>
                  )}
                </div>
              </div>

              {/* Timeline Section */}
              <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between">
                  <div className="h2-section">Telemetry & Milestone Timeline</div>
                  <span className="text-xs text-zinc-400">
                    {selectedDetail?.events?.length || 0} event checkpoint(s)
                  </span>
                </div>

                <ShipmentRouteTimeline events={selectedDetail?.events || []} />
              </div>
            </>
          ) : (
            <div className="py-16 text-center text-zinc-500 text-sm">
              Select a shipment from the fleet list to view its route waypoints, coordinates, and milestone history.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
