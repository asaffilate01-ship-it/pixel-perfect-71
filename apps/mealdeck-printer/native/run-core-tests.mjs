import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = dirname(fileURLToPath(import.meta.url));
const java = process.env.MEALDECK_JAVA_BIN || "java";
const output = await mkdtemp(join(tmpdir(), "mealdeck-receipt-tests-"));
const source = "src/main/java/uk/co/mealdeck/printer";
const files = [
  join(source, "PrinterFailure.java"), join(source, "ReceiptDispatch.java"), join(source, "ReceiptGamesQr.java"),
  "src/test/java/uk/co/mealdeck/printer/ReceiptDispatchTest.java", "src/test/java/uk/co/mealdeck/printer/ReceiptGamesQrTest.java",
];
try {
  for (const args of [
    ["-m", "jdk.compiler/com.sun.tools.javac.Main", "-source", "21", "-target", "21", "-d", output, ...files],
    ["-cp", output, "uk.co.mealdeck.printer.ReceiptDispatchTest"],
    ["-cp", output, "uk.co.mealdeck.printer.ReceiptGamesQrTest"],
  ]) {
    const result = spawnSync(java, args, { cwd: root, stdio: "inherit", timeout: 30_000 });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error("Native receipt dispatch checks failed.");
  }
} finally { await rm(output, { recursive: true, force: true }); }
