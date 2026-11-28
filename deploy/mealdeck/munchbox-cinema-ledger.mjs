/** Restricted, single-directory operator ledger. Never imported by the website.
 * The designated directory must be outside the repository, private and backed up.
 * File permissions and an exclusive lock protect ordinary concurrent use; this
 * cannot prevent a privileged operator from copying or rewriting the evidence.
 */
import { constants, closeSync, existsSync, fchmodSync, fsyncSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync, linkSync } from "node:fs";
import { join, resolve, relative, isAbsolute, sep } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  advanceCinemaCandidate, cinemaCandidate, cinemaDrawSummary, createCinemaDraw,
  recordCinemaClaim, recordCinemaContact, validateCinemaDraw, validateCinemaSnapshot,
} from "./munchbox-cinema-draw.mjs";

const MAX_BYTES = 32 * 1024 * 1024;
const REPOSITORY_ROOT = realpathSync(fileURLToPath(new URL("../../", import.meta.url)));
const DIGEST = /^[a-f0-9]{64}$/;
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const ledgerName = "cinema-draw-ledger.json";
const lockName = "cinema-draw.lock";

function inside(root, path) {
  const rel = relative(root,path);
  return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(".." + sep));
}

function privateDirectory(path, create = false) {
  const directory = resolve(path);
  if (inside(REPOSITORY_ROOT, directory)) throw Error("Use a private directory outside the repository");
  if (create && !existsSync(directory)) mkdirSync(directory, { mode: 0o700 });
  const info=lstatSync(directory);
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o077) !== 0)
    throw Error("Draw directory must be private (0700), not a symlink");
  const canonical=realpathSync(directory);
  if (inside(REPOSITORY_ROOT,canonical)) throw Error("Use a private directory outside the repository");
  if (typeof process.getuid === "function" && info.uid !== process.getuid()) throw Error("Draw directory must belong to the operator");
  return canonical;
}

function privateJson(path) {
  const fd=openSync(path,constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info=fstatSync(fd);
    if (!info.isFile() || (info.mode & 0o077)!==0 || info.size>MAX_BYTES ||
        (typeof process.getuid==="function" && info.uid!==process.getuid())) throw Error("Invalid private evidence file");
    const data=readFileSync(fd,"utf8");
    if (Buffer.byteLength(data)>MAX_BYTES) throw Error("Private evidence exceeds size limit");
    try { return JSON.parse(data); }
    catch { throw Error("Invalid private evidence JSON"); }
  } finally {closeSync(fd);}
}

