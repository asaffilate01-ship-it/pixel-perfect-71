import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { StaffAlertControls, type useStaffAlerts } from "../src/components/ops/staff-alerts";

type Alerts = ReturnType<typeof useStaffAlerts>;
function alerts(vibration: Partial<Alerts["vibration"]> = {}): Alerts {
  return {
    enabled: false,
    volume: 0,
    notice: 0,
    audioError: "",
    waitingForGesture: false,
    toggle: async () => {},
    setVolume: () => {},
    observe: () => {},
    clearNotice: () => {},
    test: async () => false,
    vibration: {
      supported: true,
      enabled: false,
      waitingForGesture: false,
      unavailable: false,
      toggle: () => {},
      test: () => false,
      ...vibration,
    },
  };
}

describe("KDS vibration controls", () => {
  test("offers a separate opt-in without changing muted sound controls", () => {
    const html = renderToStaticMarkup(<StaffAlertControls alerts={alerts()} kind="kds" />);
    expect(html).toContain("Enable sound");
    expect(html).toContain("Enable vibration");
    expect(html).toContain("Volume 0%");
    expect(html).not.toContain("Test vibration");
    expect(html).toContain("even with sound muted");
    expect(html).toContain("Three longer pulses over about 3 seconds");
    expect(html).toContain("while the KDS is visible");
    expect(html).toContain("Your phone controls vibration strength");
  });

  test("exposes disable and test actions for a saved preference that needs activation", () => {
    const html = renderToStaticMarkup(
      <StaffAlertControls alerts={alerts({ enabled: true, waitingForGesture: true })} kind="kds" />,
    );
    expect(html).toContain("Disable vibration");
    expect(html).toContain("Test vibration");
    expect(html).toContain("Vibration is waiting for your first interaction");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("Enable sound");
  });

  test("unsupported and rejected vibration retain sound and visual-alert guidance", () => {
    const unsupported = renderToStaticMarkup(
      <StaffAlertControls alerts={alerts({ supported: false })} kind="kds" />,
    );
    expect(unsupported).toContain("Vibration is not supported by this browser");
    expect(unsupported).toContain("Enable sound");
    expect(unsupported).not.toContain("Enable vibration");
    const rejected = renderToStaticMarkup(
      <StaffAlertControls alerts={alerts({ enabled: true, unavailable: true })} kind="kds" />,
    );
    expect(rejected).toContain("did not allow vibration");
    expect(rejected).toContain("Sound and on-screen alerts remain");
    expect(rejected).toContain("Test vibration");
  });

  test("printer controls remain sound-only", () => {
    const html = renderToStaticMarkup(
      <StaffAlertControls alerts={alerts({ enabled: true })} kind="printer" />,
    );
    expect(html).toContain("Enable sound");
    expect(html).toContain("Printer alert volume");
    expect(html.toLowerCase()).not.toContain("vibration");
  });
});
