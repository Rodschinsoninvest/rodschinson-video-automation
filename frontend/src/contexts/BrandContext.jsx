import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const BrandContext = createContext()

const DEFAULT_BRANDS = [
  { id: 'rodschinson', name: 'Rodschinson Investment', shortName: 'RI', primaryColor: '#08316F', accentColor: '#C8A96E', textColor: '#FFFFFF', logoUrl: null },
  { id: 'rachid',      name: 'Rachid Chikhi',          shortName: 'RC', primaryColor: '#1a1a2e', accentColor: '#00B6FF', textColor: '#FFFFFF', logoUrl: null },
]

export function BrandProvider({ children }) {
  const [brands, setBrands]   = useState(DEFAULT_BRANDS)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/brands')
      if (!res.ok) throw new Error()
      const data = await res.json()
      if (Array.isArray(data) && data.length > 0) setBrands(data)
    } catch {
      // keep defaults
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { reload() }, [reload])

  return (
    <BrandContext.Provider value={{ brands, loading, reload }}>
      {children}
    </BrandContext.Provider>
  )
}

export const useBrands = () => useContext(BrandContext)
