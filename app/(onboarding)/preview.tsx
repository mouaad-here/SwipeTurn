import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OnboardingStepIndicator } from '@/components/onboarding-step-indicator';
import { API_URL } from '@/constants/api';
import { COLORS } from '@/constants/colors';
import { useAuthHeaders } from '@/hooks/useAuthHeaders';
import { clearDraft, getDraft, type OnboardingState } from '@/lib/onboarding-storage';

const GEOGRAPHY_LABELS: Record<string, string> = {
  morocco: 'Morocco only',
  global: 'Global remote / international',
  both: 'Both',
};

const RELOCATION_LABELS: Record<string, string> = {
  remote_only: 'Remote only',
  open_to_relocation: 'Open to relocation',
  remote_only_for_now: 'Remote only for now',
};

const SENIORITY_LABELS: Record<string, string> = {
  intern: 'Student / Intern',
  junior: 'Junior (0-2 yrs)',
  mid: 'Mid (2-5 yrs)',
  senior: 'Senior (5+ yrs)',
};

const JOB_TYPE_LABELS: Record<string, string> = {
  permanent: 'Permanent (CDI)',
  'fixed-term': 'Fixed-term (CDD)',
  internship: 'Internship (Stage)',
};

function SectionCard({
  label,
  children,
  onEdit,
}: {
  label: string;
  children: React.ReactNode;
  onEdit: () => void;
}) {
  return (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionLabel}>{label}</Text>
        <Pressable onPress={onEdit} hitSlop={8}>
          <Text style={styles.editText}>Edit</Text>
        </Pressable>
      </View>
      {children}
    </View>
  );
}

