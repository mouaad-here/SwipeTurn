import { COLORS, COLORS_ALPHA } from '@/constants/colors';
import { Redirect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect } from 'react';
import Animated, {
    useSharedValue,
    withTiming,
    useAnimatedStyle,
    Easing,
} from 'react-native-reanimated';
import Splash from '@/components/Splash';
import { useBootState } from '@/hooks/useBootState';

export default function WelcomeScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { bootLoading, gateLoading, isSignedIn, effectiveOnboardingDone, setGuestOnboardingStartedFlag, reportScreenPainted } = useBootState();

    const opacity = useSharedValue(0);
    const translateY = useSharedValue(20);

    useEffect(() => {
        opacity.value = withTiming(1, { duration: 800 });
        translateY.value = withTiming(0, { duration: 800, easing: Easing.out(Easing.back(1)) });
    }, []);

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [{ translateY: translateY.value }],
    }));

    if (bootLoading || gateLoading) {
        return <Splash minimal text="Loading..." />;
    }

    // Strict Layout Guard equivalent for this lone root screen
    // Auto-redirect only for signed-in users so guests remain exactly where they intend to be
    if (isSignedIn) {
        return <Redirect href={effectiveOnboardingDone ? '/(tabs)/swipe' : '/(onboarding)/geography'} />;
    }

    return (
        <View style={styles.container} onLayout={reportScreenPainted}>
            <StatusBar style="dark" />

            {/* Decorative circles */}
            <Animated.View style={[styles.circleLarge, { opacity: 0.35 }]} />
            <Animated.View style={[styles.circleSmall, { opacity: 0.25 }]} />

            {/* Top area */}
            <Animated.View style={[styles.topArea, animatedStyle]}>
                <View style={styles.logoRow}>
                    <Text style={styles.logoPrefix}>Swipe</Text>
                    <Text style={styles.logoSuffix}>Turn</Text>
                </View>
                <Text style={styles.tagline}>Swipe. Turn your career around.</Text>
            </Animated.View>

            {/* Bottom area */}
            <View style={[styles.bottomArea, { paddingBottom: insets.bottom + 24 }]}>
                <Pressable
                    style={styles.getStartedButton}
                    onPress={() => router.push('/(auth)/signup')}
                >
                    <Text style={styles.getStartedText}>Get Started</Text>
                </Pressable>

                <Pressable
                    style={styles.continueWithoutButton}
                    onPress={async () => {
                        await setGuestOnboardingStartedFlag();
                        router.push('/(onboarding)/geography');
                    }}
                >
                    <Text style={styles.continueWithoutText}>Continue without account</Text>
                </Pressable>

                <View style={styles.loginRow}>
                    <Text style={styles.loginPrefix}>Already have an account? </Text>
                    <Pressable style={styles.loginLinkTouch} onPress={() => router.push('/(auth)/login')}>
                        <Text style={styles.loginLink}>Log in</Text>
                    </Pressable>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    topArea: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
    },
    circleLarge: {
        position: 'absolute',
        width: 300,
        height: 300,
        borderRadius: 150,
        backgroundColor: COLORS_ALPHA.accentMedium,
        top: -60,
        right: -80,
    },
    circleSmall: {
        position: 'absolute',
        width: 180,
        height: 180,
        borderRadius: 90,
        backgroundColor: COLORS_ALPHA.accentMedium,
        top: 80,
        left: -40,
    },
    logoRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
    },
    logoPrefix: {
        fontFamily: 'ClashDisplay',
        fontSize: 48,
        letterSpacing: -1,
        color: COLORS.textPrimary,
    },
    logoSuffix: {
        fontFamily: 'ClashDisplay',
        fontSize: 48,
        letterSpacing: -1,
        color: COLORS.accent,
    },
    tagline: {
        fontFamily: 'Satoshi', fontWeight: '500',
        fontSize: 18,
        color: COLORS.textSecondary,
        marginTop: 16,
        textAlign: 'center',
    },
    bottomArea: {
        paddingHorizontal: 24,
        paddingBottom: 64,
        gap: 16,
    },
    getStartedButton: {
        backgroundColor: COLORS.accent,
        borderRadius: 50,
        paddingVertical: 18,
        minHeight: 56,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: COLORS.accent,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 8,
    },
    getStartedText: {
        fontFamily: 'Satoshi', fontWeight: '700',
        fontSize: 18,
        letterSpacing: 0.5,
        color: 'white',
    },
    continueWithoutButton: {
        paddingVertical: 14,
        minHeight: 56,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 4,
        backgroundColor: COLORS.surface,
        borderRadius: 50,
        borderWidth: 1,
        borderColor: COLORS.border,
        shadowColor: COLORS.shadow,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    continueWithoutText: {
        fontFamily: 'Satoshi', fontWeight: '500',
        fontSize: 16,
        color: COLORS.textSecondary,
    },
    loginRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
    },
    loginPrefix: {
        fontFamily: 'Satoshi', fontWeight: '400',
        fontSize: 14,
        color: COLORS.textMuted,
    },
    loginLink: {
        fontFamily: 'Satoshi', fontWeight: '500',
        fontSize: 14,
        color: COLORS.accent,
    },
    loginLinkTouch: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 8 },
});
