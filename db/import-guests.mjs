#!/usr/bin/env node
/**
 * Import the guest list into Supabase.
 *
 *   node db/import-guests.mjs path/to/guests.csv [--dry-run]
 *
 * Needs two environment variables, from the Supabase dashboard
 * (Settings -> API). The service role key bypasses RLS, so it must never go
 * anywhere near the browser or the repo:
 *
 *   export SUPABASE_URL=https://xxxx.supabase.co
 *   export SUPABASE_SERVICE_KEY=eyJ...
 *
 * For each row it creates a Supabase Auth user, a guests row, and a
 * guest_credentials row holding the readable password.
 *
 * Safe to run more than once: a guest who already exists is updated, not
 * duplicated, and keeps the password they were given.
 *
 * -- Where the reg number comes from ----------------------------------------
 * The roll number, which the registration form asks for explicitly and labels
 * "as on your student card", and which the volunteer checks against that card
 * at the gate.
 *
 * The email's local part is a fallback for a row whose roll number is missing
 * or obviously junk, because not everyone registers with their university
 * address. A row where neither works is rejected and listed for you to fix by
 * hand rather than guessed at.
 *
 * Whatever lands here becomes the guest's login name. Two students can still
 * mistype into a collision — "027" and "27" are different strings for the same
 * person — so duplicates are refused rather than silently overwriting someone.
 */

import { readFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const [, , csvPath, ...flags] = process.argv;
const DRY_RUN = flags.includes('--dry-run');

if (!csvPath) {
  console.error('usage: node db/import-guests.mjs <csv> [--dry-run]');
  process.exit(1);
}

/* ------------------------------------------------------------ csv parse */

/** Minimal RFC-4180 parser: handles quoted fields and embedded commas. */
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }

  const header = rows.shift().map((h) => h.trim());
  return rows
    .filter((r) => r.some((c) => c.trim()))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
}

/* -------------------------------------------------------- derivations */

/**
 * Normalise anything that might be a roll number: trim, uppercase, drop
 * internal spaces. "fa24-bed 009" and "FA24-BED-009" are the same person.
 *
 * Deliberately loose about the shape — intake and department codes vary and a
 * strict pattern locks real guests out at the gate. It only has to be a
 * plausible identifier, not a specific format.
 */
function normaliseRollNo(raw) {
  const s = (raw || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!s) return null;
  if (!/^[A-Z0-9][A-Z0-9-]{4,}$/.test(s)) return null;
  // Must contain a digit. Without this, a personal email local part like
  // "someone@gmail.com" becomes the login name SOMEONE, which is not a roll
  // number and nobody could verify against a student card.
  if (!/[0-9]/.test(s)) return null;
  return s;
}

/**
 * The key two spellings of the same roll number collide on.
 * "FA24-BED-010", "fa24-bed 010" and "FA24BED010" all reduce to FA24BED010,
 * so the duplicate check catches them. Without this they look like three
 * different people and three accounts get created for one student.
 */
function collisionKey(regNo) {
  return regNo.replace(/[^A-Z0-9]/g, '');
}

/** fa26-bed-027@cuilahore.edu.pk -> FA26-BED-027. Fallback only. */
function regNoFromEmail(email) {
  return normaliseRollNo((email || '').split('@')[0]);
}

/**
 * "Ahmad Moaz" -> "Ahmad M."   "Hannan Nazir" -> "Hannan N."
 * Single-word names are left alone. Admin can correct any that come out odd
 * before the game starts; this is what the big screen shows.
 */
