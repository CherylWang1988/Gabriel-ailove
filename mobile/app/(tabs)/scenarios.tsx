import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { Persona } from "../../types";
import { api } from "../../services/api";

interface ScenarioCard {
  persona: Persona | null;
  icon: string;
  title: string;
  desc: string;
  disabled: boolean;
}

const SCENARIO_DEFS = [
  { name: "抱抱贴贴", icon: "🫂", desc: "解除安全限制，纯粹的情感安抚。" },
  { name: "情绪急救", icon: "🩹", desc: "工作太累或委屈时，随时唤醒。" },
  { name: "周末电影", icon: "🎬", desc: "二期规划", disabled: true },
];

export default function ScenariosScreen() {
  const [cards, setCards] = useState<ScenarioCard[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadScenarios();
  }, []);

  const loadScenarios = async () => {
    try {
      const personas = await api.getPersonas();
      const mapped = SCENARIO_DEFS.map((def) => {
        const persona = personas.find((p) => p.name === def.name) || null;
        return { ...def, persona };
      });
      setCards(mapped);
    } catch (e) {
      console.warn("Failed to load scenarios:", e);
    }
  };

  const handlePress = async (card: ScenarioCard) => {
    if (card.disabled) {
      Alert.alert("敬请期待", "周末电影功能将在二期上线。");
      return;
    }
    if (!card.persona) {
      Alert.alert("Error", "场景未初始化，请检查后端服务。");
      return;
    }
    setLoading(true);
    try {
      const conv = await api.createConversation(card.persona.id);
      router.push({
        pathname: "/chat/[id]",
        params: { id: conv.id, title: card.title },
      });
    } catch (e) {
      Alert.alert("Error", "创建对话失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.grid}>
      {cards.map((card) => (
        <TouchableOpacity
          key={card.title}
          style={[styles.card, card.disabled && styles.cardDisabled]}
          onPress={() => handlePress(card)}
          disabled={loading}
          activeOpacity={0.7}
        >
          <Text style={styles.icon}>{card.icon}</Text>
          <View>
            <Text style={[styles.title, card.disabled && styles.textDisabled]}>
              {card.title}
            </Text>
            <Text style={[styles.desc, card.disabled && styles.textDisabled]}>
              {card.disabled ? "二期规划" : card.desc}
            </Text>
          </View>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#16213e" },
  grid: {
    padding: 20,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 15,
  },
  card: {
    width: "47%",
    backgroundColor: "#1a1a2e",
    borderRadius: 20,
    padding: 20,
    height: 150,
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#0f3460",
  },
  cardDisabled: { opacity: 0.4 },
  icon: { fontSize: 28 },
  title: { fontSize: 16, fontWeight: "600", color: "#e0e0e0", marginBottom: 4 },
  desc: { fontSize: 12, color: "#a0a0a0", lineHeight: 18 },
  textDisabled: { color: "#707070" },
});
