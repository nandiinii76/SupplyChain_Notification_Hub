import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'

import Dashboard from './components/Dashboard'
import Shipments from './components/Shipments'
import BackgroundSurface from './components/BackgroundSurface'

import AuthView from './views/AuthView'
import NotificationsView from './views/NotificationsView'
import CarriersView from './views/CarriersView'
import UsersView from './views/UsersView'
import AuditLogView from './views/AuditLogView'
import SettingsView from './views/SettingsView'
import ApprovalsView from './views/ApprovalsView'
import LiveTrackingDashboard from './views/LiveTrackingDashboard'

import { useAuth } from './lib/auth'
import { useNotifications } from './lib/notifications'
import { FullPageLoader } from './components/States'
import { useToast } from './components/Toast'

/**
 * Application shell.
 *
 * Navigation is filtered by role so the sidebar mirrors backend authorisation
 * exactly: customers never see fleet analytics or admin tooling, and
 * ADMIN-only destinations stay hidden from OPERATIONS.
 */

const containerVariant = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.08 } }
}

const panelVariant = {
  hidden: { y: 18, opacity: 0 },
  show: { y: 0, opacity: 1, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } }
}

// roles: which roles may see the destination. undefined = everyone.
const NAV_ITEMS = [
  { key: 'dashboard', label: 'Analytics', roles: ['ADMIN', 'OPERATIONS'] },
  { key: 'shipments', label: 'Shipments' },
  { key: 'tracking', label: 'Live Tracking' },
  { key: 'approvals', label: 'Approvals', roles: ['ADMIN', 'OPERATIONS'] },
  { key: 'notifications', label: 'Notifications' },
  { key: 'carriers', label: 'Carriers', roles: ['ADMIN', 'OPERATIONS'] },
  { key: 'users', label: 'Users', roles: ['ADMIN'] },
  { key: 'audit', label: 'Audit Log', roles: ['ADMIN'] },
  { key: 'settings', label: 'Settings' }
]

function AppShell() {
  const { user, role, logout, isStaff } = useAuth()
  const { unreadCount } = useNotifications()
  const toast = useToast()

  const navigation = useMemo(
    () => NAV_ITEMS.filter((item) => !item.roles || item.roles.includes(role)),
    [role]
  )

  // Customers land on Shipments because fleet analytics is staff-only.
  const [view, setView] = useState(() => (isStaff ? 'dashboard' : 'shipments'))
  const [menuOpen, setMenuOpen] = useState(false)
  const navRef = useRef(null)

  // Keep the active view legal if the role ever changes.
  useEffect(() => {
    if (!navigation.some((item) => item.key === view)) {
      setView(navigation[0]?.key || 'shipments')
    }
  }, [navigation, view])

  useEffect(() => {
    document.title = 'SupplyChain Notification Hub'
  }, [])

  const activeIndex = navigation.findIndex((item) => item.key === view)

  const go = (key) => {
    setView(key)
    setMenuOpen(false)
  }

  const handleLogout = async () => {
    await logout()
    toast.info('Signed out.')
  }

  return (
    <div className="min-h-screen bg-[var(--surface)] body-font text-zinc-100">
      <BackgroundSurface />

      <motion.div
        initial="hidden"
        animate="show"
        variants={containerVariant}
        className="content-layer max-w-[1200px] mx-auto px-6 py-8"
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 20,
            marginBottom: 24,
            flexWrap: 'wrap'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button
              type="button"
              className="btn btn-sm mobile-only"
              onClick={() => setMenuOpen(true)}
              aria-label="Open navigation"
            >
              Menu
            </button>

            <div>
              <div className="hdr text-2xl font-semibold">
                SupplyChain Notification Hub
              </div>
              <div className="eyebrow" style={{ marginTop: 4 }}>
                Telemetry · Transit risk · Notifications
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => go('notifications')}
              aria-label={`Notifications, ${unreadCount} unread`}
            >
              Notifications
              {unreadCount > 0 && (
                <span className="count-badge" style={{ marginLeft: 2 }}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            <div style={{ textAlign: 'right' }}>
              <div className="body-text" style={{ fontWeight: 600 }}>
                {user?.name}
              </div>
              <div className="eyebrow">{role}</div>
            </div>

            <button type="button" className="btn btn-sm" onClick={handleLogout}>
              Sign out
            </button>
          </div>
        </header>

        <div className="app-shell-grid">
          {menuOpen && (
            <div
              className="sidebar-scrim mobile-only"
              onClick={() => setMenuOpen(false)}
              aria-hidden
            />
          )}

          <nav
            className={`app-sidebar pt-2 relative${menuOpen ? ' is-open' : ''}`}
            ref={navRef}
            aria-label="Primary"
          >
            {activeIndex >= 0 && (
              <div
                style={{ position: 'absolute', top: `${18 + activeIndex * 40}px`, height: 22 }}
                className="nav-marker"
                aria-hidden
              />
            )}

            <ul style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {navigation.map((item) => {
                const isActive = view === item.key

                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() => go(item.key)}
                      aria-current={isActive ? 'page' : undefined}
                      className={`w-full text-left px-3 py-2 underline-grow clickable nav-item-text${
                        isActive ? ' is-active nav-active' : ''
                      }`}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: isActive ? '#ffffff' : '#a1a1aa',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8
                      }}
                    >
                      <span>{item.label}</span>
                      {item.key === 'notifications' && unreadCount > 0 && (
                        <span className="count-badge">
                          {unreadCount > 99 ? '99+' : unreadCount}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </nav>

          <main>
            <motion.div variants={panelVariant}>
              {view === 'dashboard' && <Dashboard />}
              {view === 'shipments' && <Shipments />}
              {view === 'tracking' && <LiveTrackingDashboard />}
              {view === 'approvals' && <ApprovalsView />}
              {view === 'notifications' && <NotificationsView />}
              {view === 'carriers' && <CarriersView />}
              {view === 'users' && <UsersView />}
              {view === 'audit' && <AuditLogView />}
              {view === 'settings' && <SettingsView />}
            </motion.div>
          </main>
        </div>
      </motion.div>
    </div>
  )
}

export default function App() {
  const { isAuthenticated, initialising } = useAuth()

  if (initialising) {
    return <FullPageLoader label="Restoring session" />
  }

  return isAuthenticated ? <AppShell /> : <AuthView />
}
