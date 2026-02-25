import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
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

export default function LoginScreen() {
    const router = useRouter();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPass, setShowPass] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleLogin = async () => {
        // Basic validation
        if (!email || !password) {
            setError('Please enter both email and password');
            return;
        }

        setLoading(true);
        setError('');

        try {
            // Mock API call
            await new Promise(resolve => setTimeout(resolve, 1500));

            // Navigate on success
            router.replace('/(tabs)/swipe');
        } catch (err) {
            setError('Failed to log in. Please check your credentials.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <ScrollView contentContainerStyle={styles.scrollContent} bounces={false}>
                <View style={styles.container}>
                    <StatusBar style="dark" />

                    <Pressable onPress={() => router.back()} style={styles.backButton}>
                        <Ionicons name="arrow-back" size={24} color="#111827" />
                    </Pressable>

                    <Text style={styles.heading}>Welcome back</Text>

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
                            onPress={handleLogin}
                            disabled={loading}
                        >
                            {loading ? (
                                <ActivityIndicator color="white" />
                            ) : (
                                <Text style={styles.continueButtonText}>Log in</Text>
                            )}
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
        backgroundColor: '#FFFFFF',
        paddingTop: 60,
        paddingHorizontal: 24,
    },
    backButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
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
    continueButton: {
        backgroundColor: '#FF4422',
        borderRadius: 50,
        paddingVertical: 18,
        marginTop: 28,
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
    signupRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingTop: 32,
        paddingBottom: 64,
    },
    signupPrefix: {
        fontFamily: 'DMSans_400Regular',
        fontSize: 14,
        color: '#6B7280',
    },
    signupLink: {
        fontFamily: 'DMSans_500Medium',
        fontSize: 14,
        color: '#111827',
        textDecorationLine: 'underline',
    },
});
