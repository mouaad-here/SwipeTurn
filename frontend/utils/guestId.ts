import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

const GUEST_ID_KEY = 'swipturn_guest_id';

export async function clearGuestId(): Promise<void> {
    try {
        await SecureStore.deleteItemAsync(GUEST_ID_KEY);
    } catch (_) {}
}

export async function getOrCreateGuestId(): Promise<string> {
    try {
        let id = await SecureStore.getItemAsync(GUEST_ID_KEY);
        if (!id) {
            id = Crypto.randomUUID?.() ?? `guest_${Date.now()}_${Math.random().toString(36).slice(2)}`;
            await SecureStore.setItemAsync(GUEST_ID_KEY, id);
        }
        return id;
    } catch (e) {
        const fallback = `guest_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        if (Platform.OS !== 'web') {
            try {
                await SecureStore.setItemAsync(GUEST_ID_KEY, fallback);
            } catch (_) {}
        }
        return fallback;
    }
}
