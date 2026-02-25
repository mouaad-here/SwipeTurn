import { StyleSheet, Text, View } from 'react-native';

export default function SavedScreen() {
    return (
        <View style={styles.container}>
            <Text style={styles.text}>Saved Jobs</Text>
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
        fontFamily: 'Syne_800ExtraBold',
        fontSize: 20,
    }
});
