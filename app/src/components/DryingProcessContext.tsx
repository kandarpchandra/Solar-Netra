import React, { createContext, ReactNode, useCallback, useContext, useState } from 'react';

// Define the shape of the drying process state
export interface DryingState {
  isDrying: boolean;
  currentFruit: string;
  currentFilename: string;
  dryingStartTime: number | null; // Unix timestamp for when drying started
  lastDryingDetails: { fruit: string; filename: string; } | null; // For persistence and auto-fill
}

// Define the shape of the actions that can modify the drying process state
interface DryingActions {
  setDryingProcess: (state: Partial<DryingState>) => void; // Allow partial updates
  resetDryingProcess: () => void;
}

// Combine state and actions into one context value type
interface DryingContextType extends DryingState, DryingActions {}

// Initial state for the drying process
const initialDryingState: DryingState = {
  isDrying: false,
  currentFruit: '',
  currentFilename: '',
  dryingStartTime: null,
  lastDryingDetails: null,
};

// Create the context
const DryingContext = createContext<DryingContextType | undefined>(undefined);

// Props for the provider component
interface DryingProviderProps {
  children: ReactNode;
}

// Provider component
export const DryingProvider: React.FC<DryingProviderProps> = ({ children }) => {
  const [dryingState, setDryingState] = useState<DryingState>(initialDryingState);

  const setDryingProcess = useCallback((newState: Partial<DryingState>) => {
    setDryingState(prev => {
      const updatedState = { ...prev, ...newState };
      console.log('Drying state updated:', updatedState);
      return updatedState;
    });
  }, []);

  const resetDryingProcess = useCallback(() => {
    setDryingState(initialDryingState);
    console.log('Drying state reset to initial state.');
  }, []);

  const contextValue: DryingContextType = {
    ...dryingState,
    setDryingProcess,
    resetDryingProcess,
  };

  return (
    <DryingContext.Provider value={contextValue}>
      {children}
    </DryingContext.Provider>
  );
};

// Custom hook to use the drying context
export const useDrying = () => {
  const context = useContext(DryingContext);
  if (context === undefined) {
    throw new Error('useDrying must be used within a DryingProvider');
  }
  return context;
};
