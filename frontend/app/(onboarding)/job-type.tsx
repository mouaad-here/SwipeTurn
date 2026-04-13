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

const JOB_TYPE_OPTIONS = [
  { value: 'permanent', label: 'Permanent (CDI)' },
  { value: 'fixed-term', label: 'Fixed-term (CDD)' },
  { value: 'internship', label: 'Internship (Stage)' },
] as const;

export default function JobTypeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const isEditing = params.mode === 'edit';

  const insets = useSafeAreaInsets();
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);

  const loadDraft = useCallback(async () => {
    const draft = await getDraft();
    if (draft.job_type && draft.job_type.length > 0) {
      setSelectedTypes(draft.job_type);
    }
  }, []);

  useEffect(() => {
    loadDraft();
  }, [loadDraft]);

  const toggleType = (value: string) => {
    setSelectedTypes((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  const handleSkip = () => {
    if (isEditing) {
      if (router.canGoBack()) router.back();
      else router.replace('/(onboarding)/preview');
    } else {
      router.push('/(onboarding)/domains');
    }
  };

  const handleContinue = async () => {
    await saveDraftStep({ job_type: selectedTypes });
    if (isEditing) {
      if (router.canGoBack()) router.back();
      else router.replace('/(onboarding)/preview');
    } else {
      router.push('/(onboarding)/domains');
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
        <OnboardingStepIndicator step={3} total={6} />
        <Pressable onPress={handleSkip} style={styles.skipButton}>
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>What type of position?</Text>

        <View style={styles.chipRow}>
          {JOB_TYPE_OPTIONS.map((opt) => {
            const isSelected = selectedTypes.includes(opt.value);
            return (
              <Pressable
                key={opt.value}
                style={[styles.chip, isSelected && styles.chipSelected]}
                onPress={() => toggleType(opt.value)}
              >
                <Text
                  style={[
                    styles.chipLabel,
                    isSelected && styles.chipLabelSelected,
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={[styles.bottomArea, { paddingBottom: insets.bottom + 24 }]}>
        <Pressable style={styles.continueButton} onPress={handleContinue}>
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
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  chip: {
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    borderRadius: 50,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  chipSelected: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accentTint,
  },
  chipLabel: {
    fontFamily: 'Satoshi-Regular',
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  chipLabelSelected: {
    fontFamily: 'Satoshi-Medium',
    color: COLORS.textPrimary,
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
  continueText: {
    fontFamily: 'Satoshi-Medium',
    fontSize: 17,
    color: COLORS.surface,
  },
});
