package uk.co.mealdeck.printer;

import android.content.ContentValues;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Durable attempt ownership, never receipt content. Losing or corrupting an existing
 * journal fails closed. A claim token is encrypted with a separate Keystore key. */
final class ReceiptJournal {
    private static final String KEY_ALIAS = "mealdeck.receipt.claims.v1";
    private static final String DATABASE = "receipt-attempts-v1.db";
    private static final String COLUMNS = "tenant_id,location_id,user_id,job_id,order_id,claim_blob,fingerprint,reprint_of,state,copy_number,created_at,updated_at,reported";
    private final Helper helper;
    private final SQLiteDatabase database;
    private final String terminal;

    static final class Attempt {
        final String tenantId, locationId, userId, jobId, orderId, claimToken, fingerprint, reprintOf, state;
        final int copyNumber;
        final long createdAt, updatedAt;
        final boolean created, reported;
        Attempt(String tenant, String location, String user, String job, String order, String claim,
            String fingerprint, String reprintOf, String state, int copy, long createdAt, long updatedAt,
            boolean created, boolean reported) {
            this.tenantId=tenant; this.locationId=location; this.userId=user; this.jobId=job;
            this.orderId=order; this.claimToken=claim; this.fingerprint=fingerprint; this.reprintOf=reprintOf;
            this.state=state; this.copyNumber=copy; this.createdAt=createdAt; this.updatedAt=updatedAt;
            this.created=created; this.reported=reported;
        }
    }

    ReceiptJournal(Context context) {
        Context app=context.getApplicationContext();
        helper=new Helper(app);
        try {
            database=helper.getWritableDatabase();
            try (Cursor check=database.rawQuery("PRAGMA quick_check(1)",null)) {
                if(!check.moveToFirst() || !"ok".equals(check.getString(0))) throw unavailable();
            }
            SharedPreferences identity=app.getSharedPreferences("receipt-installation-v1",Context.MODE_PRIVATE);
            String remembered=identity.getString("terminal",null);
            String saved=null;
            try(Cursor cursor=database.rawQuery("SELECT value FROM metadata WHERE name='terminal'",null)) {
                if(cursor.moveToFirst()) saved=cursor.getString(0);
            }
            if(saved==null) {
                if(remembered!=null) throw unavailable();
                saved=UUID.randomUUID().toString();
                ContentValues values=new ContentValues(); values.put("name","terminal"); values.put("value",saved);
                database.beginTransaction();
                try {database.insertOrThrow("metadata",null,values); database.setTransactionSuccessful();}
                finally {database.endTransaction();}
            }
            terminal=id(saved);
            if(remembered!=null && !terminal.equals(remembered)) throw unavailable();
            if(!identity.edit().putString("terminal",terminal).commit()) throw unavailable();
            recover();
        } catch (PrinterFailure failure) {throw failure;}
        catch (RuntimeException failure) {throw unavailable();}
    }

    String terminalId() {return terminal;}

    synchronized long baseline(String tenant,String location) {
        id(tenant); id(location);
        try(Cursor cursor=database.rawQuery("SELECT started_at FROM baselines WHERE tenant_id=? AND location_id=?",new String[]{tenant,location})) {
            return cursor.moveToFirst()?cursor.getLong(0):0L;
        } catch(RuntimeException failure) {throw unavailable();}
    }

    /** Caller supplies server generatedAt, never the Android wall-clock baseline. */
    synchronized long ensureBaseline(String tenant,String location,long serverNowMillis) {
        id(tenant); id(location);
        if(serverNowMillis<1_577_836_800_000L) throw unavailable();
        try {
            database.beginTransaction();
            try {
                long existing=baseline(tenant,location);
                if(existing!=0) {database.setTransactionSuccessful();return existing;}
                ContentValues values=new ContentValues(); values.put("tenant_id",tenant); values.put("location_id",location); values.put("started_at",serverNowMillis);
                database.insertOrThrow("baselines",null,values);
                database.setTransactionSuccessful();
                return serverNowMillis;
            } finally {database.endTransaction();}
        } catch(PrinterFailure failure) {throw failure;}
        catch(RuntimeException failure) {throw unavailable();}
    }

