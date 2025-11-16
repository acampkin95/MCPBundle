import { create } from 'zustand';
import { KeycloakUser } from './keycloak';

interface AppState {
  user: KeycloakUser | null;
  setUser: (user: KeycloakUser | null) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  isLoading: true,
  setIsLoading: (isLoading) => set({ isLoading }),
}));