export default function PreviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { getAuthHeaders } = useAuthHeaders();
  const [draft, setDraft] = useState<Partial<OnboardingState>>({});
  const [displayName, setDisplayName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cvUploading, setCvUploading] = useState(false);
  const [cvError, setCvError] = useState<string | null>(null);
  const [extractedSkills, setExtractedSkills] = useState<string[]>([]);
  const [extractedExperienceLevel, setExtractedExperienceLevel] = useState<string | null>(null);
  const [cvUploaded, setCvUploaded] = useState(false);

  const loadDraft = useCallback(async () => {
    const d = await getDraft();
    setDraft(d);
    if (d.name) setDisplayName(d.name);
  }, []);

  useEffect(() => {
    loadDraft();
  }, [loadDraft]);

  const handleGetStarted = async () => {
    setError(null);
    setIsSubmitting(true);

    const payload = {
      geography: draft.geography ?? 'both',
      relocation_preference: draft.relocation_preference ?? null,
      seniority: draft.seniority ?? 'mid',
      job_type: draft.job_type ?? [],
      domains: draft.domains ?? [],
      subcategories: draft.subcategories ?? [],
      keywords: draft.keywords ?? [],
      name: displayName.trim() || undefined,
    };

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_URL}/users/onboarding/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.detail || data.error || `Request failed (${res.status})`);
        setIsSubmitting(false);
        return;
      }

      await clearDraft();
      router.replace('/(tabs)/swipe');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  };

  const geographyText = draft.geography
    ? GEOGRAPHY_LABELS[draft.geography] ?? draft.geography
    : '—';
  const relocationText =
    draft.relocation_preference && (draft.geography === 'global' || draft.geography === 'both')
      ? RELOCATION_LABELS[draft.relocation_preference] ?? draft.relocation_preference
      : null;
  const seniorityText = draft.seniority
    ? SENIORITY_LABELS[draft.seniority] ?? draft.seniority
    : '—';
  const jobTypesText =
    draft.job_type?.length && draft.job_type.length > 0
      ? draft.job_type.map((t) => JOB_TYPE_LABELS[t] ?? t).join(', ')
      : '—';
  const domainsText =
    [...(draft.domains ?? []), ...(draft.subcategories ?? [])].join(', ') || '—';
  const skillsText = draft.keywords?.length
    ? draft.keywords.join(', ')
    : '—';

  const handleUploadCv = useCallback(async () => {
    setCvError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const file = result.assets[0];
      setCvUploading(true);
      const formData = new FormData();
      formData.append('file', {
        uri: file.uri,
        name: file.name,
        type: file.mimeType ?? 'application/pdf',
      } as unknown as Blob);
      formData.append(
        'preferences',
        JSON.stringify({
          geography: draft.geography,
          seniority: draft.seniority,
          domains: draft.domains,
          keywords: draft.keywords,
        })
      );
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_URL}/users/upload-cv`, {
        method: 'POST',
        headers: { ...headers },
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCvError(data.detail ?? data.error ?? `Upload failed (${res.status})`);
        return;
      }
      if (data.success && data.data) {
        setExtractedSkills(Array.isArray(data.data.skills) ? data.data.skills : []);
        setExtractedExperienceLevel(data.data.experience_level ?? null);
        setCvUploaded(true);
      }
    } catch (err) {
      setCvError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setCvUploading(false);
    }
  }, [draft.geography, draft.seniority, draft.domains, draft.keywords, getAuthHeaders]);

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </Pressable>
        <OnboardingStepIndicator step={6} total={6} />
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 + 100 }]}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.heading}>Review your preferences</Text>
        <Text style={styles.subtitle}>
          Make sure everything looks good. You can edit any section below.
        </Text>

        <SectionCard label="Geography" onEdit={() => router.push('/(onboarding)/geography')}>
          <Text style={styles.sectionValue}>
            {geographyText}
            {relocationText ? ` • ${relocationText}` : ''}
          </Text>
        </SectionCard>

        <SectionCard label="Seniority" onEdit={() => router.push('/(onboarding)/seniority')}>
          <Text style={styles.sectionValue}>{seniorityText}</Text>
        </SectionCard>

        <SectionCard label="Job types" onEdit={() => router.push('/(onboarding)/job-type')}>
          <Text style={styles.sectionValue}>{jobTypesText}</Text>
        </SectionCard>

        <SectionCard label="Domains & subcategories" onEdit={() => router.push('/(onboarding)/domains')}>
          <Text style={styles.sectionValue}>{domainsText}</Text>
        </SectionCard>

        <SectionCard label="Skills & keywords" onEdit={() => router.push('/(onboarding)/skills')}>
          <Text style={styles.sectionValue}>{skillsText}</Text>
        </SectionCard>

        <View style={styles.cvSection}>
          <Text style={styles.cvSectionLabel}>CV (optional)</Text>
          <Text style={styles.cvSectionHint}>
            Upload your CV so we can extract skills and improve job matching.
          </Text>
          {!cvUploaded ? (
            <Pressable
              style={[styles.uploadCvButton, cvUploading && styles.uploadCvButtonDisabled]}
              onPress={handleUploadCv}
              disabled={cvUploading}
            >
              {cvUploading ? (
                <ActivityIndicator size="small" color={COLORS.accent} />
              ) : (
                <>
                  <Ionicons name="document-attach-outline" size={20} color={COLORS.accent} />
                  <Text style={styles.uploadCvButtonText}>Upload PDF or DOCX</Text>
                </>
              )}
            </Pressable>
          ) : (
            <View style={styles.extractedBlock}>
              <View style={styles.extractedRow}>
                <Ionicons name="checkmark-circle" size={20} color={COLORS.accentSuccess} />
                <Text style={styles.extractedTitle}>CV uploaded — we use this for matching</Text>
              </View>
              {extractedExperienceLevel && (
                <Text style={styles.extractedMeta}>
                  Experience level: {SENIORITY_LABELS[extractedExperienceLevel] ?? extractedExperienceLevel}
                </Text>
              )}
              {extractedSkills.length > 0 && (
                <>
                  <Text style={styles.skillsUsedLabel}>Skills we use for matching:</Text>
                  <View style={styles.skillsChipWrap}>
                    {extractedSkills.map((s) => (
                      <View key={s} style={styles.skillChip}>
                        <Text style={styles.skillChipText}>{s}</Text>
                      </View>
                    ))}
                  </View>
                </>
              )}
            </View>
          )}
          {cvError ? <Text style={styles.cvErrorText}>{cvError}</Text> : null}
        </View>

        <View style={styles.displayNameSection}>
          <Text style={styles.displayNameLabel}>Display name (optional)</Text>
          <TextInput
            style={styles.displayNameInput}
            placeholder="How should we call you?"
            placeholderTextColor={COLORS.textMeta}
            value={displayName}
            onChangeText={setDisplayName}
          />
        </View>

        {error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : null}
      </ScrollView>

      <View style={[styles.bottomArea, { paddingBottom: insets.bottom + 24 }]}>
        <Pressable
          style={[styles.getStartedButton, isSubmitting && styles.getStartedDisabled]}
          disabled={isSubmitting}
          onPress={handleGetStarted}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color={COLORS.surface} />
          ) : (
            <Text style={styles.getStartedText}>Get Started</Text>
          )}
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
    marginBottom: 12,
  },
  subtitle: {
    fontFamily: 'Satoshi-Regular',
    fontSize: 15,
    color: COLORS.textMuted,
    marginBottom: 32,
  },
  sectionCard: {
    backgroundColor: COLORS.surface2,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionLabel: {
    fontFamily: 'ClashDisplay-Bold',
    fontSize: 16,
    color: COLORS.textPrimary,
  },
  editText: {
    fontFamily: 'Satoshi-Medium',
    fontSize: 14,
    color: COLORS.accent,
  },
  sectionValue: {
    fontFamily: 'Satoshi-Regular',
    fontSize: 15,
    color: COLORS.textMuted,
    lineHeight: 22,
  },
  cvSection: {
    marginBottom: 24,
  },
  cvSectionLabel: {
    fontFamily: 'ClashDisplay-Bold',
    fontSize: 16,
    color: COLORS.textPrimary,
    marginBottom: 6,
  },
  cvSectionHint: {
    fontFamily: 'Satoshi-Regular',
    fontSize: 14,
    color: COLORS.textMuted,
    marginBottom: 12,
  },
  uploadCvButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.surface2,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderStyle: 'dashed',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  uploadCvButtonDisabled: {
    opacity: 0.7,
  },
  uploadCvButtonText: {
    fontFamily: 'Satoshi-Medium',
    fontSize: 15,
    color: COLORS.accent,
  },
  extractedBlock: {
    backgroundColor: COLORS.surface2,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  extractedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  extractedTitle: {
    fontFamily: 'Satoshi-Medium',
    fontSize: 15,
    color: COLORS.textPrimary,
  },
  extractedMeta: {
    fontFamily: 'Satoshi-Regular',
    fontSize: 14,
    color: COLORS.textMuted,
    marginBottom: 12,
  },
  skillsUsedLabel: {
    fontFamily: 'Satoshi-Medium',
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: 8,
  },
  skillsChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  skillChip: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  skillChipText: {
    fontFamily: 'Satoshi-Regular',
    fontSize: 13,
    color: COLORS.textPrimary,
  },
  cvErrorText: {
    fontFamily: 'Satoshi-Regular',
    fontSize: 13,
    color: '#DC2626',
    marginTop: 8,
  },
  displayNameSection: {
    marginTop: 8,
    marginBottom: 24,
  },
  displayNameLabel: {
    fontFamily: 'Satoshi-Medium',
    fontSize: 14,
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  displayNameInput: {
    fontFamily: 'Satoshi-Regular',
    fontSize: 16,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.surface2,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  errorText: {
    fontFamily: 'Satoshi-Regular',
    fontSize: 14,
    color: '#DC2626',
    marginTop: 8,
    marginBottom: 16,
  },
  bottomArea: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
    paddingTop: 16,
    backgroundColor: COLORS.surface,
  },
  getStartedButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 16,
    paddingVertical: 18,
    minHeight: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  getStartedDisabled: {
    opacity: 0.7,
  },
  getStartedText: {
    fontFamily: 'Satoshi-Medium',
    fontSize: 17,
    color: COLORS.surface,
  },
});