    synchronized Attempt reserve(String tenant,String location,String user,String job,String claim,ReceiptModel model) {
        id(tenant); id(location); id(user); id(job); id(claim);
        if(model==null) throw unavailable();
        id(model.orderId); fingerprint(model.fingerprint);
        if(model.reprintOf!=null) id(model.reprintOf);
        if(model.copyNumber<1 || model.copyNumber>100) throw unavailable();
        try {
            database.beginTransaction();
            try {
                Attempt existing=findInternal(job,false);
                if(existing!=null) {
                    if(!existing.tenantId.equals(tenant) || !existing.locationId.equals(location) || !existing.userId.equals(user)
                        || !existing.orderId.equals(model.orderId) || existing.copyNumber!=model.copyNumber
                        || !existing.fingerprint.equals(model.fingerprint) || !existing.claimToken.equals(claim)
                        || !java.util.Objects.equals(existing.reprintOf,model.reprintOf)) throw held();
                    database.setTransactionSuccessful();
                    return existing;
                }
                checkEligible(tenant,location,model);
                long now=System.currentTimeMillis();
                ContentValues values=new ContentValues();
                values.put("tenant_id",tenant);values.put("location_id",location);values.put("user_id",user);
                values.put("job_id",job);values.put("order_id",model.orderId);values.put("copy_number",model.copyNumber);
                values.put("claim_blob",encrypt(job,claim));values.put("fingerprint",model.fingerprint);
                if(model.reprintOf==null)values.putNull("reprint_of");else values.put("reprint_of",model.reprintOf);
                values.put("state","claimed");values.put("created_at",now);values.put("updated_at",now);values.put("reported",0);
                database.insertOrThrow("attempts",null,values);
                Attempt inserted=findInternal(job,true);
                if(inserted==null)throw unavailable();
                database.setTransactionSuccessful();
                return inserted;
            } finally {database.endTransaction();}
        } catch(PrinterFailure failure) {throw failure;}
        catch(RuntimeException failure) {throw unavailable();}
    }

    /** Validate local copy history before obtaining any new server claim. */
    synchronized void checkEligible(String tenant,String location,ReceiptModel model) {
        id(tenant);id(location);
        if(model==null)throw unavailable();
        id(model.orderId);fingerprint(model.fingerprint);
        if(model.reprintOf!=null)id(model.reprintOf);
        try {
        try(Cursor duplicate=database.rawQuery("SELECT job_id FROM attempts WHERE order_id=? AND copy_number=?",new String[]{model.orderId,Integer.toString(model.copyNumber)})) {
            if(duplicate.moveToFirst()) throw held();
        }
        if(model.copyNumber>1) {
            Attempt parent=findInternal(model.reprintOf,false);
            if(parent==null || !parent.orderId.equals(model.orderId) || !parent.tenantId.equals(tenant)
                || !parent.locationId.equals(location) || !List.of("printed","failed").contains(parent.state))throw held();
            int highest=0;
            try(Cursor copies=database.rawQuery("SELECT copy_number,state FROM attempts WHERE order_id=?",new String[]{model.orderId})) {
                while(copies.moveToNext()) {
                    highest=Math.max(highest,copies.getInt(0));
                    if(!List.of("printed","failed").contains(copies.getString(1)))throw held();
                }
            }
            if(model.copyNumber!=highest+1)throw held();
        }
        try(Cursor count=database.rawQuery("SELECT count(*) FROM attempts",null)) {
            if(!count.moveToFirst() || count.getLong(0)>=50000)throw unavailable();
        }
        }catch(PrinterFailure failure){throw failure;}catch(RuntimeException failure){throw unavailable();}
    }

    /** A second begin is forbidden even when every identifier is identical. */
    synchronized void begin(String job,String digest) {
        id(job);fingerprint(digest);
        try {
            database.beginTransaction();
            try {
                Attempt attempt=require(job);
                if(!attempt.fingerprint.equals(digest) || !"claimed".equals(attempt.state))throw held();
                update(job,"sending",false);
                database.setTransactionSuccessful();
            } finally {database.endTransaction();}
        } catch(PrinterFailure failure) {throw failure;}
        catch(RuntimeException failure) {throw unavailable();}
    }

