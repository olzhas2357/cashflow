import React from 'react'

export function StatCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12 }}>
      <div style={{ color: '#6b7280', fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
    </div>
  )
}

