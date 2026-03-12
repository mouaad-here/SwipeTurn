import { OnboardingStepIndicator } from '@/components/onboarding-step-indicator';
import { COLORS } from '@/constants/colors';
import { getDraft, saveDraftStep } from '@/lib/onboarding-storage';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const GEOGRAPHY_OPTIONS = [
  { value: 'morocco', label: 'Morocco only' },
  { value: 'global', label: 'Global remote / international' },
  { value: 'both', label: 'Both' },
] as const;

const RELOCATION_OPTIONS = [
  { value: 'remote_only', label: 'Remote only' },
  { value: 'open_to_relocation', label: 'Open to relocation' },
  { value: 'remote_only_for_now', label: 'Remote only for now' },
] as const;

export default function GeographyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [geography, setGeography] = useState<string | null>(null);
  const [relocationPreference, setRelocationPreference] = useState<
    string | null
  >(null);

  const showRelocationQuestion =
    geography === 'global' || geography === 'both';

  const canContinue = geography
    ? showRelocationQuestion
      ? !!relocationPreference
      : true
    : false;

  const loadDraft = useCallback(async () => {
    const draft = await getDraft();
    if (draft.geography) setGeography(draft.geography);
    if (draft.relocation_preference)
      setRelocationPreference(draft.relocation_preference);
  }, []);

  useEffect(() => {
    loadDraft();
  }, [loadDraft]);

  const handleContinue = async () => {
    if (!canContinue) return;
    await saveDraftStep({
      geography: geography!,
      relocation_preference: showRelocationQuestion
        ? relocationPreference!
        : undefined,
    });
    router.push('/(onboarding)/seniority');
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Pressable onPress={() => router.replace('/')} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </Pressable>
        <OnboardingStepIndicator step={1} total={6} />
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>Where do you want to work?</Text>

        <View style={styles.options}>
          {GEOGRAPHY_OPTIONS.map((opt) => {
            const isSelected = geography === opt.value;
            return (
              <Pressable
                key={opt.value}
                style={[styles.option, isSelected && styles.optionSelected]}
                onPress={() => {
                  setGeography(opt.value);
                  if (opt.value === 'morocco') setRelocationPreference(null);
                }}
              >
                <Text
                  style={[
                    styles.optionLabel,
                    isSelected && styles.optionLabelSelected,
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {showRelocationQuestion && (
          <View style={styles.followUp}>
            <Text style={styles.followUpHeading}>
              Are you open to relocation?
            </Text>
            {RELOCATION_OPTIONS.map((opt) => {
              const isSelected = relocationPreference === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  style={[styles.option, isSelected && styles.optionSelected]}
                  onPress={() => setRelocationPreference(opt.value)}
                >
                  <Text
                    style={[
                      styles.optionLabel,
                      isSelected && styles.optionLabelSelected,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      <View style={[styles.bottomArea, { paddingBottom: insets.bottom + 24 }]}>
        <Pressable
          style={[styles.continueButton, !canContinue && styles.continueDisabled]}
          disabled={!canContinue}
          onPress={handleContinue}
        >
          <Text style={styles.continueText}>Continue</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  backButton: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  progress: {
    fontFamily: 'Satoshi-Regular',
    fontSize: 14,
    color: COLORS.textMeta,
  },
  placeholder: {
    width: 48,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  heading: {
    fontFamily: 'ClashDisplay-Bold',
    fontSize: 28,
    lineHeight: 36,
    color: COLORS.textPrimary,
    marginBottom: 32,
  },
  options: {
    gap: 12,
  },
  option: {
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 24,
    minHeight: 56,
    justifyContent: 'center',
  },
  optionSelected: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentTint,
  },
  optionLabel: {
    fontFamily: 'Satoshi-Regular',
    fontSize: 17,
    color: COLORS.textPrimary,
  },
  optionLabelSelected: {
    fontFamily: 'Satoshi-Medium',
    color: COLORS.textPrimary,
  },
  followUp: {
    marginTop: 32,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 12,
  },
  followUpHeading: {
    fontFamily: 'ClashDisplay-Bold',
    fontSize: 20,
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  bottomArea: {
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  continueButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 16,
    paddingVertical: 18,
    minHeight: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  continueDisabled: {
    opacity: 0.4,
  },
  continueText: {
    fontFamily: 'Satoshi-Medium',
    fontSize: 17,
    color: COLORS.surface,
  },
});
