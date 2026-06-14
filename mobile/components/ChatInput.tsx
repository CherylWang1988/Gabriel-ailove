import { useState, useRef } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  Platform,
  Modal,
  ScrollView,
} from "react-native";

interface Props {
  onSend: (content: string) => void;
  disabled?: boolean;
}

const EMOJI_CATEGORIES = {
  smileys: "😀😁😂😃😄😅😆😇😈😉😊😋😌😍😎😏😐😑😒😓😔😕😖😗😘😙😚😛😜😝😞😟😠😡😢😣😤😥😦😧😨😩😪😫😬😭😮😯😰😱😲😳😴😵😶😷😸😹😺😻😼😽😾😿🙀🙁🙂🙃🙄🙅🙆🙇🙈🙉🙊🙋🙌🙍🙎🙏",
  hand: "👋👐☝️👆👇👈👉✋✌️🤞🖖🤟✊👊👌🤌🤏🤞👏🙌🤲🤝🤜🤛🦵🦶",
  heart: "❤️🧡💛💚💙💜🖤🤍🤎💔💕💞💓💗💖💘💝💟",
  gesture: "🙁☹️😌😍🥰😘😗😚😙🥲😊😏😣😥😮🤐😯😲😳🥺😦😧😨😰😥😢😭😱😖😣😞😓😩😫🥱😤😡😠🤬😈👿💀☠️💩🤡👹👺👻👽👾🤖😺😸😹😻😼😽😾😿🙀🙁",
  food: "🍏🍎🍐🍊🍋🍌🍉🍇🍓🍈🍒🍑🥭🍍🥥🥝🍅🍆🥑🥦🥬🥒🌶️🌽🥕🧄🧅🥔🍠🥐🥯🍞🥖🥨🧀🥚🍳🧈🥞🧇🥓🥞🌭🍗🍖🌮🌯🧆🍕🍔🍟🍝🥜🥠🥘🍛🍲🍥🥣🥘🍝🍜🍲🥞🍣🍱🥟🦪🍤🍙🍚🍘🍥🥠🥮🍢🍡🍧🍨🍦🍰🎂🧁🍮🍯🍼🥛☕🍵🍶🍾🍷🍸🍹🍺🍻🥂🥃",
  activity: "⚽🏀🏈⚾🥎🎾🏐🏉🥏🎳🏓🏸🏒🏑🥊🥋🥅⛳⛸🎣🎽🎿⛷🏂🪂🚣🏄🚤🏊🏖🏝⛱🏜🌊🏔⛰🧗🚵🚴🏇🤂🤺🤼⛹️🤸🏋️🤾🤹🧘🚴🚵",
};

const EMOJIS = Object.values(EMOJI_CATEGORIES).join("").split("");

export default function ChatInput({ onSend, disabled }: Props) {
  const [text, setText] = useState("");
  const [showEmojis, setShowEmojis] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText("");
    setShowEmojis(false);
  };

  const handleEmojiSelect = (emoji: string) => {
    setText(text + emoji);
  };

  return (
    <>
      <View style={styles.container}>
        <TouchableOpacity
          style={styles.emojiButton}
          onPress={() => setShowEmojis(!showEmojis)}
          disabled={disabled}
        >
          <Text style={styles.emojiText}>😀</Text>
        </TouchableOpacity>
        <View style={styles.inputWrapper}>
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="输入消息..."
            placeholderTextColor="#707070"
            multiline
            maxLength={2000}
            editable={!disabled}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            blurOnSubmit={false}
          />
        </View>
        <TouchableOpacity
          style={[styles.sendButton, (!text.trim() || disabled) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!text.trim() || disabled}
        >
          <Text style={styles.sendText}>➤</Text>
        </TouchableOpacity>
      </View>
      {/* ✅ Emoji Picker Modal */}
      <Modal
        visible={showEmojis}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEmojis(false)}
      >
        <View style={styles.emojiModal}>
          <View style={styles.emojiModalHeader}>
            <Text style={styles.emojiModalTitle}>表情包</Text>
            <TouchableOpacity onPress={() => setShowEmojis(false)}>
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            style={styles.emojiGrid}
            contentContainerStyle={styles.emojiGridContent}
          >
            {EMOJIS.map((emoji, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.emojiItem}
                onPress={() => handleEmojiSelect(emoji)}
              >
                <Text style={styles.emojiItemText}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#1a1a2e",
    borderTopWidth: 1,
    borderTopColor: "#0f3460",
    gap: 8,
  },
  inputWrapper: {
    flex: 1,
    backgroundColor: "#16213e",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === "ios" ? 10 : 6,
  },
  input: {
    fontSize: 15,
    color: "#e0e0e0",
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: "#e94560",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  sendText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  emojiButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  emojiText: {
    fontSize: 20,
  },
  emojiModal: {
    flex: 1,
    backgroundColor: "#16213e",
    marginTop: "auto",
    maxHeight: "70%",
  },
  emojiModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#0f3460",
  },
  emojiModalTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#e0e0e0",
  },
  closeButton: {
    fontSize: 20,
    color: "#707070",
  },
  emojiGrid: {
    flex: 1,
  },
  emojiGridContent: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 8,
  },
  emojiItem: {
    width: "20%",
    aspectRatio: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  emojiItemText: {
    fontSize: 28,
  },
});
