import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OnboardingStepIndicator } from '@/components/onboarding-step-indicator';
import { COLORS } from '@/constants/colors';
import { getDraft, saveDraftStep } from '@/lib/onboarding-storage';

export default function SkillsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const isEditing = params.mode === 'edit';

  const insets = useSafeAreaInsets();
  const [skills, setSkills] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState('');

  const loadDraft = useCallback(async () => {
    const draft = await getDraft();
    if (draft.keywords?.length) setSkills(draft.keywords);
  }, []);

  useEffect(() => {
    loadDraft();
  }, [loadDraft]);

  const handleAddSkill = () => {
    const trimmed = inputValue.trim();
    if (trimmed && !skills.includes(trimmed)) {
      setSkills((prev) => [...prev, trimmed]);
      setInputValue('');
    }
  };

  const handleRemoveSkill = (skill: string) => {
    setSkills((prev) => prev.filter((s) => s !== skill));
  };

  const handleSkip = () => {
    if (isEditing) {
      if (router.canGoBack()) router.back();
      else router.replace('/(onboarding)/preview');
    } else {
      router.push('/(onboarding)/preview');
    }
  };

  const handleContinue = async () => {
    await saveDraftStep({ keywords: skills });
    if (isEditing) {
      if (router.canGoBack()) router.back();
      else router.replace('/(onboarding)/preview');
    } else {
      router.push('/(onboarding)/preview');
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </Pressable>
        <OnboardingStepIndicator step={5} total={6} />
        <Pressable onPress={handleSkip} style={styles.skipButton}>
          <Text style={styles.skipText}>Skip</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>Add your skills & keywords</Text>
        <Text style={styles.subtitle}>
          Type a skill and press Add or Enter to add it. Tap X to remove.
        </Text>

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="e.g. React, Python, SQL..."
            placeholderTextColor={COLORS.textMeta}
            value={inputValue}
            onChangeText={setInputValue}
            onSubmitEditing={handleAddSkill}
            returnKeyType="done"
          />
          <Pressable
            style={[styles.addButton, !inputValue.trim() && styles.addButtonDisabled]}
            onPress={handleAddSkill}
            disabled={!inputValue.trim()}
          >
            <Text style={styles.addButtonText}>Add</Text>
          </Pressable>
        </View>

        <View style={styles.chipRow}>
          {skills.map((skill) => (
            <View key={skill} style={styles.skillChip}>
              <Text style={styles.skillChipText}>{skill}</Text>
              <Pressable
                onPress={() => handleRemoveSkill(skill)}
                style={styles.removeButton}
                hitSlop={8}
              >
                <Ionicons name="close" size={16} color={COLORS.textMuted} />
              </Pressable>
            </View>
          ))}
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
    marginBottom: 12,
  },
  subtitle: {
    fontFamily: 'Satoshi-Regular',
    fontSize: 15,
    color: COLORS.textMuted,
    marginBottom: 32,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface2,
    borderRadius: 16,
    paddingLeft: 20,
    paddingRight: 8,
    paddingVertical: 8,
    marginBottom: 24,
  },
  input: {
    flex: 1,
    fontFamily: 'Satoshi-Regular',
    fontSize: 16,
    color: COLORS.textPrimary,
    paddingVertical: 10,
  },
  addButton: {
    backgroundColor: COLORS.accent,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  addButtonDisabled: {
    opacity: 0.4,
  },
  addButtonText: {
    fontFamily: 'Satoshi-Medium',
    fontSize: 15,
    color: COLORS.surface,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  skillChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.accentTint,
    borderWidth: 1,
    borderColor: COLORS.accent,
    borderRadius: 50,
    paddingVertical: 10,
    paddingLeft: 16,
    paddingRight: 8,
  },
  skillChipText: {
    fontFamily: 'Satoshi-Medium',
    fontSize: 14,
    color: COLORS.textPrimary,
    marginRight: 6,
  },
  removeButton: {
    padding: 4,
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
