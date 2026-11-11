import React, { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix default Leaflet icon paths in Vite
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
})

const createCustomIcon = (color, label) => {
  return L.divIcon({
    className: 'custom-map-marker',
    html: `
      <div style="
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        background: ${color};
        color: #ffffff;
        font-family: monospace;
        font-weight: 700;
        font-size: 11px;
        border-radius: 50%;
        border: 2px solid #ffffff;
        box-shadow: 0 4px 12px rgba(0,0,0,0.45);
      ">
        ${label}
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14]
  })
}

export default function TrackingMap({
  shipments = [],
  selectedShipmentDetail = null,
  onSelectShipment = null
}) {
  const mapContainerRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const layerGroupRef = useRef(null)

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current) return

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [25, 0],
        zoom: 2,
        minZoom: 2,
        maxZoom: 18,
        worldCopyJump: true
      })

      // Dark / clean OpenStreetMap tile layer
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
        maxZoom: 19
      }).addTo(map)

      layerGroupRef.current = L.layerGroup().addTo(map)
      mapInstanceRef.current = map
    }

    return () => {
      // Map cleanup on unmount
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [])

  // Update markers and route lines when selectedShipmentDetail or shipments change
  useEffect(() => {
    const map = mapInstanceRef.current
    const layerGroup = layerGroupRef.current
    if (!map || !layerGroup) return

    layerGroup.clearLayers()

    const bounds = []

    // 1. Detailed route mode for selected shipment
    if (selectedShipmentDetail && selectedShipmentDetail.route_waypoints?.length > 0) {
      const waypoints = selectedShipmentDetail.route_waypoints
      const latLngs = []

      waypoints.forEach((wp, idx) => {
        if (wp.lat && wp.lng) {
          const latLng = [wp.lat, wp.lng]
          latLngs.push(latLng)
          bounds.push(latLng)

          let iconColor = '#0284c7' // Blue waypoint
          let badgeLabel = 'W'

          if (wp.type === 'origin') {
            iconColor = '#16a34a' // Green origin
            badgeLabel = 'O'
          } else if (wp.type === 'destination') {
            iconColor = '#9333ea' // Purple destination
            badgeLabel = 'D'
          }

          const marker = L.marker(latLng, {
            icon: createCustomIcon(iconColor, badgeLabel)
          })

          const popupContent = `
            <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4; color: #1e293b; min-width: 160px;">
              <div style="font-weight: 700; font-size: 13px; margin-bottom: 4px;">
                ${wp.type === 'origin' ? 'Origin' : wp.type === 'destination' ? 'Destination' : 'Waypoint / Hub'}
              </div>
              <div><b>Location:</b> ${wp.label}</div>
              <div><b>Coordinates:</b> ${wp.lat.toFixed(4)}, ${wp.lng.toFixed(4)}</div>
              ${wp.status ? `<div><b>Status:</b> ${wp.status}</div>` : ''}
              ${wp.event_time ? `<div><b>Time:</b> ${new Date(wp.event_time).toLocaleString()}</div>` : ''}
            </div>
          `

          marker.bindPopup(popupContent)
          layerGroup.addLayer(marker)
        }
      })

      if (latLngs.length > 1) {
        // Draw route polyline
        const polyline = L.polyline(latLngs, {
          color: '#4F46E5',
          weight: 4,
          opacity: 0.85,
          dashArray: '8, 8'
        })
        layerGroup.addLayer(polyline)
      }
    } else if (shipments.length > 0) {
      // 2. Fleet overview mode: plot active shipments
      shipments.forEach((s) => {
        const coord = s.coordinates?.current || s.coordinates?.origin
        if (coord && coord.lat && coord.lng) {
          const latLng = [coord.lat, coord.lng]
          bounds.push(latLng)

          let color = '#3b82f6'
          if (s.status === 'DELAYED') color = '#ef4444'
          else if (s.status === 'DELIVERED') color = '#10b981'
          else if (s.status === 'CUSTOMS_HOLD') color = '#f59e0b'
          else if (s.status === 'OUT_FOR_DELIVERY') color = '#06b6d4'

          const marker = L.marker(latLng, {
            icon: createCustomIcon(color, 'S')
          })

          marker.bindPopup(`
            <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4; color: #1e293b;">
              <div style="font-weight: 700; font-size: 13px;">${s.tracking_number}</div>
              <div><b>Carrier:</b> ${s.carrier_name || s.carrier_code}</div>
              <div><b>Status:</b> ${s.status}</div>
              <div><b>Route:</b> ${s.origin} &rarr; ${s.destination}</div>
              <div><b>Location:</b> ${coord.label || s.origin}</div>
              <div style="margin-top: 6px;">
                <button id="view-trk-${s.id}" style="
                  background: #4F46E5;
                  color: #fff;
                  border: none;
                  padding: 4px 8px;
                  border-radius: 4px;
                  cursor: pointer;
                  font-size: 11px;
                ">Track Details</button>
              </div>
            </div>
          `)

          marker.on('popupopen', () => {
            const btn = document.getElementById(`view-trk-${s.id}`)
            if (btn && onSelectShipment) {
              btn.onclick = () => onSelectShipment(s)
            }
          })

          layerGroup.addLayer(marker)
        }
      })
    }

    if (bounds.length > 0) {
      try {
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 })
      } catch (e) {
        // Safe fallback if bounds are invalid
      }
    }
  }, [shipments, selectedShipmentDetail, onSelectShipment])

  return (
    <div className="relative w-full h-[450px] rounded-xl overflow-hidden border border-white/10 shadow-lg">
      <div ref={mapContainerRef} className="w-full h-full z-0" />
      
      {/* Attribution & Legend notice */}
      <div className="absolute bottom-2 left-2 z-10 bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 text-[11px] text-zinc-300">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Origin
          <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" /> Route
          <span className="w-2 h-2 rounded-full bg-purple-500 inline-block" /> Destination
        </div>
        <div className="text-[9px] text-zinc-400 mt-0.5">
          Waypoints rendered via OpenStreetMap & certified port geocodes.
        </div>
      </div>
    </div>
  )
}
