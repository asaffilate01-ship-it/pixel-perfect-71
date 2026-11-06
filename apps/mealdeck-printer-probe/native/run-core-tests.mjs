import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = dirname(fileURLToPath(import.meta.url));
const java = process.env.MEALDECK_JAVA_BIN || "java";
const output = await mkdtemp(join(tmpdir(), "mealdeck-printer-probe-tests-"));
const source = "src/main/java/uk/co/mealdeck/printerprobe";
const files = [
  join(source, "ProbeContract.java"),
  join(source, "SetupJournal.java"),
  join(source, "SetupTestCoordinator.java"),
  "src/test/java/uk/co/mealdeck/printerprobe/SetupTestCoordinatorTest.java",
];

try {
  for (const args of [
    [
      "-m",
      "jdk.compiler/com.sun.tools.javac.Main",
      "-source",
      "21",
      "-target",
      "21",
      "-d",
      output,
      ...files,
    ],
    ["-cp", output, "uk.co.mealdeck.printerprobe.SetupTestCoordinatorTest"],
  ]) {
    const result = spawnSync(java, args, {
      cwd: root,
      stdio: "inherit",
      timeout: 30_000,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error("Native diagnostic behavior check failed.");
  }
} finally {
  await rm(output, { recursive: true, force: true });
}
