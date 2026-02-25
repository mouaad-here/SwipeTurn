import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

const MOCK_SKILLS = [
    "React Native",
    "TypeScript",
    "Node.js",
    "UX Design",
    "Figma"
];

export default function CvUploadScreen() {
    const router = useRouter();
    const [uploadState, setUploadState] = useState<'idle' | 'loading' | 'success'>('idle');
    const [fileName, setFileName] = useState<string>('');
    const [skills, setSkills] = useState<string[]>(MOCK_SKILLS);

    const [isAddingSkill, setIsAddingSkill] = useState(false);
    const [newSkillText, setNewSkillText] = useState('');

    // Mock functions for dynamic adding/removing skills
    const handleRemoveSkill = (skillToRemove: string) => {
        setSkills(prev => prev.filter(skill => skill !== skillToRemove));
    }

    const handleSubmitNewSkill = () => {
        const trimmed = newSkillText.trim();
        if (trimmed.length > 0 && !skills.includes(trimmed)) {
            setSkills(prev => [...prev, trimmed]);
        }
        setNewSkillText('');
        setIsAddingSkill(false);
    }

    const handleUpload = () => {
        // Simulate file picking and parsing
        setUploadState('loading');
        setFileName('resume_2026.pdf');

        setTimeout(() => {
            setUploadState('success');
        }, 2000); // 2 second mock delay
    };

    return (
        <View style={styles.container}>
            <StatusBar style="dark" />

            {/* Header */}
            <View style={styles.header}>
                <Pressable onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color="#111827" />
                </Pressable>
                <Text style={styles.headerTitle}>Upload your CV</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} bounces={false}>

                {/* Upload Zone */}
                {uploadState !== 'success' && (
                    <TouchableOpacity
                        style={styles.uploadZone}
                        activeOpacity={0.7}
                        onPress={handleUpload}
                        disabled={uploadState === 'loading'}
                    >
                        {uploadState === 'idle' ? (
                            <>
                                <View style={styles.iconCircle}>
                                    <Text style={styles.uploadArrow}>↑</Text>
                                </View>
                                <Text style={styles.uploadTitle}>Tap to upload your CV</Text>
                                <Text style={styles.uploadSubtitle}>PDF or DOCX supported (Max 5MB)</Text>
                                <View style={styles.selectFileButton}>
                                    <Text style={styles.selectFileButtonText}>Select File</Text>
                                </View>
                            </>
                        ) : (
                            <View style={styles.loadingContainer}>
                                <ActivityIndicator size="large" color="#FF4422" />
                                <Text style={styles.uploadTitle}>Reading your CV...</Text>
                                <Text style={styles.uploadSubtitle}>{fileName}</Text>
                            </View>
                        )}
                    </TouchableOpacity>
                )}

                {/* Success State (Post-Parse) */}
                {uploadState === 'success' && (
                    <View style={styles.successContainer}>
                        <View style={styles.uploadZoneSuccess}>
                            <Ionicons name="document-text" size={32} color="#10B981" />
                            <View style={{ marginLeft: 16 }}>
                                <Text style={[styles.uploadTitle, { fontSize: 16 }]}>{fileName}</Text>
                                <Text style={styles.uploadSubtitle}>Successfully uploaded</Text>
                            </View>
                        </View>

                        <View style={styles.progressBarContainer}>
                            <View style={styles.progressBarFill} />
                        </View>

                        <View style={styles.skillsHeaderRow}>
                            <Text style={styles.skillsHeader}>Skills we found</Text>
                            <Ionicons name="checkmark-circle" size={18} color="#10B981" />
                        </View>

                        <View style={styles.skillsGrid}>
                            {skills.map((skill) => (
                                <View key={skill} style={styles.skillChip}>
                                    <Text style={styles.skillChipText}>{skill}</Text>
                                    <Pressable onPress={() => handleRemoveSkill(skill)}>
                                        <Ionicons name="close" size={16} color="#10B981" style={{ marginLeft: 4 }} />
                                    </Pressable>
                                </View>
                            ))}
                            {isAddingSkill ? (
                                <View style={styles.addMoreInputContainer}>
                                    <TextInput
                                        style={styles.addMoreInput}
                                        value={newSkillText}
                                        onChangeText={setNewSkillText}
                                        placeholder="Type skill..."
                                        placeholderTextColor="#9CA3AF"
                                        autoFocus
                                        onSubmitEditing={handleSubmitNewSkill}
                                        onBlur={() => setIsAddingSkill(false)}
                                    />
                                </View>
                            ) : (
                                <Pressable
                                    style={styles.addMoreChip}
                                    onPress={() => setIsAddingSkill(true)}
                                >
                                    <Text style={styles.addMoreText}>+ Add more</Text>
                                </Pressable>
                            )}
                        </View>
                    </View>
                )}

            </ScrollView>

            {/* Footer */}
            {uploadState === 'success' && (
                <View style={styles.bottomArea}>
                    <Pressable
                        style={styles.nextButton}
                        onPress={() => router.replace('/(tabs)/swipe')}
                    >
                        <Text style={styles.nextButtonText}>Looks good, continue →</Text>
                    </Pressable>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 60,
        paddingHorizontal: 24,
        marginBottom: 32,
    },
    backButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
    },
    headerTitle: {
        fontFamily: 'Syne_800ExtraBold',
        fontSize: 20,
        color: '#111827',
    },
    scrollContent: {
        paddingHorizontal: 24,
        paddingBottom: 24,
    },
    uploadZone: {
        borderWidth: 1.5,
        borderStyle: 'dashed',
        borderColor: 'rgba(255, 68, 34, 0.4)',
        borderRadius: 20,
        paddingVertical: 44,
        alignItems: 'center',
        backgroundColor: '#FFF8F7',
        gap: 12,
    },
    uploadZoneSuccess: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 16,
        backgroundColor: '#FFFFFF',
    },
    iconCircle: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: 'rgba(255, 68, 34, 0.10)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    uploadArrow: {
        fontFamily: 'Syne_800ExtraBold',
        fontSize: 28,
        color: '#FF4422',
    },
    uploadTitle: {
        fontFamily: 'Syne_800ExtraBold',
        fontSize: 18,
        color: '#111827',
        textAlign: 'center',
    },
    uploadSubtitle: {
        fontFamily: 'DMSans_400Regular',
        fontSize: 13,
        color: '#6B7280',
        textAlign: 'center',
        marginTop: -4,
    },
    selectFileButton: {
        backgroundColor: '#111827',
        borderRadius: 50,
        paddingHorizontal: 32,
        paddingVertical: 12,
        marginTop: 8,
    },
    selectFileButtonText: {
        color: 'white',
        fontFamily: 'DMSans_500Medium',
        fontSize: 14,
    },
    loadingContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        paddingVertical: 20,
    },
    successContainer: {
        marginTop: 8,
    },
    progressBarContainer: {
        height: 3,
        backgroundColor: '#E5E7EB',
        borderRadius: 2,
        marginVertical: 20,
        overflow: 'hidden',
    },
    progressBarFill: {
        height: '100%',
        width: '100%', // Simulating completion
        backgroundColor: '#10B981',
    },
    skillsHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
        gap: 8,
    },
    skillsHeader: {
        fontFamily: 'DMSans_500Medium',
        fontSize: 16,
        color: '#10B981',
    },
    skillsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    skillChip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#ECFDF5', // Extremely soft green
        borderWidth: 1,
        borderColor: '#10B981',
        borderRadius: 50,
        paddingVertical: 10,
        paddingHorizontal: 16,
    },
    skillChipText: {
        fontFamily: 'DMSans_500Medium',
        fontSize: 14,
        color: '#10B981',
    },
    addMoreChip: {
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: '#9CA3AF',
        borderRadius: 50,
        paddingVertical: 10,
        paddingHorizontal: 16,
        justifyContent: 'center',
    },
    addMoreText: {
        fontFamily: 'DMSans_500Medium',
        fontSize: 14,
        color: '#9CA3AF',
    },
    addMoreInputContainer: {
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: '#111827',
        borderRadius: 50,
        paddingHorizontal: 16,
        justifyContent: 'center',
        minWidth: 100,
        height: 42,
    },
    addMoreInput: {
        fontFamily: 'DMSans_500Medium',
        fontSize: 14,
        color: '#111827',
        padding: 0,
        margin: 0,
    },
    bottomArea: {
        paddingHorizontal: 24,
        paddingBottom: 40,
        paddingTop: 16,
    },
    nextButton: {
        backgroundColor: '#FF4422',
        borderRadius: 50,
        paddingVertical: 18,
        alignItems: 'center',
    },
    nextButtonText: {
        fontFamily: 'DMSans_500Medium',
        fontSize: 17,
        color: 'white',
    },
});
