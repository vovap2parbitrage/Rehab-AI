
import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  StatusBar,
} from "react-native";

const tabs = [
  { id: "home", label: "Головна", icon: "⌂" },
  { id: "exercises", label: "Вправи", icon: "◇" },
  { id: "progress", label: "Прогрес", icon: "↗" },
  { id: "profile", label: "Профіль", icon: "○" },
] as const;

type Tab = (typeof tabs)[number]["id"];

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("home");

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F5F8FC" />

      <View style={styles.content}>
        <Text style={styles.greeting}>Привіт! 👋</Text>
        <Text style={styles.subtitle}>
          Ласкаво просимо до Rehab-AI
        </Text>

        {activeTab !== "home" && (
          <Text style={styles.pageTitle}>
            {tabs.find((tab) => tab.id === activeTab)?.label}
          </Text>
        )}
      </View>

      <View style={styles.tabBar}>
        {tabs.map((tab) => (
          <Pressable
            key={tab.id}
            style={styles.tab}
            onPress={() => setActiveTab(tab.id)}
          >
            <Text
              style={[
                styles.icon,
                activeTab === tab.id && styles.active,
              ]}
            >
              {tab.icon}
            </Text>

            <Text
              style={[
                styles.label,
                activeTab === tab.id && styles.active,
              ]}
            >
              {tab.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F8FC",
  },
  content: {
    flex: 1,
    padding: 24,
    paddingTop: 60,
  },
  greeting: {
    fontSize: 28,
    fontWeight: "800",
    color: "#172B4D",
  },
  subtitle: {
    marginTop: 8,
    fontSize: 15,
    color: "#78869A",
  },
  pageTitle: {
    marginTop: 40,
    fontSize: 24,
    fontWeight: "700",
    color: "#172B4D",
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E9EEF5",
    paddingVertical: 12,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    gap: 5,
  },
  icon: {
    fontSize: 23,
    color: "#9AA6B8",
  },
  label: {
    fontSize: 11,
    color: "#9AA6B8",
  },
  active: {
    color: "#246BFD",
    fontWeight: "700",
  },
});
