import { StyleSheet, Text, View } from 'react-native';

export default function SwipeScreen() {
    return (
        <View style={styles.container}>
            <Text>Swipe Screen</Text>
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
