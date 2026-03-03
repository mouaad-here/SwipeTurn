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
            router.replace('/(onboarding)/preferences');
        }
    }, [isLoaded, isSignedIn]);

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [verificationPending, setVerificationPending] = useState(false);
    const [verificationCode, setVerificationCode] = useState('');

    const handleRegister = async () => {
        if (!isLoaded) return;

        if (!email || !password) {
            setError('Please enter both email and password');
            return;
        }

        setLoading(true);
        setError('');

        try {
            await signUp.create({
                emailAddress: email,
                password,
            });

            if (signUp.status === 'complete' && signUp.createdSessionId) {
                await setActive({ session: signUp.createdSessionId });
                router.replace('/(onboarding)/preferences');
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
                router.replace('/(onboarding)/preferences');
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
                redirectUrl: Linking.createURL('/(onboarding)/preferences', { scheme: 'swipeturn' })
            });

            if (createdSessionId && setActive) {
                await setActive({ session: createdSessionId });
                router.replace('/(onboarding)/preferences');
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
                        <Ionicons name="arrow-back" size={24} color="#111827" />
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
                        <Text style={styles.label}>Email</Text>
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
                                    color="#9CA3AF"
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
                            <Ionicons name="logo-google" size={18} color="#111827" style={styles.googleIcon} />
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
        backgroundColor: '#FFFFFF',
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
        fontFamily: 'Syne_800ExtraBold',
        fontSize: 30,
        color: '#111827',
        marginTop: 28,
        marginBottom: 36,
    },
    form: {
        flex: 1,
        gap: 0,
    },
    label: {
        fontFamily: 'DMSans_500Medium',
        fontSize: 13,
        color: '#6B7280',
        marginBottom: 8,
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F3F4F6',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    input: {
        flex: 1,
        padding: 18,
        color: '#111827',
        fontSize: 15,
        fontFamily: 'DMSans_400Regular',
    },
    eyeIcon: {
        padding: 18,
    },
    errorText: {
        fontFamily: 'DMSans_400Regular',
        color: '#FF4422',
        fontSize: 13,
        marginTop: 8,
    },
    verifyPrompt: {
        fontFamily: 'DMSans_400Regular',
        fontSize: 15,
        color: '#374151',
        marginBottom: 8,
    },
    secondaryButton: {
        marginTop: 16,
        alignItems: 'center',
        paddingVertical: 12,
    },
    secondaryButtonText: {
        fontFamily: 'DMSans_500Medium',
        fontSize: 15,
        color: '#6B7280',
    },
    continueButton: {
        backgroundColor: '#FF4422',
        borderRadius: 50,
        paddingVertical: 18,
        marginTop: 28,
        minHeight: 48,
        alignItems: 'center',
        justifyContent: 'center',
    },
    continueButtonDisabled: {
        opacity: 0.7,
    },
    continueButtonText: {
        fontFamily: 'DMSans_500Medium',
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
        backgroundColor: '#E5E7EB',
    },
    dividerText: {
        fontFamily: 'DMSans_500Medium',
        fontSize: 13,
        color: '#9CA3AF',
        marginHorizontal: 16,
    },
    googleButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'white',
        borderWidth: 1,
        borderColor: '#E5E7EB',
        borderRadius: 50,
        paddingVertical: 16,
        minHeight: 48,
    },
    googleIcon: {
        marginRight: 10,
    },
    googleButtonText: {
        fontFamily: 'DMSans_500Medium',
        fontSize: 15,
        color: '#111827',
    },
    termsContainer: {
        paddingTop: 32,
        paddingBottom: 64,
        alignItems: 'center',
    },
    termsText: {
        fontFamily: 'DMSans_400Regular',
        fontSize: 12,
        color: '#9CA3AF',
        textAlign: 'center',
        lineHeight: 18,
    },
    termsLink: {
        color: '#111827',
        textDecorationLine: 'underline',
    },
});
