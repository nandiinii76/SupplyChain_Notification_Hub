import React from 'react'

const getStatusBadgeClass = (status) => {
  switch (status) {
    case 'DELIVERED':
      return 'status-pill status-success'
    case 'DELAYED':
      return 'status-pill status-danger'
    case 'CUSTOMS_HOLD':
      return 'status-pill status-warn'
    case 'OUT_FOR_DELIVERY':
      return 'status-pill status-info'
    case 'IN_TRANSIT':
      return 'status-pill status-progress'
    default:
      return 'status-pill status-neutral'
  }
}

export default function ShipmentRouteTimeline({ events = [] }) {
  if (!events || events.length === 0) {
    return (
      <div className="py-8 text-center text-zinc-500 text-sm">
        No tracking event history logged yet.
      </div>
    )
  }

  return (
    <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-white/10">
      {events.map((event, index) => {
        const isLatest = index === events.length - 1
        return (
          <div key={event.id || index} className="relative group">
            {/* Dot marker */}
            <div
              className={`absolute -left-6 top-1.5 w-3.5 h-3.5 rounded-full border-2 ${
                isLatest
                  ? 'bg-indigo-500 border-white ring-4 ring-indigo-500/20'
                  : 'bg-zinc-800 border-zinc-500'
              }`}
            />

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
              <div className="flex items-center gap-2">
                <span className={getStatusBadgeClass(event.status)}>
                  {event.status}
                </span>
                <span className="text-sm font-semibold text-zinc-100">
                  {event.location || 'In transit'}
                </span>
              </div>
              <time className="text-xs font-mono text-zinc-400">
                {event.event_time
                  ? new Date(event.event_time).toLocaleString()
                  : new Date(event.created_at).toLocaleString()}
              </time>
            </div>

            {event.description && (
              <p className="mt-1.5 text-xs text-zinc-300 leading-relaxed bg-white/[0.02] p-2.5 rounded-lg border border-white/5">
                {event.description}
              </p>
            )}

            {event.coordinates && (
              <div className="mt-1 text-[10px] font-mono text-zinc-500">
                Hub Coordinates: {event.coordinates.lat.toFixed(4)}, {event.coordinates.lng.toFixed(4)} ({event.coordinates.label})
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
