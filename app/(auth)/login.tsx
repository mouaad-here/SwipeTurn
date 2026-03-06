import { useAuth, useOAuth, useSignIn } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '@/constants/colors';

export default function LoginScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { signIn, setActive, isLoaded } = useSignIn();
    const { startOAuthFlow } = useOAuth({ strategy: 'oauth_google' });
    const { isSignedIn } = useAuth();

    useEffect(() => {
        if (isLoaded && isSignedIn) {
            router.replace('/(onboarding)/geography');
        }
    }, [isLoaded, isSignedIn]);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleLogin = async () => {
        if (!isLoaded) return;

        if (!email || !password) {
            setError('Please enter both email and password');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const result = await signIn.create({
                identifier: email,
                password,
            });

            if (result.status === 'complete') {
                await setActive({ session: result.createdSessionId });
                router.replace('/(tabs)/swipe');
            } else {
                const statusMessages: Record<string, string> = {
                    needs_identifier: 'Please enter your email address.',
                    needs_first_factor: 'Please enter your password.',
                    needs_second_factor: 'This account uses extra security. Please sign in with Google below instead.',
                    needs_new_password: 'A password reset is required. Check your email for instructions.',
                };
                const msg = statusMessages[result.status as string] ?? 'Please complete verification. Check your email for a link or code, then try again.';
                setError(msg);
            }
        } catch (err: any) {
            console.error(err);
            setError(err.errors?.[0]?.message || 'Failed to log in. Please check your credentials.');
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        try {
            const { createdSessionId, setActive } = await startOAuthFlow({
                redirectUrl: Linking.createURL('/(tabs)/swipe', { scheme: 'swipeturn' })
            });

            if (createdSessionId && setActive) {
                await setActive({ session: createdSessionId });
                router.replace('/(tabs)/swipe');
            }
        } catch (err) {
            console.error("OAuth error", err);
            setError('Google Login failed. Please try again.');
        }
    };

    return (
        <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
                <ScrollView contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 40 }]} bounces={false}>
                <View style={styles.container}>
                    <StatusBar style="dark" />

                    <Pressable onPress={() => router.back()} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
                    </Pressable>

                    <Text style={styles.heading}>Welcome back</Text>

                    <View style={styles.form}>
                        <Text style={styles.label}>Email</Text>
                        <View style={styles.inputContainer}>
                            <TextInput
                                style={styles.input}
                                placeholder="Enter your email"
                                placeholderTextColor="COLORS.textMeta"
                                value={email}
                                onChangeText={setEmail}
                                keyboardType="email-address"
                                autoCapitalize="none"
                                autoCorrect={false}
                            />
                        </View>

                        <Text style={[styles.label, { marginTop: 20 }]}>Password</Text>
                        <View style={styles.inputContainer}>
                            <TextInput
                                style={[styles.input, { flex: 1 }]}
                                placeholder="Enter your password"
                                placeholderTextColor="COLORS.textMeta"
                                value={password}
                                onChangeText={setPassword}
                                secureTextEntry={!showPass}
                                autoCapitalize="none"
                            />
                            <Pressable
                                onPress={() => setShowPass(!showPass)}
                                style={styles.eyeIcon}
                            >
                                <Ionicons
                                    name={showPass ? "eye-off-outline" : "eye-outline"}
                                    size={20}
                                    color={COLORS.textMeta}
                                />
                            </Pressable>
                        </View>

                        {error ? <Text style={styles.errorText}>{error}</Text> : null}

                        <Pressable
                            style={[styles.continueButton, loading && styles.continueButtonDisabled]}
                            onPress={handleLogin}
                            disabled={loading}
                        >
                            {loading ? (
                                <ActivityIndicator color="white" />
                            ) : (
                                <Text style={styles.continueButtonText}>Log in</Text>
                            )}
                        </Pressable>

                        <View style={styles.dividerRow}>
                            <View style={styles.dividerLine} />
                            <Text style={styles.dividerText}>OR</Text>
                            <View style={styles.dividerLine} />
                        </View>

                        <Pressable style={styles.googleButton} onPress={handleGoogleLogin}>
                            <Ionicons name="logo-google" size={18} color={COLORS.textPrimary} style={styles.googleIcon} />
                            <Text style={styles.googleButtonText}>Continue with Google</Text>
                        </Pressable>
                    </View>

                    <View style={styles.signupRow}>
                        <Text style={styles.signupPrefix}>Don't have an account? </Text>
                        <Pressable onPress={() => router.push('/(auth)/signup')}>
                            <Text style={styles.signupLink}>Sign up</Text>
                        </Pressable>
                    </View>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    scrollContent: {
        flexGrow: 1,
    },
    container: {
        flex: 1,
        backgroundColor: COLORS.surface,
        paddingTop: 60,
        paddingHorizontal: 24,
    },
    backButton: {
        width: 48,
        height: 48,
        justifyContent: 'center',
        alignItems: 'center',
    },
    heading: {
        fontFamily: 'ClashDisplay-Bold',
        fontSize: 30,
        color: 'COLORS.textPrimary',
        marginTop: 28,
        marginBottom: 36,
    },
    form: {
        flex: 1,
        gap: 0,
    },
    label: {
        fontFamily: 'Satoshi-Medium',
        fontSize: 13,
        color: 'COLORS.textMuted',
        marginBottom: 8,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'COLORS.surface2',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    input: {
        flex: 1,
        padding: 18,
        color: 'COLORS.textPrimary',
        fontSize: 15,
        fontFamily: 'Satoshi-Regular',
    },
    eyeIcon: {
        minWidth: 48,
        minHeight: 48,
        padding: 18,
        justifyContent: 'center',
        alignItems: 'center',
    },
    errorText: {
        fontFamily: 'Satoshi-Regular',
        color: 'COLORS.accent',
        fontSize: 13,
        marginTop: 8,
    },
    continueButton: {
        backgroundColor: 'COLORS.accent',
        borderRadius: 50,
        paddingVertical: 18,
        minHeight: 48,
        marginTop: 28,
        alignItems: 'center',
        justifyContent: 'center',
    },
    continueButtonDisabled: {
        opacity: 0.7,
    },
    continueButtonText: {
        fontFamily: 'Satoshi-Medium',
        fontSize: 17,
        color: 'white',
    },
    dividerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 24,
    },
    dividerLine: {
        flex: 1,
        height: 1,
        backgroundColor: 'COLORS.border',
    },
    dividerText: {
        fontFamily: 'Satoshi-Medium',
        fontSize: 13,
        color: 'COLORS.textMeta',
        marginHorizontal: 16,
    },
    googleButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'white',
        borderWidth: 1,
        borderColor: 'COLORS.border',
        borderRadius: 50,
        paddingVertical: 16,
        minHeight: 48,
    },
    googleIcon: {
        marginRight: 10,
    },
    googleButtonText: {
        fontFamily: 'Satoshi-Medium',
        fontSize: 15,
        color: 'COLORS.textPrimary',
    },
    signupRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: 32,
        paddingBottom: 64,
    },
    signupPrefix: {
        fontFamily: 'Satoshi-Regular',
        fontSize: 14,
        color: 'COLORS.textMuted',
    },
    signupLink: {
        fontFamily: 'Satoshi-Medium',
        fontSize: 14,
        color: 'COLORS.textPrimary',
        textDecorationLine: 'underline',
    },
});
