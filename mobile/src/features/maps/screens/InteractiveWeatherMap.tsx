import { Ionicons } from "@expo/vector-icons";
import type { MapLayer } from "@nimbus/shared";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";
import { useAppTheme } from "../../../theme/useAppTheme";

type InteractiveWeatherMapProps = {
  layers: MapLayer[];
};

export function InteractiveWeatherMap({ layers }: InteractiveWeatherMapProps) {
  const theme = useAppTheme();
  const [activeLayer, setActiveLayer] = useState<MapLayer["id"]>("radar");
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const pan = Gesture.Pan().onChange((event) => {
    translateX.value += event.changeX;
    translateY.value += event.changeY;
  });

  const pinch = Gesture.Pinch().onChange((event) => {
    scale.value = Math.min(3, Math.max(0.8, scale.value * event.scaleChange));
  });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value }
    ]
  }));

  const layerColor = {
    clouds: "#C7D4DA",
    precipitation: "#3182CE",
    pressure: "#9F7AEA",
    radar: "#2F855A",
    satellite: "#718096",
    temperature: "#E46B48",
    wind: "#38A169"
  }[activeLayer];

  function nextFrame() {
    setFrame((value) => (value + 1) % 8);
    setPlaying(true);
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
      <GestureDetector gesture={Gesture.Simultaneous(pan, pinch)}>
        <Animated.View style={[styles.mapCanvas, animatedStyle]}>
          <Svg width="100%" height="100%" viewBox="0 0 360 420">
            <Rect x="0" y="0" width="360" height="420" fill={theme.colors.mapWater} />
            <Path d="M48 105 C86 42 152 62 174 120 C214 92 288 122 302 188 C326 276 246 350 168 322 C92 362 30 296 54 220 C20 178 20 138 48 105Z" fill={theme.colors.mapLand} />
            {Array.from({ length: 7 }).map((_, index) => (
              <Line key={`wind-${index}`} x1={24 + index * 52} y1={76 + frame * 8} x2={72 + index * 46} y2={52 + frame * 6} stroke="#FFFFFF" strokeOpacity="0.34" strokeWidth="2" />
            ))}
            {Array.from({ length: 11 }).map((_, index) => (
              <Circle
                key={`cell-${index}`}
                cx={44 + ((index * 67 + frame * 17) % 280)}
                cy={82 + ((index * 41 + frame * 23) % 280)}
                r={18 + (index % 4) * 7}
                fill={layerColor}
                opacity={0.18 + (index % 4) * 0.09}
              />
            ))}
          </Svg>
        </Animated.View>
      </GestureDetector>

      <View style={styles.layerBar}>
        {layers.map((layer) => (
          <Pressable
            key={layer.id}
            accessibilityRole="button"
            accessibilityState={{ selected: activeLayer === layer.id }}
            onPress={() => setActiveLayer(layer.id)}
            style={[
              styles.layerButton,
              {
                backgroundColor: activeLayer === layer.id ? theme.colors.primary : theme.colors.surface,
                borderColor: theme.colors.border
              }
            ]}
          >
            <Text style={[styles.layerText, { color: activeLayer === layer.id ? "#FFFFFF" : theme.colors.text }]}>{layer.name}</Text>
          </Pressable>
        ))}
      </View>

      <View style={[styles.playback, { backgroundColor: theme.colors.surface }]}>
        <Pressable accessibilityRole="button" onPress={nextFrame} style={styles.playButton}>
          <Ionicons name={playing ? "pause-outline" : "play-outline"} size={20} color={theme.colors.primary} />
        </Pressable>
        {Array.from({ length: 8 }).map((_, index) => (
          <Pressable
            key={index}
            accessibilityRole="button"
            onPress={() => setFrame(index)}
            style={[
              styles.frameDot,
              {
                backgroundColor: frame === index ? theme.colors.secondary : theme.colors.border,
                width: frame === index ? 24 : 10
              }
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 520,
    overflow: "hidden"
  },
  frameDot: {
    borderRadius: 8,
    height: 10
  },
  layerBar: {
    bottom: 74,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    left: 12,
    position: "absolute",
    right: 12
  },
  layerButton: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  layerText: {
    fontSize: 12,
    fontWeight: "800"
  },
  mapCanvas: {
    height: 520,
    width: "100%"
  },
  playButton: {
    padding: 4
  },
  playback: {
    alignItems: "center",
    borderRadius: 8,
    bottom: 14,
    flexDirection: "row",
    gap: 8,
    left: 12,
    minHeight: 44,
    paddingHorizontal: 12,
    position: "absolute",
    right: 12
  }
});
