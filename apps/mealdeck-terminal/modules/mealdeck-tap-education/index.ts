import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

type EducationModule = { presentHowToTap(): Promise<"presented" | "fallback"> };
export async function presentHowToTap() {
  if (Platform.OS !== "ios") return "fallback" as const;
  const native = requireOptionalNativeModule<EducationModule>("MealDeckTapEducation");
  if (!native)
    throw new Error(
      "This build is missing the iPhone merchant education module. Install the approved native staff build.",
    );
  return native.presentHowToTap();
}