function syncDirectory(dir) {
  const fd=openSync(dir,constants.O_RDONLY);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
function writeLedger(dir,record,initial) {
  const body=JSON.stringify(record,null,2)+"\n";
  if(Buffer.byteLength(body)>MAX_BYTES)throw Error("Ledger exceeds size limit");
  const temp=join(dir,".cinema-"+randomUUID()+".tmp");
  const target=join(dir,ledgerName);
  const fd=openSync(temp,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL,0o600);
  try {
    try { fchmodSync(fd,0o600);writeFileSync(fd,body);fsyncSync(fd); }
    finally { closeSync(fd); }
    // Hard-link creation fails if the genesis already exists, even if another
    // process ignores the lock. Subsequent replacements are atomic on one FS.
    if(initial) linkSync(temp,target);
    else renameSync(temp,target);
    syncDirectory(dir);
  } finally { if(existsSync(temp))unlinkSync(temp); }
}
function locked(dir,action) {
  const lock=join(dir,lockName);
  let fd;
  try { fd=openSync(lock,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL,0o600); }
  catch(error) { if(error?.code==="EEXIST")throw Error("Draw ledger is locked; inspect before recovery");throw error; }
  try {writeFileSync(fd,String(process.pid)+"\n");fsyncSync(fd);return action();}
  finally {closeSync(fd);unlinkSync(lock);}
}

function genesisDigest(draw) {
  return digest({version:draw.version,campaign:draw.campaign,snapshotHash:draw.snapshotHash,
    drawnAt:draw.drawnAt,entrantCount:draw.entrantCount,ranking:draw.ranking});
}
function loadRecord(dir,now,expectedGenesis) {
  const input=privateJson(join(dir,ledgerName));
  if(!input||input.version!==1||typeof input.genesisDigest!=="string"||!DIGEST.test(input.genesisDigest))
    throw Error("Invalid ledger");
  const {snapshot,draw}=validateCinemaDraw(input.snapshot,input.draw,now);
  const original=genesisDigest(draw);
  if(original!==input.genesisDigest || (expectedGenesis!==undefined && expectedGenesis!==original))
    throw Error("Original witnessed draw digest does not match");
  return {version:1,genesisDigest:original,snapshot,draw};
}
function publicSummary(record) {
  return {...cinemaDrawSummary(record.draw),genesisDigest:record.genesisDigest,
    ledgerDigest:digest(record.draw)};
}

/** Create once; the approved snapshot must come from the reviewed export.
 * No eligible member IDs, names, emails or phone numbers are logged by this API.
 */
export function initialiseCinemaLedger(directory,snapshotInput,now=Date.now()) {
  const dir=privateDirectory(directory,true);
  return locked(dir,()=>{
    if(existsSync(join(dir,ledgerName)))throw Error("Draw already exists; never redraw");
    const snapshot=validateCinemaSnapshot(snapshotInput,now);
    const draw=createCinemaDraw(snapshot,now);
    const record={version:1,genesisDigest:genesisDigest(draw),snapshot,draw};
    writeLedger(dir,record,true);
    return publicSummary(record);
  });
}

export function inspectCinemaLedger(directory,expectedGenesis,now=Date.now()) {
  if(typeof expectedGenesis!=="string"||!DIGEST.test(expectedGenesis))throw Error("Supply the witnessed original digest");
  const record=loadRecord(privateDirectory(directory),now,expectedGenesis);
  return publicSummary(record);
}

/** Explicit private lookup only, to allow authorised staff to contact one candidate. */
export function lookupCinemaCandidate(directory,expectedGenesis,now=Date.now()) {
  if(typeof expectedGenesis!=="string"||!DIGEST.test(expectedGenesis))throw Error("Supply the witnessed original digest");
  const record=loadRecord(privateDirectory(directory),now,expectedGenesis);
  const memberId=cinemaCandidate(record.draw);
  if(!memberId)return null;
  const member=record.snapshot.entrants.find(entry=>entry.memberId===memberId);
  return {memberId,orderIds:[...member.orderIds]};
}

/** All writes require the witnessed genesis digest and the last observed state.
 * A second operator using a stale summary cannot accidentally claim or advance.
 */
export function updateCinemaLedger(directory,{genesis,previous,action,reason},now=Date.now()) {
  if(!DIGEST.test(genesis??"")||!DIGEST.test(previous??""))throw Error("Supply original and current ledger digests");
  const dir=privateDirectory(directory);
  return locked(dir,()=>{
    const record=loadRecord(dir,now,genesis);
    if(digest(record.draw)!==previous)throw Error("Ledger changed; inspect current state first");
    let draw;
    if(action==="contact")draw=recordCinemaContact(record.draw,now);
    else if(action==="claim")draw=recordCinemaClaim(record.draw,now);
    else if(action==="replace")draw=advanceCinemaCandidate(record.draw,reason,now);
    else throw Error("Unknown draw action");
    const updated={...record,draw};
    writeLedger(dir,updated,false);
    return publicSummary(updated);
  });
}

export function runCinemaLedgerCommand(args) {
  const [command,dir,first,second,reason]=args;
  if(!dir)throw Error("Supply a designated private draw directory");
  if(command==="init" && args.length===3) {
    // The source export must itself be a private, owner-readable JSON file.
    const source=realpathSync(resolve(first));
    if (inside(REPOSITORY_ROOT,source)) throw Error("Keep private evidence outside the repository");
    return initialiseCinemaLedger(dir,privateJson(resolve(first)));
  }
  if(command==="status" && args.length===3)return inspectCinemaLedger(dir,first);
  if(command==="candidate" && args.length===3)return lookupCinemaCandidate(dir,first);
  if(["contact","claim","replace"].includes(command) &&
    args.length===(command==="replace"?5:4))return updateCinemaLedger(dir,{genesis:first,previous:second,action:command,reason});
  throw Error("Commands: init DIR SNAPSHOT; status DIR GENESIS; candidate DIR GENESIS; contact/claim DIR GENESIS PREVIOUS; replace DIR GENESIS PREVIOUS REASON");
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {process.stdout.write(JSON.stringify(runCinemaLedgerCommand(process.argv.slice(2)),null,2)+"\n");}
  catch(error) {process.stderr.write("Cinema draw: "+(error instanceof Error?error.message:"Operation failed")+"\n");process.exitCode=1;}
}
