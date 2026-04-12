import React from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, COLORS_ALPHA } from '@/constants/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearGuestId } from '@/utils/guestId';

interface GuestGateProps {
    title?: string;
    message?: string;
    iconName?: keyof typeof Ionicons.glyphMap;
}

export function GuestGate({ 
    title = "Unlock your profile", 
    message = "Create an account to upload a resume, permanently save your preferences, and sync your applications across devices.",
    iconName = "person-circle-outline"
}: GuestGateProps) {
    const router = useRouter();
    const insets = useSafeAreaInsets();

    return (
        <View style={[styles.container, { paddingTop: insets.top + 60 }]}>
            <View style={styles.iconCircle}>
                <Ionicons name={iconName} size={48} color={COLORS.accent} />
            </View>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.message}>{message}</Text>

            <View style={styles.benefitsBox}>
                <View style={styles.benefitRow}>
                    <Ionicons name="checkmark-circle" size={20} color={COLORS.accentSuccess} />
                    <Text style={styles.benefitText}>Save roles across devices</Text>
                </View>
                <View style={styles.benefitRow}>
                    <Ionicons name="checkmark-circle" size={20} color={COLORS.accentSuccess} />
                    <Text style={styles.benefitText}>Upload and parse your CV</Text>
                </View>
                <View style={styles.benefitRow}>
                    <Ionicons name="checkmark-circle" size={20} color={COLORS.accentSuccess} />
                    <Text style={styles.benefitText}>Better matchmaking AI</Text>
                </View>
            </View>

            <View style={styles.buttonContainer}>
                <Pressable style={styles.primaryButton} onPress={() => router.push('/(auth)/signup')}>
                    <Text style={styles.primaryButtonText}>Sign Up</Text>
                </Pressable>
                
                <Pressable style={styles.secondaryButton} onPress={() => router.push('/(auth)/login')}>
                    <Text style={styles.secondaryButtonText}>Log In</Text>
                </Pressable>
            </View>

            {__DEV__ && (
                <Pressable 
                    style={styles.devWipeButton} 
                    onPress={async () => {
                        try {
                            await clearGuestId();
                            await AsyncStorage.multiRemove([
                                'swipturn:onboarding_done:guest',
                                'swipturn:onboarding_started:guest',
                                'swipturn_feed_cache',
                                'guestId'
                            ]);
                            Alert.alert('Dev Data Wiped', 'Guest ID and onboarding data removed. Please force restart the app for a clean state.');
                        } catch (e) {
                            Alert.alert('Error', 'Failed to wipe guest data');
                        }
                    }}
                >
                    <Text style={styles.devWipeText}>DEV: Wipe Guest Data</Text>
                </Pressable>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
        alignItems: 'center',
        paddingHorizontal: 32,
    },
    iconCircle: {
        width: 96,
        height: 96,
        borderRadius: 48,
        backgroundColor: COLORS_ALPHA.accentLight,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
    },
    title: {
        fontFamily: 'ClashDisplay-Bold',
        fontSize: 28,
        color: COLORS.textPrimary,
        textAlign: 'center',
        marginBottom: 12,
    },
    message: {
        fontFamily: 'Satoshi-Regular',
        fontSize: 15,
        color: COLORS.textMuted,
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 32,
    },
    benefitsBox: {
        backgroundColor: COLORS.surface,
        borderRadius: 16,
        padding: 20,
        width: '100%',
        gap: 12,
        marginBottom: 36,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 10,
        elevation: 2,
    },
    benefitRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    benefitText: {
        fontFamily: 'Satoshi-Medium',
        fontSize: 15,
        color: COLORS.textPrimary,
    },
    buttonContainer: {
        width: '100%',
        gap: 12,
    },
    primaryButton: {
        backgroundColor: COLORS.accent,
        width: '100%',
        paddingVertical: 16,
        borderRadius: 50,
        alignItems: 'center',
        justifyContent: 'center',
    },
    primaryButtonText: {
        fontFamily: 'Satoshi-Bold',
        fontSize: 16,
        color: 'white',
    },
    secondaryButton: {
        backgroundColor: COLORS.surface,
        borderWidth: 1,
        borderColor: COLORS.border,
        width: '100%',
        paddingVertical: 16,
        borderRadius: 50,
        alignItems: 'center',
        justifyContent: 'center',
    },
    secondaryButtonText: {
        fontFamily: 'Satoshi-Bold',
        fontSize: 16,
        color: COLORS.textPrimary,
    },
    devWipeButton: {
        marginTop: 24,
        paddingVertical: 8,
        paddingHorizontal: 16,
        backgroundColor: 'rgba(255, 59, 48, 0.1)',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(255, 59, 48, 0.5)',
    },
    devWipeText: {
        color: '#FF3B30',
        fontFamily: 'Satoshi-Bold',
        fontSize: 12,
        textAlign: 'center',
    },
});
