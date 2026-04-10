import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '@/constants/colors';

export function GuestBanner() {
    const router = useRouter();

    return (
        <View style={styles.bannerContainer}>
            <View style={styles.iconBox}>
                <Ionicons name="information-circle-outline" size={24} color={COLORS.accent} />
            </View>
            <View style={styles.textContainer}>
                <Text style={styles.bannerTitle}>Saved on this device</Text>
                <Text style={styles.bannerSubtitle}>
                    Create an account to keep your saved jobs across devices.
                </Text>
            </View>
            <Pressable style={styles.actionBtn} onPress={() => router.push('/(auth)/signup')}>
                <Text style={styles.actionText}>Create account</Text>
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    bannerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.surface,
        borderRadius: 12,
        padding: 12,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: COLORS.accent,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 1,
    },
    iconBox: {
        marginRight: 12,
    },
    textContainer: {
        flex: 1,
    },
    bannerTitle: {
        fontFamily: 'Satoshi',
        fontWeight: '700',
        fontSize: 14,
        color: COLORS.textPrimary,
        marginBottom: 2,
    },
    bannerSubtitle: {
        fontFamily: 'Satoshi',
        fontWeight: '400',
        fontSize: 12,
        color: COLORS.textMuted,
        lineHeight: 16,
    },
    actionBtn: {
        backgroundColor: COLORS.accent,
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 50,
        marginLeft: 12,
    },
    actionText: {
        fontFamily: 'Satoshi',
        fontWeight: '600',
        fontSize: 12,
        color: 'white',
    },
});
