import { Link, Stack } from "expo-router";
import { StyleSheet, View } from "react-native";

export default function NotFoundScreen() {
  return (
    <View>
      <Stack.Screen options={{ title: "Oops!" }} />
      <View style={styles.container}>
        <Link href="/" style={styles.link}>
          Go to home screen!
        </Link>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 100,
    backgroundColor: "red",
  },
  link: {
    marginTop: 15,
    paddingVertical: 15,
  },
});
