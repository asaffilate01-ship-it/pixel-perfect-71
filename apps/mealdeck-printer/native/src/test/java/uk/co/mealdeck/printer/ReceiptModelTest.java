package uk.co.mealdeck.printer;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

/** Executable independently or from JUnit; compares with JS-generated goldens. */
public final class ReceiptModelTest {
    public static void main(String[] args) throws Exception {
        run();
        System.out.println("Native receipt normalization, fingerprint, content and bounds checks passed.");
    }
    static void run() throws Exception {
        JSONObject golden;
        try (InputStream stream = ReceiptModelTest.class.getResourceAsStream("/receipt-golden.json")) {
            if (stream == null) throw new AssertionError("Missing receipt golden fixtures");
            golden = new JSONObject(new String(stream.readAllBytes(), StandardCharsets.UTF_8));
        }
        JSONArray valid = golden.getJSONArray("valid");
        for (int n = 0; n < valid.length(); n++) {
            JSONObject example = valid.getJSONObject(n);
            String name = example.getString("name");
            ReceiptModel model = ReceiptModel.parse(example.getJSONObject("input"));
            equal(example.getString("normalizedJson"), model.normalizedJson, name + " canonical JSON");
            equal(example.getString("fingerprint"), model.fingerprint, name + " SHA-256");
            // A modified returned object cannot alter the already fingerprinted model.
            JSONObject detached = model.toJson();
            detached.put("customerName", "Changed copy");
            equal(example.getString("normalizedJson"), model.normalizedJson, name + " immutable model");
            if (example.has("renderError")) {
                expectFailure(() -> ReceiptText.layout(model), example.getString("renderError"), name);
            } else {
                List<String> lines = ReceiptText.layout(model);
                equal(example.getString("text"), String.join("\n", lines), name + " full receipt text");
                if (lines.size() > 600 || lines.stream().anyMatch(line -> line.length() > 32)) throw new AssertionError(name + " bounds");
                long endings = lines.stream().filter(line -> line.equals("END OF RECEIPT")).count();
                if (endings != 1) throw new AssertionError(name + " footer must occur once");
            }
        }
        JSONArray invalid = golden.getJSONArray("invalid");
        for (int n = 0; n < invalid.length(); n++) {
            JSONObject example = invalid.getJSONObject(n);
            JSONObject input = example.getJSONObject("input");
            expectFailure(() -> ReceiptModel.parse(input), example.getString("error"), example.getString("name"));
        }
    }
    private static void equal(String expected, String actual, String context) {
        if (!expected.equals(actual)) throw new AssertionError(context + " mismatch");
    }
    private static void expectFailure(Runnable operation, String expected, String context) {
        try { operation.run(); }
        catch (IllegalArgumentException failure) { equal(expected, failure.getMessage(), context + " rejection"); return; }
        throw new AssertionError(context + " unexpectedly accepted");
    }
}
