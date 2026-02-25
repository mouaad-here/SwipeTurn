import { StyleSheet, Text, View } from 'react-native';

export default function PreferencesScreen() {
    return (
        <View style={styles.container}>
            <Text>Preferences Screen</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
