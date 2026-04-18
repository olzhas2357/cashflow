import { create } from 'zustand'

export type LiveNotification = {
  id: string
  type: string
  message: string
  createdAt: string
}

type NotificationState = {
  items: LiveNotification[]
  push: (item: Omit<LiveNotification, 'id' | 'createdAt'>) => void
  clear: () => void
}

export const useNotificationsStore = create<NotificationState>((set) => ({
  items: [],
  push: (item) =>
    set((state) => ({
      items: [
        {
          ...item,
          id: `${Date.now()}-${Math.random()}`,
          createdAt: new Date().toISOString(),
        },
        ...state.items,
      ].slice(0, 25),
    })),
  clear: () => set({ items: [] }),
}))