    synchronized void finish(String job,String outcome) {
        id(job);
        if(!"held".equals(outcome) && !"sent_unconfirmed".equals(outcome))throw unavailable();
        try {
            database.beginTransaction();
            try {
                Attempt attempt=require(job);
                if(outcome.equals(attempt.state) || "printed".equals(attempt.state) || "failed".equals(attempt.state)) {
                    database.setTransactionSuccessful();return;
                }
                if("held".equals(attempt.state))throw held();
                if("sent_unconfirmed".equals(outcome) && !"sending".equals(attempt.state))throw held();
                if(!List.of("claimed","sending","sent_unconfirmed").contains(attempt.state))throw held();
                update(job,outcome,false);
                database.setTransactionSuccessful();
            } finally {database.endTransaction();}
        } catch(PrinterFailure failure) {throw failure;}
        catch(RuntimeException failure) {throw unavailable();}
    }

    /** Call only after the server confirms the operator's explicit paper outcome. */
    synchronized void confirm(String job,String outcome) {
        id(job);
        String target="printed".equals(outcome)?"printed":"not_printed".equals(outcome)?"failed":null;
        if(target==null)throw held();
        try {
            database.beginTransaction();
            try {
                Attempt attempt=require(job);
                if(target.equals(attempt.state)){database.setTransactionSuccessful();return;}
                if(!List.of("held","sending","sent_unconfirmed").contains(attempt.state))throw held();
                update(job,target,true);
                database.setTransactionSuccessful();
            } finally {database.endTransaction();}
        } catch(PrinterFailure failure) {throw failure;}
        catch(RuntimeException failure) {throw unavailable();}
    }

    synchronized void markReported(String job,String outcome) {
        id(job);
        if(!List.of("held","sent_unconfirmed").contains(outcome))throw unavailable();
        try {
            database.beginTransaction();
            try {
                Attempt attempt=require(job);
                if(attempt.state.equals(outcome)) {
                    ContentValues values=new ContentValues();values.put("reported",1);
                    if(database.update("attempts",values,"job_id=? AND state=?",new String[]{job,outcome})!=1)throw unavailable();
                }
                database.setTransactionSuccessful();
            } finally {database.endTransaction();}
        } catch(PrinterFailure failure) {throw failure;}
        catch(RuntimeException failure) {throw unavailable();}
    }

    synchronized Attempt find(String job) {
        id(job);
        try{return findInternal(job,false);}catch(PrinterFailure failure){throw failure;}catch(RuntimeException failure){throw unavailable();}
    }

    /** Full history remains indexed for deduplication. Pending outcomes and holds
     * are first so a busy kitchen never hides recovery behind old confirmed rows. */
    synchronized List<Attempt> list(String tenant,String location) {
        id(tenant);id(location);
        List<Attempt> result=new ArrayList<>();
        try(Cursor cursor=database.rawQuery("SELECT "+COLUMNS+" FROM attempts WHERE tenant_id=? AND location_id=? ORDER BY CASE WHEN state='held' THEN 0 WHEN reported=0 THEN 1 ELSE 2 END, updated_at DESC LIMIT 1000",new String[]{tenant,location})) {
            while(cursor.moveToNext())result.add(read(cursor,false));
            return List.copyOf(result);
        }catch(PrinterFailure failure){throw failure;}catch(RuntimeException failure){throw unavailable();}
    }

    synchronized boolean hasHeld() {
        try(Cursor cursor=database.rawQuery("SELECT 1 FROM attempts WHERE state='held' LIMIT 1",null)){return cursor.moveToFirst();}
        catch(RuntimeException failure){throw unavailable();}
    }

    /** Process death provides no paper acknowledgement. Do not re-send survivors. */
    synchronized void recover() {
        try {
            database.beginTransaction();
            try {
                ContentValues values=new ContentValues();values.put("state","held");values.put("reported",0);values.put("updated_at",System.currentTimeMillis());
                database.update("attempts",values,"state IN ('claimed','sending')",null);
                database.setTransactionSuccessful();
            }finally{database.endTransaction();}
        }catch(RuntimeException failure){throw unavailable();}
    }

