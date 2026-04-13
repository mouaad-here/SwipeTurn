import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
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
import { OnboardingStepIndicator } from '@/components/onboarding-step-indicator';
import { COLORS } from '@/constants/colors';
import { getDraft, saveDraftStep } from '@/lib/onboarding-storage';

const SENIORITY_OPTIONS = [
  { value: 'intern', label: 'Student / Intern', subtitle: 'Looking for internships & entry-level' },
  { value: 'junior', label: 'Junior (0-2 yrs)', subtitle: undefined },
  { value: 'mid', label: 'Mid (2-5 yrs)', subtitle: undefined },
  { value: 'senior', label: 'Senior (5+ yrs)', subtitle: undefined },
] as const;

export default function SeniorityScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const isEditing = params.mode === 'edit';

  const insets = useSafeAreaInsets();
  const [seniority, setSeniority] = useState<string | null>(null);

  const loadDraft = useCallback(async () => {
    const draft = await getDraft();
    if (draft.seniority) setSeniority(draft.seniority);
  }, []);

  useEffect(() => {
    loadDraft();
  }, [loadDraft]);

  const handleSkip = () => {
    if (isEditing) {
      if (router.canGoBack()) router.back();
      else router.replace('/(onboarding)/preview');
    } else {
      router.push('/(onboarding)/job-type');
    }
  };

  const handleContinue = async () => {
    if (!seniority) return;
    await saveDraftStep({ seniority });
    if (isEditing) {
      if (router.canGoBack()) router.back();
      else router.replace('/(onboarding)/preview');
    } else {
      router.push('/(onboarding)/job-type');
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </Pressable>
        <OnboardingStepIndicator step={2} total={6} />
        <Pressable onPress={handleSkip} style={styles.skipButton}>
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>What&apos;s your experience level?</Text>

        <View style={styles.options}>
          {SENIORITY_OPTIONS.map((opt) => {
            const isSelected = seniority === opt.value;
            return (
              <Pressable
                key={opt.value}
                style={[styles.option, isSelected && styles.optionSelected]}
                onPress={() => setSeniority(opt.value)}
              >
                <Text
                  style={[
                    styles.optionLabel,
                    isSelected && styles.optionLabelSelected,
                  ]}
                >
                  {opt.label}
                </Text>
                {opt.subtitle && (
                  <Text
                    style={[
                      styles.optionSubtitle,
                      isSelected && styles.optionSubtitleSelected,
                    ]}
                  >
                    {opt.subtitle}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={[styles.bottomArea, { paddingBottom: insets.bottom + 24 }]}>
        <Pressable
          style={[styles.continueButton, !seniority && styles.continueDisabled]}
          disabled={!seniority}
          onPress={handleContinue}
        >
          <Text style={styles.continueText}>{isEditing ? 'Save' : 'Continue'}</Text>
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
  skipButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  skipText: {
    fontFamily: 'Satoshi-Medium',
    fontSize: 15,
    color: COLORS.textMuted,
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
  optionSubtitle: {
    fontFamily: 'Satoshi-Regular',
    fontSize: 14,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  optionSubtitleSelected: {
    color: COLORS.textMuted,
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
