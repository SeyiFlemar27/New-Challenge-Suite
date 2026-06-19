import { create } from "zustand";
import type { RegionCode } from "@/lib/types";

interface UiState {
  region?: RegionCode;
  notificationsEnabled: boolean;
  setRegion: (region: RegionCode) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  region: undefined,
  notificationsEnabled: false,
  setRegion: (region) => {
    if (typeof window !== "undefined") localStorage.setItem("challenge-suite-region", region);
    set({ region });
  },
  setNotificationsEnabled: (notificationsEnabled) => set({ notificationsEnabled })
}));