    private Attempt require(String job){Attempt result=findInternal(job,false);if(result==null)throw unavailable();return result;}
    private Attempt findInternal(String job,boolean created){
        try(Cursor cursor=database.rawQuery("SELECT "+COLUMNS+" FROM attempts WHERE job_id=?",new String[]{job})){return cursor.moveToFirst()?read(cursor,created):null;}
    }
    private Attempt read(Cursor cursor,boolean created){
        return new Attempt(cursor.getString(0),cursor.getString(1),cursor.getString(2),cursor.getString(3),cursor.getString(4),
            decrypt(cursor.getString(3),cursor.getBlob(5)),cursor.getString(6),cursor.isNull(7)?null:cursor.getString(7),cursor.getString(8),
            cursor.getInt(9),cursor.getLong(10),cursor.getLong(11),created,cursor.getInt(12)==1);
    }
    private void update(String job,String state,boolean reported){
        ContentValues values=new ContentValues();values.put("state",state);values.put("reported",reported?1:0);values.put("updated_at",System.currentTimeMillis());
        if(database.update("attempts",values,"job_id=?",new String[]{job})!=1)throw unavailable();
    }
    private static String id(String value){return PrinterContract.requestId(value);}
    private static void fingerprint(String value){if(value==null || !value.matches("[0-9a-f]{64}"))throw unavailable();}
    private static PrinterFailure unavailable(){return new PrinterFailure("journal_unavailable");}
    private static PrinterFailure held(){return new PrinterFailure("receipt_held");}

    private byte[] encrypt(String job,String claim){
        try {
            Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,key(true));
            cipher.updateAAD((KEY_ALIAS+":"+job).getBytes(StandardCharsets.UTF_8));
            byte[] encrypted=cipher.doFinal(claim.getBytes(StandardCharsets.UTF_8));byte[] iv=cipher.getIV();
            if(iv.length!=12)throw unavailable();
            return ByteBuffer.allocate(12+encrypted.length).put(iv).put(encrypted).array();
        }catch(Exception failure){throw unavailable();}
    }
    private String decrypt(String job,byte[] packed){
        try {
            if(packed==null || packed.length<29 || packed.length>256)throw unavailable();
            ByteBuffer data=ByteBuffer.wrap(packed);byte[] iv=new byte[12];data.get(iv);byte[] ciphertext=new byte[data.remaining()];data.get(ciphertext);
            Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.DECRYPT_MODE,key(false),new GCMParameterSpec(128,iv));
            cipher.updateAAD((KEY_ALIAS+":"+job).getBytes(StandardCharsets.UTF_8));
            return id(new String(cipher.doFinal(ciphertext),StandardCharsets.UTF_8));
        }catch(Exception failure){throw unavailable();}
    }
    private SecretKey key(boolean create)throws Exception{
        KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
        if(!store.containsAlias(KEY_ALIAS)){
            if(!create)throw unavailable();
            KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true).build());generator.generateKey();
        }
        return (SecretKey)store.getKey(KEY_ALIAS,null);
    }

    private static final class Helper extends SQLiteOpenHelper{
        Helper(Context context){super(context,DATABASE,null,1);}
        @Override public void onConfigure(SQLiteDatabase db){db.execSQL("PRAGMA synchronous=FULL");db.setForeignKeyConstraintsEnabled(true);}
        @Override public void onCreate(SQLiteDatabase db){
            db.execSQL("CREATE TABLE metadata(name TEXT PRIMARY KEY,value TEXT NOT NULL)");
            db.execSQL("CREATE TABLE baselines(tenant_id TEXT NOT NULL,location_id TEXT NOT NULL,started_at INTEGER NOT NULL CHECK(started_at>0),PRIMARY KEY(tenant_id,location_id))");
            db.execSQL("CREATE TABLE attempts(job_id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,location_id TEXT NOT NULL,user_id TEXT NOT NULL,order_id TEXT NOT NULL,copy_number INTEGER NOT NULL CHECK(copy_number BETWEEN 1 AND 100),claim_blob BLOB NOT NULL,fingerprint TEXT NOT NULL CHECK(length(fingerprint)=64),reprint_of TEXT,state TEXT NOT NULL CHECK(state IN ('claimed','sending','sent_unconfirmed','held','printed','failed')),created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,reported INTEGER NOT NULL DEFAULT 0 CHECK(reported IN (0,1)),UNIQUE(order_id,copy_number),CHECK((copy_number=1 AND reprint_of IS NULL) OR (copy_number>1 AND reprint_of IS NOT NULL)))");
            db.execSQL("CREATE INDEX attempts_scope_state ON attempts(tenant_id,location_id,state,reported,updated_at)");
        }
        @Override public void onUpgrade(SQLiteDatabase db,int oldVersion,int newVersion){throw unavailable();}
        @Override public void onDowngrade(SQLiteDatabase db,int oldVersion,int newVersion){throw unavailable();}
    }
}
