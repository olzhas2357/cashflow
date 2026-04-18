import React from 'react'
import { Link } from 'react-router-dom'
import { Button } from './Button'
import type { AuthUser } from '../api/auth'

export function NavBar({ user, onLogout }: { user: AuthUser | null; onLogout: () => void }) {
  return (
    <div style={{ borderBottom: '1px solid #e5e7eb' }}>
      <div className="container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Link to="/" style={{ textDecoration: 'none', color: '#111827', fontWeight: 700 }}>
            Cashflow
          </Link>
          {user?.role === 'player' && <Link to="/player">Player</Link>}
          {user?.role === 'auditor' || user?.role === 'admin' ? <Link to="/auditor">Auditor</Link> : null}
        </div>
        {user ? <Button variant="secondary" onClick={onLogout}>Logout</Button> : null}
      </div>
    </div>
  )
}

