import { useState, useRef, useCallback } from "react";
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  Image,
  StyleSheet,
  Platform,
  ScrollView,
  Animated,
  Keyboard,
} from "react-native";
import { STICKER_CATEGORIES, ALL_STICKERS, Sticker } from "../data/stickers";

interface Props {
  onSend: (content: string) => void;
  onSendSticker: (sticker: Sticker) => void;
  onPanelToggle?: (visible: boolean) => void;
}

const EMOJI_CATEGORIES = {
  smileys: "😀😁😂😃😄😅😆😇😈😉😊😋😌😍😎😏😐😑😒😓😔😕😖😗😘😙😚😛😜😝😞😟😠😡😢😣😤😥😦😧😨😩😪😫😬😭😮😯😰😱😲😳😴😵😶😷😸😹😺😻😼😽😾😿🙀🙁🙂🙃🙄🙅🙆🙇🙈🙉🙊🙋🙌🙍🙎🙏",
  hand: "👋👐☝️👆👇👈👉✋✌️🤞🖖🤟✊👊👌🤌🤏🤞👏🙌🤲🤝🤜🤛🦵🦶",
  heart: "❤️🧡💛💚💙💜🖤🤍🤎💔💕💞💓💗💖💘💝💟",
  gesture: "🙁☹️😌😍🥰😘😗😚😙🥲😊😏😣😥😮🤐😯😲😳🥺😦😧😨😰😥😢😭😱😖😣😞😓😩😫🥱😤😡😠🤬😈👿💀☠️💩🤡👹👺👻👽👾🤖😺😸😹😻😼😽😾😿🙀🙁",
  food: "🍏🍎🍐🍊🍋🍌🍉🍇🍓🍈🍒🍑🥭🍍🥥🥝🍅🍆🥑🥦🥬🥒🌶️🌽🥕🧄🧅🥔🍠🥐🥯🍞🥖🥨🧀🥚🍳🧈🥞🧇🥓🥞🌭🍗🍖🌮🌯🧆🍕🍔🍟🍝🥜🥠🥘🍛🍲🍥🥣🥘🍝🍜🍲🥞🍣🍱🥟🦪🍤🍙🍚🍘🍥🥠🥮🍢🍡🍧🍨🍦🍰🎂🧁🍮🍯🍼🥛☕🍵🍶🍾🍷🍸🍹🍺🍻🥂🥃",
  activity: "⚽🏀🏈⚾🥎🎾🏐🏉🥏🎳🏓🏸🏒🏑🥊🥋🥅⛳⛸🎣🎽🎿⛷🏂🪂🚣🏄🚤🏊🏖🏝⛱🏜🌊🏔⛰🧗🚵🚴🏇🤂🤺🤼⛹️🤸🏋️🤾🤹🧘🚴🚵",
};

const EMOJIS = [...Object.values(EMOJI_CATEGORIES).join("")];

type PickerTab = "emoji" | "sticker";

const PANEL_HEIGHT = 320;