function displayNameFrom(fullName) {
  const parts = (fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

/**
 * Six characters, random, unrelated to the reg number. No 0/O/1/l/I, because
 * a volunteer reads these out loud across a gate in the dark.
 */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
function makePassword() {
  let out = '';
  for (let i = 0; i < 6; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/* ---------------------------------------------------------------- main */

const rows = parseCsv(readFileSync(csvPath, 'utf8'));

const guests = [];
const rejected = [];
const seen = new Map();  // collision key -> the reg number that claimed it

let blank = 0;

for (const r of rows) {
  const fullName = r['Full name'] || r['Full Name'] || '';
  const email = r['Email'] || '';

  // A Google Sheet exports hundreds of trailing rows that hold nothing but a
  // stray FALSE in one checkbox column. They are not rejections, they are
  // empty, and listing them would bury the handful of real problems.
  if (!fullName && !email) { blank++; continue; }

  const rollRaw = r['Roll number'] || r['Roll Number'] || '';
  const fromRoll = normaliseRollNo(rollRaw);
  const fromEmail = regNoFromEmail(email);

  // Roll number first: the form asks for it explicitly, and it is what the
  // volunteer reads off the student card. Email only when that fails.
  const regNo = fromRoll ?? fromEmail;
  const source = fromRoll ? 'roll' : 'email';
  const displayName = displayNameFrom(fullName);

  if (!fullName) { rejected.push({ row: r, why: 'no name' }); continue; }
  if (!regNo) {
    rejected.push({
      row: r,
      why: `roll number "${rollRaw}" and email "${email}" are both unusable`,
    });
    continue;
  }
  const key = collisionKey(regNo);
  if (seen.has(key)) {
    rejected.push({
      row: r,
      why: `${regNo} collides with ${seen.get(key)} — same student twice, or a typo`,
    });
    continue;
  }
  seen.set(key, regNo);

  guests.push({
    reg_no: regNo,
    source,
    full_name: fullName,
    display_name: displayName,
    email,
    phone: r['Phone'] || null,
    payment_status: r['Status'] || null,
    password: makePassword(),
  });
}

console.log(`\nParsed ${rows.length} rows (${blank} empty, ignored)`);
console.log(`  importable : ${guests.length}`);
console.log(`  rejected   : ${rejected.length}`);

if (rejected.length) {
  console.log('\nRejected rows — fix these in the sheet and run again:');
  for (const { row, why } of rejected) {
    console.log(`  ${(row['Full name'] || '(no name)').padEnd(24)} ${why}`);
  }
}

const fromEmailCount = guests.filter((g) => g.source === 'email').length;
if (fromEmailCount) {
  console.log(`\n${fromEmailCount} reg number(s) came from the email, not the roll`);
  console.log('number column. Worth a look — those guests typed something odd:');
  for (const g of guests.filter((x) => x.source === 'email')) {
    console.log(`  ${g.reg_no.padEnd(14)} ${g.full_name}`);
  }
}

if (guests.length) {
  console.log('\nFirst few, to sanity-check the derivations:');
  for (const g of guests.slice(0, 5)) {
    console.log(
      `  ${g.reg_no.padEnd(14)} ${g.full_name.padEnd(22)} -> "${g.display_name}"` +
      `  [${g.payment_status}]${g.source === 'email' ? '  (from email)' : ''}`,
    );
  }
}

if (DRY_RUN) {
  console.log('\nDry run: nothing was written. Drop --dry-run to import.\n');
  process.exit(0);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) {
  console.error('\nSet SUPABASE_URL and SUPABASE_SERVICE_KEY first.\n');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

let created = 0, updated = 0, failed = 0;

for (const g of guests) {
  const authEmail = `${g.reg_no.toLowerCase()}@econgala.local`;

  const { data: existing } = await sb
    .from('guests').select('id, auth_user_id').eq('reg_no', g.reg_no).maybeSingle();

  try {
    let authUserId = existing?.auth_user_id;

    if (!authUserId) {
      const { data, error } = await sb.auth.admin.createUser({
        email: authEmail,
        password: g.password,
        email_confirm: true,
        user_metadata: { reg_no: g.reg_no },
      });
      if (error) throw error;
      authUserId = data.user.id;
    }

    const { error: upsertErr } = await sb.from('guests').upsert({
      auth_user_id: authUserId,
      reg_no: g.reg_no,
      full_name: g.full_name,
      display_name: g.display_name,
      email: g.email,
      phone: g.phone,
      payment_status: g.payment_status,
    }, { onConflict: 'reg_no' });
    if (upsertErr) throw upsertErr;

    const { data: row } = await sb
      .from('guests').select('id').eq('reg_no', g.reg_no).single();

    // Keep an existing password: a guest may already have been told theirs.
    const { data: cred } = await sb
      .from('guest_credentials').select('guest_id').eq('guest_id', row.id).maybeSingle();

    if (!cred) {
      await sb.from('guest_credentials').insert({ guest_id: row.id, password: g.password });
    }

    existing ? updated++ : created++;
  } catch (err) {
    failed++;
    console.error(`  FAILED ${g.reg_no}: ${err.message ?? err}`);
  }
}

console.log(`\nDone. created ${created}, updated ${updated}, failed ${failed}.`);
console.log('Passwords are in guest_credentials, readable only through the staff screen.\n');
