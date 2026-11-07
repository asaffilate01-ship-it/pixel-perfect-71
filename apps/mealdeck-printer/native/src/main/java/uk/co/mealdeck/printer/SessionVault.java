package uk.co.mealdeck.printer;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;

/** AES-GCM ciphertext in no-backup app storage; key stays in Android Keystore. */
final class SessionVault {
    private static final String ALIAS = "mealdeck.receipt.session.v1";
    private final AtomicFile file;
    SessionVault(Context context) { file = new AtomicFile(new File(context.getNoBackupFilesDir(), "receipt-session.v1")); }

    synchronized JSONObject read() {
        if (!file.getBaseFile().exists()) return null;
        try {
            byte[] packed = file.readFully();
            if (packed.length < 29 || packed.length > 32768) throw new IllegalStateException();
            ByteBuffer buffer = ByteBuffer.wrap(packed);
            int length = buffer.get() & 0xff;
            if (length != 12 || buffer.remaining() <= length + 16) throw new IllegalStateException();
            byte[] iv = new byte[length]; buffer.get(iv);
            byte[] ciphertext = new byte[buffer.remaining()]; buffer.get(ciphertext);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(false), new GCMParameterSpec(128, iv));
            cipher.updateAAD(ALIAS.getBytes(StandardCharsets.UTF_8));
            return new JSONObject(new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8));
        } catch (Exception ignored) { throw new PrinterFailure("sign_in_required"); }
    }

    synchronized void save(JSONObject session) {
        FileOutputStream stream = null;
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, key(true));
            cipher.updateAAD(ALIAS.getBytes(StandardCharsets.UTF_8));
            byte[] ciphertext = cipher.doFinal(session.toString().getBytes(StandardCharsets.UTF_8));
            byte[] iv = cipher.getIV();
            if (iv.length != 12 || ciphertext.length > 32000) throw new IllegalStateException();
            stream = file.startWrite();
            stream.write(iv.length); stream.write(iv); stream.write(ciphertext);
            file.finishWrite(stream);
        } catch (Exception ignored) {
            if (stream != null) file.failWrite(stream);
            throw new PrinterFailure("journal_unavailable");
        }
    }

    synchronized void clear() { file.delete(); }

    private SecretKey key(boolean create) throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore"); store.load(null);
        if (!store.containsAlias(ALIAS)) {
            if (!create) throw new IllegalStateException();
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true).build());
            generator.generateKey();
        }
        return (SecretKey) store.getKey(ALIAS, null);
    }
}