export default function ChatInput({ onSend, onSendSticker, onPanelToggle }: Props) {
  const [text, setText] = useState("");
  const [showPanel, setShowPanel] = useState(false);
  const [activeTab, setActiveTab] = useState<PickerTab>("emoji");
  const [stickerCat, setStickerCat] = useState<string>(STICKER_CATEGORIES[0]?.key || "");
  const inputRef = useRef<TextInput>(null);
  const panelAnim = useRef(new Animated.Value(0)).current;

  const closePanel = useCallback(() => {
    Animated.timing(panelAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: false,
    }).start(() => {
      setShowPanel(false);
      onPanelToggle?.(false);
    });
  }, [panelAnim, onPanelToggle]);

  const openPanel = useCallback(
    (tab: PickerTab) => {
      // Toggle: if same tab is already open, close the panel instead
      if (showPanel && activeTab === tab) {
        closePanel();
        return;
      }
      // Dismiss keyboard, then animate panel in
      Keyboard.dismiss();
      setActiveTab(tab);
      setShowPanel(true);
      onPanelToggle?.(true);
      Animated.timing(panelAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: false,
      }).start();
    },
    [showPanel, activeTab, panelAnim, closePanel, onPanelToggle],
  );

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
    closePanel();
  };

  const handleEmojiSelect = (emoji: string) => {
    setText((prev) => prev + emoji);
  };

  const handleStickerSelect = (sticker: Sticker) => {
    onSendSticker(sticker);
    closePanel();
  };

  const handleInputFocus = () => {
    // Close emoji panel when keyboard opens
    if (showPanel) {
      closePanel();
    }
  };

  const activeCategory = STICKER_CATEGORIES.find((c) => c.key === stickerCat);
  const displayStickers = activeCategory ? activeCategory.stickers : ALL_STICKERS;

  const panelHeight = panelAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, PANEL_HEIGHT],
  });

  return (
    <View>
      {/* ── Emoji & Sticker Panel (inline, like WeChat) ── */}
      {showPanel && (
        <Animated.View style={[styles.panel, { height: panelHeight }]}>
          {/* Header with tabs */}
          <View style={styles.panelHeader}>
            <View style={styles.tabRow}>
              <TouchableOpacity
                style={[styles.tab, activeTab === "emoji" && styles.tabActive]}
                onPress={() => setActiveTab("emoji")}
              >
                <Text style={[styles.tabText, activeTab === "emoji" && styles.tabTextActive]}>
                  Emoji
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, activeTab === "sticker" && styles.tabActive]}
                onPress={() => setActiveTab("sticker")}
              >
                <Text style={[styles.tabText, activeTab === "sticker" && styles.tabTextActive]}>
                  贴图
                </Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={closePanel}>
              <Text style={styles.closeButton}>关闭</Text>
            </TouchableOpacity>
          </View>

          {/* Sticker category bar */}
          {activeTab === "sticker" && (
            <ScrollView
              horizontal
              style={styles.stickerCatBar}
              contentContainerStyle={styles.stickerCatContent}
              showsHorizontalScrollIndicator={false}
            >
              {STICKER_CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat.key}
                  style={[styles.stickerCat, stickerCat === cat.key && styles.stickerCatActive]}
                  onPress={() => setStickerCat(cat.key)}
                >
                  <Text
                    style={[
                      styles.stickerCatText,
                      stickerCat === cat.key && styles.stickerCatTextActive,
                    ]}
                  >
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Emoji grid */}
          {activeTab === "emoji" && (
            <ScrollView
              style={styles.panelGrid}
              contentContainerStyle={styles.emojiGridContent}
              keyboardShouldPersistTaps="handled"
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
          )}

          {/* Sticker grid */}
          {activeTab === "sticker" && (
            <ScrollView
              style={styles.panelGrid}
              contentContainerStyle={styles.stickerGridContent}
              keyboardShouldPersistTaps="handled"
            >
              {displayStickers.map((sticker) => (
                <TouchableOpacity
                  key={sticker.id}
                  style={styles.stickerItem}
                  onPress={() => handleStickerSelect(sticker)}
                >
                  <Image
                    source={{ uri: sticker.url }}
                    style={styles.stickerImage}
                    resizeMode="contain"
                  />
                  <Text style={styles.stickerLabel} numberOfLines={1}>
                    {sticker.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </Animated.View>
      )}

      {/* ── Input Bar ── */}
      <View style={styles.container}>
        <TouchableOpacity
          style={styles.emojiButton}
          onPress={() => openPanel("emoji")}
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
            editable={true}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            blurOnSubmit={false}
            onFocus={handleInputFocus}
          />
        </View>
        <TouchableOpacity
          style={[styles.sendButton, !text.trim() && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!text.trim()}
        >
          <Text style={styles.sendText}>➤</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // ── Input Bar ──
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

  // ── Panel (inline, above input bar) ──
  panel: {
    backgroundColor: "#16213e",
    overflow: "hidden",
    borderTopWidth: 1,
    borderTopColor: "#0f3460",
  },
  panelHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#0f3460",
  },
  tabRow: {
    flexDirection: "row",
    gap: 4,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: "#e94560",
  },
  tabText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#707070",
  },
  tabTextActive: {
    color: "#fff",
  },
  closeButton: {
    fontSize: 15,
    color: "#e94560",
    fontWeight: "600",
    paddingBottom: 8,
  },

  // ── Panel grid (shared) ──
  panelGrid: {
    flex: 1,
  },

  // ── Emoji grid ──
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

  // ── Sticker category bar ──
  stickerCatBar: {
    maxHeight: 44,
    borderBottomWidth: 1,
    borderBottomColor: "#0f3460",
  },
  stickerCatContent: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 8,
    alignItems: "center",
  },
  stickerCat: {
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 14,
    backgroundColor: "#1a1a2e",
  },
  stickerCatActive: {
    backgroundColor: "#e94560",
  },
  stickerCatText: {
    fontSize: 13,
    color: "#a0a0a0",
  },
  stickerCatTextActive: {
    color: "#fff",
    fontWeight: "600",
  },

  // ── Sticker grid ──
  stickerGridContent: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 8,
  },
  stickerItem: {
    width: "25%",
    aspectRatio: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 6,
  },
  stickerImage: {
    width: 56,
    height: 56,
  },
  stickerLabel: {
    fontSize: 10,
    color: "#707070",
    marginTop: 2,
  },
});
