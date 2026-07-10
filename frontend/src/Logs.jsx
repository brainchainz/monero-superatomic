import React, { useEffect, useRef, useState } from 'react'

function Logs({ api }) {
  const [lines, setLines] = useState([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('')
  const bottomRef = useRef(null)

  async function load() {
    setLoading(true)
    try {
      const d = await api('/logs')
      if (d) setLines(Array.isArray(d.lines) ? d.lines : [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const i = setInterval(load, 10000)
    return () => clearInterval(i)
  }, [api])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines])

  const filtered = lines.filter(l => !filter || l.toLowerCase().includes(filter.toLowerCase())).join('\n')

  return (
    <div className="card logs">
      <div className="card-title flex-between">
        <span>ASB Logs</span>
        <div>
          <input placeholder="Filter..." value={filter} onChange={e => setFilter(e.target.value)} />
          <button onClick={load} disabled={loading}>{loading ? 'Loading...' : 'Refresh'}</button>
        </div>
      </div>
      <pre>{filtered || 'No logs available.'}</pre>
      <div ref={bottomRef} />
    </div>
  )
}

export default Logs
