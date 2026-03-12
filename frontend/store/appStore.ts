import { create } from 'zustand';

export interface Job {
    id: string;
    title: string;
    company: string;
    location: string;
    remote?: boolean;
    description: string;
    skills: { name: string; matched: boolean }[];
    matchScore: number;
    timeAgo?: string;
    status?: 'SAVED' | 'APPLIED';
}

interface AppState {
    feed: Job[];
    savedJobs: Job[];
    setFeed: (jobs: Job[]) => void;
    saveJob: (job: Job) => void;
    applyJob: (job: Job) => void;
}

export const useAppStore = create<AppState>((set) => ({
    feed: [],
    savedJobs: [],
    setFeed: (jobs) => set({ feed: jobs }),
    saveJob: (job) => set((state) => {
        // Prevent duplicate saves
        if (state.savedJobs.find(j => j.id === job.id)) return state;
        return {
            savedJobs: [...state.savedJobs, { ...job, status: 'SAVED', timeAgo: 'JUST NOW' }]
        };
    }),
    applyJob: (job) => set((state) => {
        // Prevent duplicate applies, or upgrade a saved job to applied
        const existingList = state.savedJobs.filter(j => j.id !== job.id);
        return {
            savedJobs: [...existingList, { ...job, status: 'APPLIED', timeAgo: 'JUST NOW' }]
        };
    })
}));
