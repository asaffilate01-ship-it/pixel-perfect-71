package uk.co.mealdeck.printer;

import android.util.Base64;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONArray;
import org.json.JSONObject;

/** Fixed HTTPS destinations and a closed RPC vocabulary. Called on one worker. */
final class PrinterApi {
    static final String ORIGIN = "https://srsxybepwujuawyutnbs.supabase.co";
    static final String CONFIG = "https://mealdeck.co.uk/api/printer/config";
    private static final Set<String> RPCS = Set.of("mealdeck_printer_my_access", "mealdeck_printer_board",
        "mealdeck_printer_claim_job", "mealdeck_printer_begin_send", "mealdeck_printer_claim_receipt",
        "mealdeck_printer_send_result", "mealdeck_printer_confirm_paper");
    private final SessionVault vault;
    private String publicKey;
    private volatile JSONObject session;
    private volatile JSONArray factors = new JSONArray();
    private volatile boolean userChecked;
    private volatile boolean needsMfa;

    PrinterApi(SessionVault vault) {
        this.vault = vault;
        try { session = vault.read(); } catch (PrinterFailure ignored) { session = null; }
    }

    boolean signedIn() { return session != null; }
    boolean needsMfa() { return needsMfa; }
    JSONArray factors() { return factors; }
    String userId() { return session == null ? null : session.optString("userId", null); }

    void signIn(String email, String password) {
        if (email == null || email.trim().isEmpty() || email.length() > 320 || password == null || password.isEmpty() || password.length() > 4096)
            throw new PrinterFailure("invalid_credentials");
        configure();
        JSONObject result = request(ORIGIN + "/auth/v1/token?grant_type=password", "POST",
            json("email", email.trim(), "password", password), null, "invalid_credentials");
        acceptSession(result, null);
        checkUser();
    }

    void verifyMfa(String factorId, String code) {
        requireSession();
        factorId = PrinterContract.requestId(factorId);
        boolean allowed = false;
        for (int i = 0; i < factors.length(); i++) if (factorId.equals(factors.optJSONObject(i).optString("id"))) allowed = true;
        if (!allowed || code == null || !code.matches("[0-9]{6}")) throw new PrinterFailure("invalid_mfa_code");
        refresh();
        JSONObject challenge = request(ORIGIN + "/auth/v1/factors/" + factorId + "/challenge", "POST", new JSONObject(), token(), "invalid_mfa_code");
        String challengeId = PrinterContract.requestId(challenge.optString("id", null));
        JSONObject verified = request(ORIGIN + "/auth/v1/factors/" + factorId + "/verify", "POST",
            json("challenge_id", challengeId, "code", code), token(), "invalid_mfa_code");
        acceptSession(verified, userId());
        checkUser();
        if (needsMfa) throw new PrinterFailure("mfa_required");
    }

    void signOut() {
        String old = session == null ? null : token();
        clearLocalSession();
        if (old != null) {
            try { request(ORIGIN + "/auth/v1/logout?scope=local", "POST", new JSONObject(), old, "sign_in_required"); }
            catch (PrinterFailure ignored) { /* Local session is already erased. */ }
        }
    }

    private void clearLocalSession() {
        session = null; userChecked = false; needsMfa = false; factors = new JSONArray(); vault.clear();
    }

    void checkUser() {
        configure(); refresh();
        JSONObject user = request(ORIGIN + "/auth/v1/user", "GET", null, token(), "sign_in_required");
        if (!PrinterContract.requestId(user.optString("id", null)).equals(userId())) throw new PrinterFailure("sign_in_required");
        if (user.isNull("email_confirmed_at") || user.optString("email_confirmed_at").isBlank()) throw new PrinterFailure("verified_account_required");
        JSONArray source = user.optJSONArray("factors");
        JSONArray safe = new JSONArray(); boolean enrolled = false;
        if (source != null) {
            if (source.length() > 20) throw new PrinterFailure("mfa_required");
            for (int i = 0; i < source.length(); i++) {
                JSONObject f = source.optJSONObject(i);
                if (f == null || !"verified".equals(f.optString("status"))) continue;
                enrolled = true;
                if ("totp".equals(f.optString("factor_type"))) safe.put(json("id", PrinterContract.requestId(f.optString("id", null)), "label", "Authenticator"));
            }
        }
        factors = safe;
        needsMfa = enrolled && !"aal2".equals(claims(token()).optString("aal"));
        userChecked = true;
    }

    JSONObject rpc(String name, JSONObject args) {
        if (!RPCS.contains(name)) throw new IllegalArgumentException();
        configure(); refresh();
        if (!userChecked) checkUser();
        if (needsMfa) throw new PrinterFailure("mfa_required");
        return request(ORIGIN + "/rest/v1/rpc/" + name, "POST", args, token(), "printer_access_denied");
    }

    private void configure() {
        if (publicKey != null) return;
        JSONObject config = request(CONFIG, "GET", null, null, "network_unavailable");
        JSONObject backend = config.optJSONObject("backend");
        if (config.optInt("schemaVersion") != 1 || !"ready".equals(config.optString("status")) || backend == null || !ORIGIN.equals(backend.optString("url"))) throw PrinterFailure.network();
        String key = backend.optString("publishableKey", "");
        if (!key.matches("sb_publishable_[A-Za-z0-9_-]{16,512}")) {
            JSONObject c = claims(key);
            if (!"anon".equals(c.optString("role")) || !"srsxybepwujuawyutnbs".equals(c.optString("ref"))) throw PrinterFailure.network();
        }
        publicKey = key;
    }

