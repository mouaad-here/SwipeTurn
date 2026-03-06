import { StyleSheet, Text, View } from 'react-native';

export default function ChatScreen() {
    return (
        <View style={styles.container}>
            <Text style={styles.text}>Messages</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#000000',
    },
    text: {
        color: '#FFFFFF',
        fontFamily: 'ClashDisplay-Bold',
        fontSize: 20,
    }
});
