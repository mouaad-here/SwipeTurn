import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function WelcomeScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { isLoaded, isSignedIn } = useAuth();

    // Don't auto-redirect signed-in users: always show welcome first so users can choose
    // "Continue without account", "Get Started", or "Log in". Auth screens will redirect
    // to home when appropriate.
    // useEffect(() => {
    //     if (isLoaded && isSignedIn) {
    //         router.replace('/(tabs)/swipe');
    //     }
    // }, [isLoaded, isSignedIn]);

    if (!isLoaded) {
        return (
            <View style={[styles.container, styles.centered]}>
                <StatusBar style="dark" />
                <Text style={styles.logoPrefix}>Swip</Text>
                <Text style={styles.logoSuffix}>turn</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <StatusBar style="dark" />

            {/* Top area */}
            <View style={styles.topArea}>
                {/* Decorative elements */}
                <View style={styles.circleLarge} />
                <View style={styles.circleSmall} />

                <View style={styles.logoRow}>
                    <Text style={styles.logoPrefix}>Swip</Text>
                    <Text style={styles.logoSuffix}>turn</Text>
                </View>

                <Text style={styles.tagline}>Swipe. Turn your career around.</Text>
            </View>

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
                    onPress={() => router.replace('/(onboarding)/preferences')}
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
        backgroundColor: '#F8F9FA',
    },
    topArea: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 32,
    },
    circleLarge: {
        position: 'absolute',
        width: 260,
        height: 260,
        borderRadius: 130,
        backgroundColor: 'rgba(255,68,34,0.06)',
        top: -40,
        right: -60,
    },
    circleSmall: {
        position: 'absolute',
        width: 140,
        height: 140,
        borderRadius: 70,
        backgroundColor: 'rgba(255,68,34,0.04)',
        top: 60,
        left: -30,
    },
    logoRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
    },
    logoPrefix: {
        fontFamily: 'Syne_800ExtraBold',
        fontSize: 42,
        color: '#111827',
    },
    logoSuffix: {
        fontFamily: 'Syne_800ExtraBold',
        fontSize: 42,
        color: '#FF4422',
    },
    tagline: {
        fontFamily: 'DMSans_400Regular',
        fontSize: 16,
        color: '#6B7280',
        marginTop: 12,
        textAlign: 'center',
    },
    bottomArea: {
        paddingHorizontal: 24,
        paddingBottom: 64,
        gap: 16,
    },
    getStartedButton: {
        backgroundColor: '#FF4422',
        borderRadius: 50,
        paddingVertical: 18,
        minHeight: 48,
        justifyContent: 'center',
        alignItems: 'center',
    },
    getStartedText: {
        fontFamily: 'DMSans_500Medium',
        fontSize: 17,
        color: 'white',
    },
    continueWithoutButton: {
        paddingVertical: 14,
        minHeight: 48,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 4,
    },
    continueWithoutText: {
        fontFamily: 'DMSans_500Medium',
        fontSize: 14,
        color: '#6B7280',
    },
    loginRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
    },
    loginPrefix: {
        fontFamily: 'DMSans_400Regular',
        fontSize: 14,
        color: '#6B7280',
    },
    loginLink: {
        fontFamily: 'DMSans_500Medium',
        fontSize: 14,
        color: '#FF4422',
    },
    loginLinkTouch: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 8 },
    centered: {
        justifyContent: 'center',
        alignItems: 'center',
    },
});
