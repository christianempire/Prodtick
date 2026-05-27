import { create } from 'zustand'
import type { ProdtickData, Task } from '@shared/types'
import { prodtick } from '../api'
import { isMockMode, mockData } from '../devMocks'

interface State {
  data: ProdtickData | null
  setData: (d: ProdtickData) => void
}

export const useTasks = create<State>(set => ({
  data: null,
  setData: d => set({ data: d })
}))

export function selectActive(state: State): Task[] {
  return state.data?.active ?? []
}
export function selectDone(state: State): Task[] {
  return state.data?.done ?? []
}

export async function initTasks() {
  if (isMockMode()) {
    useTasks.getState().setData(mockData())
    return () => {}
  }
  const initial = await prodtick.getData()
  useTasks.getState().setData(initial)
  return prodtick.onData(d => useTasks.getState().setData(d))
}