    private void refresh() {
        requireSession();
        if (session.optLong("expiresAt") > System.currentTimeMillis() / 1000 + 90) return;
        JSONObject old = session;
        try {
            JSONObject result = request(ORIGIN + "/auth/v1/token?grant_type=refresh_token", "POST",
                json("refresh_token", old.optString("refreshToken")), null, "sign_in_required");
            acceptSession(result, old.optString("userId"));
        } catch (PrinterFailure failure) {
            if ("sign_in_required".equals(failure.code)) clearLocalSession();
            throw failure;
        }
    }

    private void acceptSession(JSONObject value, String expectedUser) {
        String access = value.optString("access_token", "");
        String refresh = value.optString("refresh_token", "");
        JSONObject c = claims(access); JSONObject user = value.optJSONObject("user");
        String id = PrinterContract.requestId(c.optString("sub", null));
        long expiry = c.optLong("exp");
        if (access.length() > 16000 || refresh.isBlank() || refresh.length() > 2048 || !"authenticated".equals(c.optString("role"))
            || !"authenticated".equals(c.optString("aud")) || !(ORIGIN + "/auth/v1").equals(c.optString("iss"))
            || expiry <= System.currentTimeMillis() / 1000 || (expectedUser != null && !expectedUser.equals(id))
            || (user != null && !id.equals(user.optString("id")))) throw new PrinterFailure("sign_in_required");
        if (user != null && (user.isNull("email_confirmed_at") || user.optString("email_confirmed_at").isBlank())) throw new PrinterFailure("verified_account_required");
        JSONObject saved = json("accessToken", access, "refreshToken", refresh, "userId", id, "expiresAt", expiry);
        vault.save(saved); session = saved; userChecked = false;
    }

    private void requireSession() { if (session == null) throw new PrinterFailure("sign_in_required"); }
    private String token() { return session.optString("accessToken"); }

    private JSONObject request(String destination, String method, JSONObject body, String access, String failureCode) {
        HttpsURLConnection connection = null;
        long totalDeadline = System.nanoTime() + 15_000_000_000L;
        try {
            if (!(destination.equals(CONFIG) || destination.startsWith(ORIGIN + "/auth/v1/") || destination.startsWith(ORIGIN + "/rest/v1/rpc/"))) throw new IllegalArgumentException();
            connection = (HttpsURLConnection) new URL(destination).openConnection();
            connection.setRequestMethod(method); connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(8000); connection.setReadTimeout(8000); connection.setUseCaches(false);
            connection.setRequestProperty("Accept", "application/json"); connection.setRequestProperty("Cache-Control", "no-store");
            connection.setRequestProperty("Cookie", "");
            if (!destination.equals(CONFIG)) { if (publicKey == null) throw PrinterFailure.network(); connection.setRequestProperty("apikey", publicKey); }
            if (access != null) connection.setRequestProperty("Authorization", "Bearer " + access);
            if (body != null) {
                byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
                connection.setDoOutput(true); connection.setFixedLengthStreamingMode(bytes.length); connection.setRequestProperty("Content-Type", "application/json");
                try (var output = connection.getOutputStream()) { output.write(bytes); }
            }
            int status = connection.getResponseCode();
            if (System.nanoTime() > totalDeadline) throw PrinterFailure.network();
            if (status == 204 && "POST".equals(method)) return new JSONObject();
            InputStream input = status >= 200 && status < 300 ? connection.getInputStream() : connection.getErrorStream();
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            long readDeadline = Math.min(totalDeadline, System.nanoTime() + 8_000_000_000L);
            if (input != null) try (input) {
                byte[] chunk = new byte[8192]; int count;
                while ((count = input.read(chunk)) != -1) { if (System.nanoTime() > readDeadline || buffer.size() + count > 1_048_576) throw PrinterFailure.network(); buffer.write(chunk, 0, count); }
            }
            JSONObject result = buffer.size() == 0 ? new JSONObject() : new JSONObject(buffer.toString(StandardCharsets.UTF_8));
            if (System.nanoTime() > totalDeadline) throw PrinterFailure.network();
            if (status < 200 || status >= 300) {
                String code = result.optString("code", result.optString("error_code", ""));
                String message = result.optString("message", "");
                if ("email_not_confirmed".equals(code) || message.contains("verified_account_required")) throw new PrinterFailure("verified_account_required");
                if (message.contains("mfa_required") || "mfa_required".equals(code)) { userChecked = false; throw new PrinterFailure("mfa_required"); }
                if (status == 401) {
                    if ("invalid_credentials".equals(failureCode)) throw new PrinterFailure(failureCode);
                    clearLocalSession(); throw new PrinterFailure("sign_in_required");
                }
                if (status >= 500 || status == 429 || status == 408 || status >= 300 && status < 400) throw PrinterFailure.network();
                if (message.contains("claim_expired") || message.contains("job_claimed") || message.contains("invalid_transition") || message.contains("inspection_required")) throw new PrinterFailure("receipt_held");
                throw new PrinterFailure(failureCode);
            }
            return result;
        } catch (PrinterFailure error) { throw error; }
        catch (Exception ignored) { throw PrinterFailure.network(); }
        finally { if (connection != null) connection.disconnect(); }
    }

    static JSONObject json(Object... pairs) {
        JSONObject value = new JSONObject();
        try { for (int i = 0; i < pairs.length; i += 2) value.put((String) pairs[i], pairs[i + 1] == null ? JSONObject.NULL : pairs[i + 1]); }
        catch (Exception ignored) { throw new IllegalArgumentException(); }
        return value;
    }

    private static JSONObject claims(String jwt) {
        try {
            String[] parts = jwt.split("\\.");
            if (parts.length != 3 || jwt.length() > 16000) throw new IllegalArgumentException();
            return new JSONObject(new String(Base64.decode(parts[1], Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING), StandardCharsets.UTF_8));
        } catch (Exception ignored) { throw new PrinterFailure("sign_in_required"); }
    }
}
