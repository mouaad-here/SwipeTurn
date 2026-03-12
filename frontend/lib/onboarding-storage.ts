import AsyncStorage from '@react-native-async-storage/async-storage';

const DRAFT_KEY = 'onboarding-draft';

export interface OnboardingState {
  geography?: string;
  relocation_preference?: string;
  seniority?: string;
  job_type?: string[];
  domains?: string[];
  subcategories?: string[];
  keywords?: string[];
  name?: string;
}

export async function saveDraftStep(update: Partial<OnboardingState>) {
  const existing = await getDraft();
  const merged = { ...existing, ...update };
  await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(merged));
}

export async function getDraft(): Promise<Partial<OnboardingState>> {
  const raw = await AsyncStorage.getItem(DRAFT_KEY);
  return raw ? JSON.parse(raw) : {};
}

export async function clearDraft() {
  await AsyncStorage.removeItem(DRAFT_KEY);
}
