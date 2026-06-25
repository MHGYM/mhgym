import { createContext, useContext } from 'react'

export const TrainingCtx = createContext({ bunnyLibraryId: '' })
export const useTraining = () => useContext(TrainingCtx)
