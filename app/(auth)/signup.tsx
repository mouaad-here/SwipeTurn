import { COLORS } from '@/constants/colors';
import { useAuth, useOAuth, useSignUp } from '@clerk/clerk-expo';
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

export default function SignupScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { isLoaded, signUp, setActive } = useSignUp();
    const { startOAuthFlow } = useOAuth({ strategy: 'oauth_google' });
    const { isSignedIn } = useAuth();

    useEffect(() => {
        if (isLoaded && isSignedIn) {
            router.replace('/(onboarding)/geography');
        }
    }, [isLoaded, isSignedIn]);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [verificationPending, setVerificationPending] = useState(false);
    const [verificationCode, setVerificationCode] = useState('');

    const handleRegister = async () => {
        if (!isLoaded) return;

        if (!email || !password || !firstName || !lastName) {
            setError('Please fill in all fields');
            return;
        }

        setLoading(true);
        setError('');

        try {
            await signUp.create({
                emailAddress: email,
                password,
                firstName,
                lastName,
            });

            if (signUp.status === 'complete' && signUp.createdSessionId) {
                await setActive({ session: signUp.createdSessionId });
                router.replace('/(onboarding)/geography');
                return;
            }

            // Require email verification
            await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
            setVerificationPending(true);
            setError('');
        } catch (err: any) {
            console.error(err);
            setError(err.errors?.[0]?.message || 'Failed to create account.');
        } finally {
            setLoading(false);
        }
    };

    const handleVerification = async () => {
        if (!isLoaded || !verificationCode.trim()) {
            setError('Please enter the code from your email.');
            return;
        }
        setLoading(true);
        setError('');
        try {
            const attempt = await signUp.attemptEmailAddressVerification({ code: verificationCode.trim() });
            if (attempt.status === 'complete' && attempt.createdSessionId) {
                await setActive({ session: attempt.createdSessionId });
                router.replace('/(onboarding)/geography');
            } else {
                setError('Verification failed. Please check the code and try again.');
            }
        } catch (err: any) {
            console.error(err);
            setError(err.errors?.[0]?.message || 'Invalid verification code.');
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        try {
            const { createdSessionId, setActive } = await startOAuthFlow({
                redirectUrl: Linking.createURL('/(onboarding)/geography', { scheme: 'swipeturn' })
            });

            if (createdSessionId && setActive) {
                await setActive({ session: createdSessionId });
                router.replace('/(onboarding)/geography');
            }
        } catch (err) {
            console.error("OAuth error", err);
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

                    <Text style={styles.heading}>Create Account</Text>

                    {verificationPending ? (
                        <View style={styles.form}>
                            <Text style={styles.verifyPrompt}>
                                We sent a verification code to {email}. Enter it below.
                            </Text>
                            <Text style={[styles.label, { marginTop: 20 }]}>Verification code</Text>
                            <View style={styles.inputContainer}>
                                <TextInput
                                    style={styles.input}
                                    placeholder="Enter 6-digit code"
                                    placeholderTextColor="#9CA3AF"
                                    value={verificationCode}
                                    onChangeText={setVerificationCode}
                                    keyboardType="number-pad"
                                    maxLength={6}
                                    autoFocus
                                />
                            </View>
                            {error ? <Text style={styles.errorText}>{error}</Text> : null}
                            <Pressable
                                style={[styles.continueButton, loading && styles.continueButtonDisabled]}
                                onPress={handleVerification}
                                disabled={loading}
                            >
                                {loading ? (
                                    <ActivityIndicator color="white" />
                                ) : (
                                    <Text style={styles.continueButtonText}>Verify email</Text>
                                )}
                            </Pressable>
                            <Pressable
                                style={styles.secondaryButton}
                                onPress={() => { setVerificationPending(false); setVerificationCode(''); setError(''); }}
                                disabled={loading}
                            >
                                <Text style={styles.secondaryButtonText}>Use a different email</Text>
                            </Pressable>
                        </View>
                    ) : (
                        <View style={styles.form}>
                            <View style={styles.nameRow}>
                                <View style={[styles.inputContainer, { flex: 1, marginRight: 8 }]}>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="First Name"
                                        placeholderTextColor="#9CA3AF"
                                        value={firstName}
                                        onChangeText={setFirstName}
                                        autoCorrect={false}
                                    />
                                </View>
                                <View style={[styles.inputContainer, { flex: 1, marginLeft: 8 }]}>
                                    <TextInput
                                        style={styles.input}
                                        placeholder="Last Name"
                                        placeholderTextColor="#9CA3AF"
                                        value={lastName}
                                        onChangeText={setLastName}
                                        autoCorrect={false}
                                    />
                                </View>
                            </View>

                            <Text style={[styles.label, { marginTop: 20 }]}>Email</Text>
                            <View style={styles.inputContainer}>
                                <TextInput
                                    style={styles.input}
                                    placeholder="Enter your email"
                                    placeholderTextColor="#9CA3AF"
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
                                    placeholderTextColor="#9CA3AF"
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
                                onPress={handleRegister}
                                disabled={loading}
                            >
                                {loading ? (
                                    <ActivityIndicator color="white" />
                                ) : (
                                    <Text style={styles.continueButtonText}>Continue</Text>
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
                    )}

                    <View style={styles.termsContainer}>
                        <Text style={styles.termsText}>
                            By continuing, you agree to our{' '}
                            <Text style={styles.termsLink}>Terms of Service</Text>
                            {' '}and{' '}
                            <Text style={styles.termsLink}>Privacy Policy</Text>
                        </Text>
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
        fontSize: 32,
        color: COLORS.textPrimary,
        marginTop: 28,
        marginBottom: 36,
        letterSpacing: -0.5,
    },
    form: {
        flex: 1,
        gap: 0,
    },
    label: {
        fontFamily: 'Satoshi-Medium',
        fontSize: 14,
        color: COLORS.textSecondary,
        marginBottom: 10,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.surface,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: COLORS.border,
        shadowColor: COLORS.shadow,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 1,
    },
    input: {
        flex: 1,
        padding: 16,
        color: COLORS.textPrimary,
        fontSize: 15,
        fontFamily: 'Satoshi-Medium',
    },
    eyeIcon: {
        padding: 16,
    },
    nameRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 4,
    },
    errorText: {
        fontFamily: 'Satoshi-Regular',
        color: COLORS.accent,
        fontSize: 13,
        marginTop: 8,
    },
    verifyPrompt: {
        fontFamily: 'Satoshi-Regular',
        fontSize: 15,
        color: COLORS.textSecondary,
        marginBottom: 8,
    },
    secondaryButton: {
        marginTop: 16,
        alignItems: 'center',
        paddingVertical: 12,
    },
    secondaryButtonText: {
        fontFamily: 'Satoshi-Medium',
        fontSize: 15,
        color: COLORS.textMuted,
    },
    continueButton: {
        backgroundColor: COLORS.accent,
        borderRadius: 50,
        paddingVertical: 18,
        minHeight: 56,
        marginTop: 28,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: COLORS.accent,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 8,
    },
    continueButtonDisabled: {
        opacity: 0.7,
    },
    continueButtonText: {
        fontFamily: 'Satoshi-Bold',
        fontSize: 18,
        letterSpacing: 0.5,
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
        backgroundColor: COLORS.border,
    },
    dividerText: {
        fontFamily: 'Satoshi-Medium',
        fontSize: 13,
        color: COLORS.textMeta,
        marginHorizontal: 16,
    },
    googleButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLORS.surface,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: 50,
        paddingVertical: 16,
        minHeight: 56,
        shadowColor: COLORS.shadow,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
    },
    googleIcon: {
        marginRight: 12,
    },
    googleButtonText: {
        fontFamily: 'Satoshi-Medium',
        fontSize: 16,
        color: COLORS.textPrimary,
    },
    termsContainer: {
        paddingTop: 32,
        paddingBottom: 64,
        alignItems: 'center',
    },
    termsText: {
        fontFamily: 'Satoshi-Regular',
        fontSize: 12,
        color: COLORS.textMeta,
        textAlign: 'center',
        lineHeight: 18,
    },
    termsLink: {
        color: COLORS.textPrimary,
        textDecorationLine: 'underline',
    },
});
