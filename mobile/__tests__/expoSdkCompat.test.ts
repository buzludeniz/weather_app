import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Regression guard for the TS2589 "Type instantiation is excessively deep" break
 * from Dependabot PR #3: it moved react-native from 0.79 to 0.88 while Expo SDK 53
 * (and its react-native-reanimated 3.17) still targets 0.79. Since 0.87,
 * react-native's default `types` export is the generated Strict TypeScript API,
 * and reanimated 3.x's recursive AnimatedProps/AnimatedStyle mapping over those
 * types never terminates. More importantly, the native binaries would not match
 * either: these packages ship native code that Expo SDK 53 builds against.
 *
 * So the installed major.minor of every Expo-managed native package must equal the
 * one in Expo's own `bundledNativeModules.json` (what `npx expo install --check`
 * enforces). Moving them is an Expo SDK upgrade, not a minor/patch bump.
 */
const EXPO_MANAGED = [
  "react",
  "react-native",
  "react-native-reanimated",
  "react-native-gesture-handler",
  "react-native-screens",
  "react-native-safe-area-context",
  "react-native-svg",
  "expo-constants",
  "expo-location",
  "expo-notifications",
  "expo-secure-store",
  "expo-status-bar"
] as const;

const repoRoot = join(__dirname, "..", "..");

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function installedVersion(name: string): string {
  const pkg = readJson(join(repoRoot, "node_modules", name, "package.json")) as { version: string };
  return pkg.version;
}

function majorMinor(range: string): string {
  const match = /(\d+)\.(\d+)\.\d+/.exec(range);
  if (match == null) {
    throw new Error(`Cannot read a version from "${range}"`);
  }
  return `${match[1]}.${match[2]}`;
}

const bundled = readJson(join(repoRoot, "node_modules", "expo", "bundledNativeModules.json")) as Record<string, string>;

describe("Expo SDK native module compatibility", () => {
  it.each(EXPO_MANAGED)("%s matches the version Expo SDK bundles", (name) => {
    const expected = bundled[name];
    expect(expected).toBeDefined();
    expect(majorMinor(installedVersion(name))).toBe(majorMinor(expected ?? ""));
  });

  it("@types/react tracks the installed react minor", () => {
    expect(majorMinor(installedVersion("@types/react"))).toBe(majorMinor(installedVersion("react")));
  });

  it("parses versions out of Expo's range syntax", () => {
    expect(majorMinor("~3.17.4")).toBe("3.17");
    expect(majorMinor("0.79.6")).toBe("0.79");
    expect(() => majorMinor("latest")).toThrow();
  });
});
