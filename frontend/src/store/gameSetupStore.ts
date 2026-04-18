import { create } from 'zustand'

export type ProfessionProfile = {
  name: string
  salary: number
  expenses: number
  liabilities: number
  startingCash: number
  passiveIncome: number
}

type SetupState = {
  selected: ProfessionProfile | null
  setProfession: (p: ProfessionProfile) => void
  reset: () => void
}

const STORAGE_KEY = 'cashflow_profession_profile'

function loadInitial(): ProfessionProfile | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as ProfessionProfile) : null
  } catch {
    return null
  }
}

export const useGameSetupStore = create<SetupState>((set) => ({
  selected: loadInitial(),
  setProfession: (selected) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(selected))
    set({ selected })
  },
  reset: () => {
    localStorage.removeItem(STORAGE_KEY)
    set({ selected: null })
  },
}))

export const PROFESSION_TEMPLATES: ProfessionProfile[] = [

]

 