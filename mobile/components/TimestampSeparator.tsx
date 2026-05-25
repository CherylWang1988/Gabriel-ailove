import { memo } from "react";
import { View, Text, StyleSheet } from "react-native";

interface Props {
  text: string;
}

const TimestampSeparator = memo(function TimestampSeparator({ text }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>{text}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    paddingVertical: 16,
  },
  text: {
    fontSize: 12,
    color: "#666",
    backgroundColor: "#16213e",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
    overflow: "hidden",
  },
});

export default TimestampSeparator;
