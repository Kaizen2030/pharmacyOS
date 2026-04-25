import { createContext, useContext } from 'react'

export const PharmacyContext = createContext(null)
export function usePharmacy() { return useContext(PharmacyContext) }
