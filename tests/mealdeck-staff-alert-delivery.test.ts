import { describe, expect, test } from "bun:test";
import { playStaffAlertChannels } from "../src/lib/mealdeck-staff-alerts";

type ChannelResult = boolean | Error;

function channel(result: ChannelResult) {
  let calls = 0;
  return {
    play: () => {
      calls += 1;
      if (result instanceof Error) throw result;
      return result;
    },
    calls: () => calls,
  };
}

describe("independent staff alert delivery", () => {
  for (const { name, result, delivered } of [
    { name: "successful", result: true, delivered: true },
    { name: "muted or blocked", result: false, delivered: false },
    { name: "throwing", result: new Error("Sound unavailable"), delivered: false },
  ]) {
    test(`the printer sound-only path handles a ${name} sound without a vibration channel`, () => {
      const sound = channel(result);

      expect(playStaffAlertChannels(sound.play)).toBe(delivered);
      expect(sound.calls()).toBe(1);
    });
  }

  const cases: {
    name: string;
    sound: ChannelResult;
    vibration: ChannelResult;
    delivered: boolean;
  }[] = [
    {
      name: "successful sound still attempts the configured vibration channel",
      sound: true,
      vibration: true,
      delivered: true,
    },
    {
      name: "muted or blocked sound still permits an accepted vibration request",
      sound: false,
      vibration: true,
      delivered: true,
    },
    {
      name: "a sound exception still permits an accepted vibration request",
      sound: new Error("Audio context failed"),
      vibration: true,
      delivered: true,
    },
    {
      name: "a rejected vibration request preserves successful sound delivery",
      sound: true,
      vibration: false,
      delivered: true,
    },
    {
      name: "a vibration exception preserves successful sound delivery",
      sound: true,
      vibration: new Error("Vibration unavailable"),
      delivered: true,
    },
    {
      name: "two blocked channels do not claim delivery",
      sound: false,
      vibration: false,
      delivered: false,
    },
    {
      name: "blocked sound and a vibration exception do not claim delivery",
      sound: false,
      vibration: new Error("Vibration unavailable"),
      delivered: false,
    },
    {
      name: "a sound exception and blocked vibration do not claim delivery",
      sound: new Error("Audio context failed"),
      vibration: false,
      delivered: false,
    },
    {
      name: "two channel exceptions remain contained and do not claim delivery",
      sound: new Error("Audio context failed"),
      vibration: new Error("Vibration unavailable"),
      delivered: false,
    },
  ];

  for (const { name, sound: soundResult, vibration: vibrationResult, delivered } of cases) {
    test(name, () => {
      const sound = channel(soundResult);
      const vibration = channel(vibrationResult);

      expect(playStaffAlertChannels(sound.play, vibration.play)).toBe(delivered);
      expect(sound.calls()).toBe(1);
      expect(vibration.calls()).toBe(1);
    });
  }
});
