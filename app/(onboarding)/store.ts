// A simple global state/store to mock passing the location data from step 2 to step 3. 
// In a real application, this would use Zustand, Redux, React Context, or search params.
export const mockOnboardingState = {
    geography: '' as string,
    seniority: '' as string,
    selectedLocations: [] as string[],
    domains: [] as string[],
    keywords: [] as string[],
    name: '' as string,
};

export default function StoreDummyStore() { return null; }
