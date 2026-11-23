/*
 * NAGA Bracket Generator - core logic.
 * No screen code lives here, so this file can also be run and tested with Node.
 */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Divisions (from the README / NAGA US divisions). Weights in lbs.
  // ---------------------------------------------------------------------------

  const AGE_GROUPS = [
    { id: 'children', name: 'Children', label: '13 & under', min: 0, max: 13 },
    { id: 'teens', name: 'Teens', label: '14–17', min: 14, max: 17 },
    { id: 'adult', name: 'Adult', label: '18–29', min: 18, max: 29 },
    { id: 'master', name: 'Master', label: '30–39', min: 30, max: 39 },
    { id: 'director', name: 'Director', label: '40–49', min: 40, max: 49 },
    { id: 'executive', name: 'Executive', label: '50 & over', min: 50, max: Infinity },
  ];

  const GENDERS = [
    { id: 'M', name: 'Male' },
    { id: 'F', name: 'Female' },
  ];

  const EVENTS = [
    { id: 'gi', name: 'Gi' },
    { id: 'nogi', name: 'No-Gi' },
  ];

  const BELTS = ['white', 'blue', 'purple', 'brown', 'black'];

  // Each class is [lower, upper) - "upper" is the next class's lower bound.
  function buildClasses(uppers, names) {
    return uppers.map(function (upper, i) {
      const lower = i === 0 ? 0 : uppers[i - 1];
      let range;
      if (i === 0) range = 'Under ' + upper + ' lbs';
      else if (upper === Infinity) range = lower + ' lbs & over';
      else range = lower + '–' + (upper - 0.1).toFixed(1) + ' lbs';
      return { index: i, lower: lower, upper: upper, range: range, name: names ? names[i] : range };
    });
  }

  const WEIGHT_CLASSES = {
    children: buildClasses([40, 50, 60, 70, 80, 90, 100, 110, 125, 140, 155, 170, Infinity]),
    teens: buildClasses([100, 115, 130, 145, 160, 180, 200, Infinity]),
    men: buildClasses(
      [130, 140, 150, 160, 170, 180, 190, 200, 225, 250, Infinity],
      ['Flyweight', 'Bantamweight', 'Featherweight', 'Lightweight', 'Welterweight', 'Middleweight',
        'Light-Heavyweight', 'Cruiserweight', 'Heavyweight', 'Super-Heavyweight', 'Ultra-Heavyweight']
    ),
    women: buildClasses(
      [100, 110, 120, 130, 140, 150, 160, 170, 180, 190, 200, Infinity],
      ['Sub-atomic', 'Atomweight', 'Strawweight', 'Flyweight', 'Bantamweight', 'Featherweight',
        'Lightweight', 'Welterweight', 'Middleweight', 'Light-Heavyweight', 'Cruiserweight', 'Heavyweight']
    ),
  };

  function weightClassesFor(ageGroupId, gender) {
    if (ageGroupId === 'children') return WEIGHT_CLASSES.children;
    if (ageGroupId === 'teens') return WEIGHT_CLASSES.teens;
    return gender === 'F' ? WEIGHT_CLASSES.women : WEIGHT_CLASSES.men;
  }

  function weightClassIndex(classes, weight) {
    for (let i = 0; i < classes.length; i++) if (weight < classes[i].upper) return i;
    return classes.length - 1;
  }

  function ageGroupFor(age) {
    return AGE_GROUPS.find(function (g) { return age >= g.min && age <= g.max; }) || null;
  }

  // ---------------------------------------------------------------------------
  // Experience levels (from Elo) and starting scores for new fighters
  // ---------------------------------------------------------------------------

  // Staff pick how many levels (2-6). Fighters are sorted by Elo and split into
  // that many equal-sized levels - separately for each age group + gender, so
  // kids are only compared with kids, women with women, and so on.
  const MIN_LEVELS = 2;
  const MAX_LEVELS = 6;
  const DEFAULT_LEVELS = 3;

  function levelName(level) { return 'Level ' + (level + 1); }

  // Returns: levelOf (Map fighter -> level index, 0 = lowest Elo) and
  // ranges ("ageGroup|gender" -> [{min, max, count} per level]).
  function assignLevels(fighters, levelCount, ageGroupIdOf) {
    const buckets = new Map();
    fighters.forEach(function (f) {
      const k = ageGroupIdOf(f) + '|' + f.gender;
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(f);
    });
    const levelOf = new Map();
    const ranges = {};
    buckets.forEach(function (list, k) {
      list.sort(function (a, b) { return a.elo - b.elo; });
      const r = [];
      let prevElo = null, prevLevel = 0;
      list.forEach(function (f, i) {
        // Equal-sized split; fighters with the exact same Elo always share a level.
        let level = f.elo === prevElo ? prevLevel : Math.floor((i * levelCount) / list.length);
        prevElo = f.elo; prevLevel = level;
        levelOf.set(f, level);
        if (!r[level]) r[level] = { min: f.elo, max: f.elo, count: 0 };
        r[level].max = f.elo;
        r[level].count++;
      });
      ranges[k] = r;
    });
    return { levelOf: levelOf, ranges: ranges };
  }

  const ELO_MIN = 500;
  const ELO_MAX = 2500;
  const BELT_BASE_ELO = { white: 800, blue: 1150, purple: 1450, brown: 1750, black: 2050 };

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // A brand-new fighter has no results, so we start them from what they report.
  function provisionalElo(belt, years) {
    const base = BELT_BASE_ELO[belt] || BELT_BASE_ELO.white;
    return Math.round(clamp(base + Math.min(years || 0, 10) * 15, ELO_MIN, ELO_MAX));
  }

  // ---------------------------------------------------------------------------
  // Fighter records
  // ---------------------------------------------------------------------------

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function isoDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  function ageFromDob(dob, onDate) {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(String(dob || '').trim());
    let y, mo, d;
    if (m) { y = +m[1]; mo = +m[2]; d = +m[3]; } else {
      const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(dob || '').trim()); // MM/DD/YYYY
      if (!us) return null;
      y = +us[3]; mo = +us[1]; d = +us[2];
    }
    const on = onDate || new Date();
    let age = on.getFullYear() - y;
    if (on.getMonth() + 1 < mo || (on.getMonth() + 1 === mo && on.getDate() < d)) age--;
    return age;
  }

  function parseBool(v) {
    return /^(t|true|y|yes|1|x)$/i.test(String(v == null ? '' : v).trim());
  }

  function isNewRecord(record) {
    const m = /^\s*(\d+)\s*-\s*(\d+)/.exec(String(record || ''));
    return !m || (+m[1] === 0 && +m[2] === 0);
  }

  // Turns a raw record (from the generator or a CSV row) into a clean fighter.
  function normalizeFighter(raw, onDate) {
    const gender = String(raw.gender || '').trim().toUpperCase().charAt(0);
    if (gender !== 'M' && gender !== 'F') return { error: 'gender must be M or F' };

    let age = ageFromDob(raw.dob, onDate);
    if (age == null && raw.age !== '' && raw.age != null && !isNaN(+raw.age)) age = Math.floor(+raw.age);
    if (age == null || age < 0) return { error: 'missing date of birth / age' };

    const weight = parseFloat(raw.weight);
    if (!(weight > 0)) return { error: 'missing weight' };

    const belt = BELTS.indexOf(String(raw.belt || '').trim().toLowerCase()) >= 0
      ? String(raw.belt).trim().toLowerCase() : 'white';
    const years = Math.max(0, parseInt(raw.years, 10) || 0);
    const record = String(raw.record || '').trim() || '0-0';
    const eloGiven = raw.elo !== '' && raw.elo != null && !isNaN(+raw.elo);
    const provisional = !eloGiven || isNewRecord(record);
    const elo = eloGiven ? Math.round(+raw.elo) : provisionalElo(belt, years);

    const firstName = String(raw.firstName || '').trim();
    const lastName = String(raw.lastName || '').trim();
    const gym = String(raw.gym || '').trim();

    return {
      fighter: {
        id: String(raw.id || '').trim(),
        firstName: firstName,
        lastName: lastName,
        name: (firstName + ' ' + lastName).trim() || 'Unnamed fighter',
        dob: String(raw.dob || '').trim(),
        age: age,
        years: years,
        belt: belt,
        gym: gym,
        gymKey: gym.toLowerCase().replace(/\s+/g, ' '),
        gender: gender,
        weight: weight,
        record: record,
        elo: elo,
        provisional: provisional,
        gi: parseBool(raw.gi),
        noGi: parseBool(raw.noGi),
      },
    };
  }

  // ---------------------------------------------------------------------------
  // CSV in / out
  // ---------------------------------------------------------------------------

  const CSV_COLUMNS = [
    ['id', 'id'], ['First Name', 'firstName'], ['Last Name', 'lastName'], ['DOB', 'dob'], ['Age', 'age'],
    ['Years Experience', 'years'], ['Belt', 'belt'], ['Affiliation', 'gym'], ['Gender', 'gender'],
    ['Target Match Weight', 'weight'], ['Record', 'record'], ['ELO Score', 'elo'],
    ['is_gi_participant', 'gi'], ['is_no_gi_participant', 'noGi'],
  ];

  const HEADER_ALIASES = {
    id: 'id', fighterid: 'id',
    firstname: 'firstName', first: 'firstName',
    lastname: 'lastName', last: 'lastName',
    dob: 'dob', dateofbirth: 'dob', birthdate: 'dob', birthday: 'dob',
    age: 'age',
    yearsexperience: 'years', yearsofexperience: 'years', experience: 'years', years: 'years',
    belt: 'belt', beltlevel: 'belt',
    affiliation: 'gym', gym: 'gym', team: 'gym', academy: 'gym',
    gender: 'gender', sex: 'gender',
    targetmatchweight: 'weight', weight: 'weight', matchweight: 'weight',
    record: 'record',
    eloscore: 'elo', elo: 'elo', rating: 'elo',
    isgiparticipant: 'gi', gi: 'gi',
    isnogiparticipant: 'noGi', nogi: 'noGi',
  };

  function parseCSV(text) {
    const rows = [];
    let row = [], field = '', inQuotes = false;
    text = String(text).replace(/^﻿/, '');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQuotes) {
        if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
        else if (c === '"') inQuotes = false;
        else field += c;
      } else if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.some(function (f) { return f.trim() !== ''; })) rows.push(row);
        row = [];
      } else field += c;
    }
    row.push(field);
    if (row.some(function (f) { return f.trim() !== ''; })) rows.push(row);
    return rows;
  }

  function fightersFromCSV(text, onDate) {
    const rows = parseCSV(text);
    if (rows.length < 2) return { fighters: [], skipped: [], error: 'The file has no fighter rows.' };
    const keys = rows[0].map(function (h) { return HEADER_ALIASES[h.toLowerCase().replace(/[^a-z]/g, '')] || null; });
    const missing = ['gender', 'weight'].filter(function (k) { return keys.indexOf(k) < 0; });
    if (keys.indexOf('dob') < 0 && keys.indexOf('age') < 0) missing.push('DOB or Age');
    if (missing.length) return { fighters: [], skipped: [], error: 'Missing column(s): ' + missing.join(', ') };

    const fighters = [], skipped = [];
    for (let r = 1; r < rows.length; r++) {
      const raw = {};
      keys.forEach(function (k, i) { if (k) raw[k] = rows[r][i]; });
      if (!raw.id) raw.id = 'R' + r;
      const res = normalizeFighter(raw, onDate);
      if (res.error) skipped.push({ row: r + 1, reason: res.error });
      else fighters.push(res.fighter);
    }
    return { fighters: fighters, skipped: skipped };
  }

  function csvCell(v) {
    const s = String(v == null ? '' : v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function fightersToCSV(fighters) {
    const lines = [CSV_COLUMNS.map(function (c) { return c[0]; }).join(',')];
    fighters.forEach(function (f) {
      const row = {
        id: f.id, firstName: f.firstName, lastName: f.lastName, dob: f.dob, age: f.age, years: f.years,
        belt: f.belt, gym: f.gym, gender: f.gender, weight: f.weight, record: f.record, elo: f.elo,
        gi: f.gi ? 'T' : 'F', noGi: f.noGi ? 'T' : 'F',
      };
      lines.push(CSV_COLUMNS.map(function (c) { return csvCell(row[c[1]]); }).join(','));
    });
    return lines.join('\n') + '\n';
  }

  // ---------------------------------------------------------------------------
  // Fake fighter generator
  // ---------------------------------------------------------------------------

  const MALE_NAMES = ['James', 'Liam', 'Noah', 'Ethan', 'Mason', 'Lucas', 'Logan', 'Caleb', 'Owen', 'Wyatt',
    'Gabriel', 'Mateo', 'Diego', 'Andre', 'Marcus', 'Tyler', 'Ryan', 'Kevin', 'Brandon', 'Jordan', 'Dylan',
    'Isaac', 'Aiden', 'Carlos', 'Rafael', 'Victor', 'Omar', 'Hiro', 'Kenji', 'Darius', 'Malik', 'Connor',
    'Sean', 'Nathan', 'Eli', 'Jaxon', 'Hunter', 'Cole', 'Felipe', 'Tariq'];
  const FEMALE_NAMES = ['Olivia', 'Emma', 'Ava', 'Sophia', 'Mia', 'Isabella', 'Chloe', 'Grace', 'Zoe', 'Lily',
    'Hannah', 'Maya', 'Aria', 'Nora', 'Leah', 'Camila', 'Valeria', 'Lucia', 'Sofia', 'Jasmine', 'Nina',
    'Tessa', 'Riley', 'Brooke', 'Paige', 'Keira', 'Yuki', 'Amara', 'Imani', 'Sasha', 'Elena', 'Fatima',
    'Priya', 'Ruby', 'Quinn', 'Harper', 'Ivy', 'Jade', 'Kira', 'Talia'];
  const LAST_NAMES = ['Smith', 'Johnson', 'Williams', 'Brown', 'Garcia', 'Miller', 'Davis', 'Rodriguez',
    'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson',
    'Martin', 'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson',
    'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores', 'Green',
    'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts', 'Silva',
    'Souza', 'Costa', 'Tanaka', 'Kim', 'Patel', 'Okafor', 'Novak', 'Kowalski', 'Murphy', 'Reyes'];
  const GYMS = ['Iron Lotus BJJ', 'Riverside Grappling', 'Summit Jiu-Jitsu', 'North Shore Combat', 'Blue Basin MMA',
    'Coastal Submission Club', 'Granite State Grappling', 'Red Oak Jiu-Jitsu', 'Five Rivers BJJ',
    'Harbor City Grappling', 'Lone Pine Academy', 'Eastside Submission Team', 'Copper Valley BJJ',
    'Westgate Martial Arts', 'Silver Fern Jiu-Jitsu', 'Tidewater Grappling'];

  // Small seeded random generator so a given seed always makes the same fighters.
  function makeRandom(seed) {
    let a = (seed == null ? Math.floor(Math.random() * 2 ** 31) : seed) >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function generateFighters(count, seed, onDate) {
    const rand = makeRandom(seed);
    const today = onDate || new Date();
    const pick = function (arr) { return arr[Math.floor(rand() * arr.length)]; };
    const int = function (lo, hi) { return lo + Math.floor(rand() * (hi - lo + 1)); };
    const normal = function (mean, sd) {
      const u = 1 - rand(), v = rand();
      return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };
    // How a typical NAGA crowd splits across age groups.
    const ageMix = [['children', 0.28], ['teens', 0.14], ['adult', 0.30], ['master', 0.16], ['director', 0.08], ['executive', 0.04]];
    const ageRange = { children: [5, 13], teens: [14, 17], adult: [18, 29], master: [30, 39], director: [40, 49], executive: [50, 62] };

    const out = [];
    for (let i = 0; i < count; i++) {
      let r = rand(), groupId = ageMix[ageMix.length - 1][0];
      for (const [g, p] of ageMix) { if (r < p) { groupId = g; break; } r -= p; }
      const age = int(ageRange[groupId][0], ageRange[groupId][1]);
      const gender = rand() < 0.72 ? 'M' : 'F';

      let weight;
      if (groupId === 'children') weight = clamp(normal(40 + (age - 5) * 11, 9), 30, 190);
      else if (groupId === 'teens') weight = gender === 'M' ? clamp(normal(140 + (age - 14) * 8, 25), 85, 260) : clamp(normal(118 + (age - 14) * 5, 18), 80, 220);
      else weight = gender === 'M' ? clamp(normal(178, 28), 115, 320) : clamp(normal(138, 20), 92, 230);
      weight = Math.round(weight);

      const isNew = rand() < 0.12;
      let years;
      if (isNew) years = int(0, 1);
      else if (groupId === 'children') years = int(0, Math.min(age - 4, 8));
      else if (groupId === 'teens') years = int(0, Math.min(age - 6, 10));
      else years = Math.round(Math.pow(rand(), 1.6) * clamp(age - 15, 2, 25));

      let belt;
      if (isNew) belt = 'white';
      else if (groupId === 'children') belt = years < 4 ? 'white' : 'blue';
      else if (groupId === 'teens') belt = years < 3 ? 'white' : years < 6 ? 'blue' : 'purple';
      else belt = years < 2 ? 'white' : years < 5 ? 'blue' : years < 8 ? 'purple' : years < 11 ? 'brown' : 'black';

      let elo, record;
      if (isNew) {
        elo = provisionalElo(belt, years);
        record = '0-0';
      } else {
        elo = BELT_BASE_ELO[belt] + years * 12 + normal(0, 140);
        // Sandbaggers: they say "white/blue belt" but win far more than that level should.
        if ((belt === 'white' || belt === 'blue') && rand() < 0.08) elo += 450 + rand() * 300;
        elo = Math.round(clamp(elo, ELO_MIN, ELO_MAX));
        const fights = Math.max(1, Math.round(years * 3 + rand() * 6));
        const winRate = clamp(((elo - ELO_MIN) / (ELO_MAX - ELO_MIN)) * 0.8 + 0.1 + normal(0, 0.06), 0.05, 0.95);
        const wins = clamp(Math.round(fights * winRate), 0, fights);
        record = wins + '-' + (fights - wins);
      }

      const ev = rand();
      const dob = new Date(today.getFullYear() - age, today.getMonth(), today.getDate() - int(1, 364));
      const raw = {
        id: 'F' + String(i + 1).padStart(4, '0'),
        firstName: pick(gender === 'M' ? MALE_NAMES : FEMALE_NAMES),
        lastName: pick(LAST_NAMES),
        dob: isoDate(dob),
        years: years,
        belt: belt,
        gym: pick(GYMS),
        gender: gender,
        weight: weight,
        record: record,
        elo: elo,
        gi: ev < 0.65,
        noGi: ev >= 0.30,
      };
      out.push(normalizeFighter(raw, today).fighter);
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Seeding - who fights whom. Kept separate so the rule is easy to swap later.
  // ---------------------------------------------------------------------------

  // Current rule: rank by Elo (highest = seed 1), then keep teammates apart in round one.
  const SEEDING_RULES = {
    eloTeammatesApart: {
      name: 'Seeded by Elo + teammates apart',
      rank: function (entries) {
        return entries.slice().sort(function (a, b) {
          return b.fighter.elo - a.fighter.elo || a.fighter.name.localeCompare(b.fighter.name);
        });
      },
      separateTeammates: true,
    },
  };

  // Standard bracket order: seed 1 and 2 on opposite halves, 1 plays the lowest seed, etc.
  function seedOrder(size) {
    let order = [1];
    while (order.length < size) {
      const n = order.length * 2 + 1;
      order = order.reduce(function (acc, s) { acc.push(s, n - s); return acc; }, []);
    }
    return order;
  }

  function sameGym(a, b) { return !!(a && b && a.fighter.gymKey && a.fighter.gymKey === b.fighter.gymKey); }

  // Swap lower seeds between round-one matches so teammates don't meet first.
  // Byes are never touched, so the top seeds keep their skips.
  function separateTeammates(slots) {
    const pairs = slots.length / 2;
    const conflict = function (p) { return sameGym(slots[2 * p], slots[2 * p + 1]); };
    const realPair = function (p) { return !!(slots[2 * p] && slots[2 * p + 1]); };
    const swap = function (i, j) { const t = slots[i]; slots[i] = slots[j]; slots[j] = t; };
    for (let pass = 0; pass < 4; pass++) {
      let changed = false;
      for (let p = 0; p < pairs; p++) {
        if (!conflict(p)) continue;
        const i = slots[2 * p].seed > slots[2 * p + 1].seed ? 2 * p : 2 * p + 1; // the lower-ranked one moves
        const mover = slots[i];
        const options = [];
        for (let j = 0; j < slots.length; j++) if ((j >> 1) !== p && realPair(j >> 1)) options.push(j);
        options.sort(function (x, y) { return Math.abs(slots[x].seed - mover.seed) - Math.abs(slots[y].seed - mover.seed); });
        for (const j of options) {
          swap(i, j);
          if (!conflict(p) && !conflict(j >> 1)) { changed = true; break; }
          swap(i, j);
        }
      }
      if (!changed) break;
    }
  }

  function roundName(matchCount) {
    if (matchCount === 1) return 'Final';
    if (matchCount === 2) return 'Semifinals';
    if (matchCount === 4) return 'Quarterfinals';
    return 'Round of ' + matchCount * 2;
  }

  function buildElimination(seeded, rule) {
    const n = seeded.length;
    let size = 1;
    while (size < n) size *= 2;
    const slots = seedOrder(size).map(function (s) { return s <= n ? seeded[s - 1] : null; });
    if (rule.separateTeammates) separateTeammates(slots);

    let matchNo = 0;
    const advance = function (m) { return m.bye ? { kind: 'fighter', entry: m.top.entry } : { kind: 'winner', of: m.no }; };

    const first = [];
    for (let i = 0; i < size; i += 2) {
      const a = slots[i], b = slots[i + 1];
      if (a && b) first.push({ no: ++matchNo, top: { kind: 'fighter', entry: a }, bottom: { kind: 'fighter', entry: b } });
      else first.push({ no: null, bye: true, top: { kind: 'fighter', entry: a || b }, bottom: { kind: 'bye' } });
    }
    const rounds = [first];
    while (rounds[rounds.length - 1].length > 1) {
      const prev = rounds[rounds.length - 1], next = [];
      for (let i = 0; i < prev.length; i += 2) next.push({ top: advance(prev[i]), bottom: advance(prev[i + 1]) });
      if (next.length > 1) next.forEach(function (m) { m.no = ++matchNo; });
      rounds.push(next);
    }
    const semis = rounds[rounds.length - 2];
    const thirdPlace = { no: ++matchNo, top: { kind: 'loser', of: semis[0].no }, bottom: { kind: 'loser', of: semis[1].no } };
    rounds[rounds.length - 1][0].no = ++matchNo;

    return {
      rounds: rounds.map(function (ms) { return { name: roundName(ms.length), matches: ms }; }),
      thirdPlace: thirdPlace,
      byes: size - n,
      roundOneTeammateMatches: first.filter(function (m) { return !m.bye && sameGym(m.top.entry, m.bottom.entry); }).length,
    };
  }

  // ---------------------------------------------------------------------------
  // Tournament building
  // ---------------------------------------------------------------------------

  const DEFAULT_CONFIG = {
    genders: ['M', 'F'],
    ageGroups: AGE_GROUPS.map(function (g) { return g.id; }),
    events: ['gi', 'nogi'],
    levels: DEFAULT_LEVELS,
    seeding: 'eloTeammatesApart',
  };

  // Safety limits for moving a fighter who is alone into another bracket.
  const MAX_WEIGHT_GAP = 0.15; // never more than 15% heavier or lighter than anyone in the bracket
  const MAX_ELO_GAP = 400;     // auto-assign only: skill must be reasonably close

  const ADULT_AGE_IDS = ['adult', 'master', 'director', 'executive'];

  function groupKey(g) { return [g.event, g.gender, g.ageGroup, g.weightIdx, g.level].join('|'); }
  function ageGroupName(id) { return AGE_GROUPS.find(function (a) { return a.id === id; }).name; }
  function average(list, fn) { return list.reduce(function (s, x) { return s + fn(x); }, 0) / list.length; }

  // How many age groups a fighter moves to join targetAge: 0 = same group,
  // 1 = allowed move, -1 = never allowed (e.g. kids with adults).
  function ageStep(entry, targetAge) {
    if (targetAge === entry.ageGroup) return 0;
    const from = ADULT_AGE_IDS.indexOf(entry.ageGroup), to = ADULT_AGE_IDS.indexOf(targetAge);
    if (from > 0 && to === from - 1) return 1; // older adults may enter the next younger group (NAGA allows this)
    if (entry.ageGroup === 'children' && targetAge === 'teens' && entry.fighter.weight >= 170) return 1; // heavy kids may fight teens
    return -1;
  }

  function weightOk(entry, group) {
    const w = entry.fighter.weight;
    return group.entries.every(function (e) {
      return Math.max(w, e.fighter.weight) / Math.min(w, e.fighter.weight) <= 1 + MAX_WEIGHT_GAP;
    });
  }

  // Can this lone fighter join this group? If yes, how far is it (lower cost = closer)?
  function evaluate(entry, group) {
    if (!group.entries.length || group.entries.indexOf(entry) >= 0) return null;
    if (group.event !== entry.event || group.gender !== entry.gender) return null; // never mix genders or gi/no-gi
    const age = ageStep(entry, group.ageGroup);
    if (age < 0 || !weightOk(entry, group)) return null;
    const sameAge = age === 0;
    const weightUp = sameAge ? group.weightIdx - entry.home.weightIdx : 0;
    const levelDiff = sameAge ? Math.abs(group.level - entry.home.level) : 0;
    const eloGap = Math.abs(average(group.entries, function (e) { return e.fighter.elo; }) - entry.fighter.elo);
    const weightGap = Math.abs(average(group.entries, function (e) { return e.fighter.weight; }) - entry.fighter.weight) / entry.fighter.weight;
    return {
      group: group, age: age, weightUp: weightUp, levelDiff: levelDiff, eloGap: eloGap,
      cost: age * 3 + Math.abs(weightUp) + levelDiff + eloGap / 250 + weightGap * 10,
    };
  }

  function candidatesFor(entry, groups) {
    const out = [];
    groups.forEach(function (g) { const c = evaluate(entry, g); if (c) out.push(c); });
    return out.sort(function (a, b) { return a.cost - b.cost; });
  }

  // Rules tried in order; the first rule that finds a bracket wins.
  // 1st pass (always runs when brackets are built): the original "nearest group" rule.
  const FIRST_PASS_STEPS = [
    function (c) { return c.age === 0 && c.levelDiff === 0 && c.weightUp === 1; },           // next weight class up
    function (c) { return c.age === 0 && c.levelDiff === 1 && c.weightUp === 0; },           // nearest level
    function (c) { return c.age === 0 && c.levelDiff === 1 && c.weightUp === 1; },           // both
  ];
  // "Auto-assign all" button: looser rules, still inside the safety limits.
  const AUTO_ASSIGN_STEPS = [
    function (c) { return c.age === 0 && c.levelDiff === 0 && c.weightUp >= 1 && c.weightUp <= 2; },              // up to 2 weight classes up
    function (c) { return c.age === 0 && c.weightUp >= 0 && c.weightUp <= 2 && c.eloGap <= MAX_ELO_GAP; },        // any level, Elo close
    function (c) { return c.age === 1 && c.eloGap <= MAX_ELO_GAP; },                                               // adjacent age group
    function (c) { return c.eloGap <= MAX_ELO_GAP; },                                                              // anyone close enough (incl. another lone fighter)
  ];

  function bestCandidate(entry, groups, steps) {
    const all = candidatesFor(entry, groups);
    for (const step of steps) {
      const c = all.find(step);
      if (c) return c;
    }
    return null;
  }

  // Plain-words description of where a fighter was moved, e.g. "up 1 weight class, Level 1 → 2".
  function moveParts(entry, group) {
    const parts = [];
    if (group.ageGroup !== entry.home.ageGroup) {
      parts.push(ageGroupName(entry.home.ageGroup) + ' → ' + ageGroupName(group.ageGroup));
    } else {
      const up = group.weightIdx - entry.home.weightIdx;
      if (up) parts.push((up > 0 ? 'up ' : 'down ') + Math.abs(up) + ' weight class' + (Math.abs(up) > 1 ? 'es' : ''));
      if (group.level !== entry.home.level) parts.push('Level ' + (entry.home.level + 1) + ' → ' + (group.level + 1));
    }
    return parts;
  }

  function moveEntry(groups, from, to, byStaff) {
    const entry = from.entries[0];
    const parts = moveParts(entry, to);
    entry.note = byStaff ? 'Placed by staff' + (parts.length ? ' (' + parts.join(', ') + ')' : '') : 'Moved ' + parts.join(', ');
    to.entries.push(entry);
    groups.delete(from.key);
  }

  function placeLoneFighters(groups, steps) {
    let placed = 0, changed = true;
    while (changed) {
      changed = false;
      const lone = Array.from(groups.values())
        .filter(function (g) { return g.entries.length === 1; })
        .sort(function (a, b) { return a.weightIdx - b.weightIdx || a.level - b.level; });
      for (const g of lone) {
        if (!groups.has(g.key) || g.entries.length !== 1) continue;
        const best = bestCandidate(g.entries[0], groups, steps);
        if (!best) continue;
        moveEntry(groups, g, best.group, false);
        placed++;
        changed = true;
      }
    }
    return placed;
  }

  function buildTournament(fighters, config) {
    const cfg = Object.assign({}, DEFAULT_CONFIG, config || {});
    cfg.levels = clamp(parseInt(cfg.levels, 10) || DEFAULT_LEVELS, MIN_LEVELS, MAX_LEVELS);
    const excluded = [];
    const included = [];

    fighters.forEach(function (f) {
      const ag = ageGroupFor(f.age);
      if (cfg.genders.indexOf(f.gender) < 0) return excluded.push({ fighter: f, reason: 'Gender not in this tournament' });
      if (!ag || cfg.ageGroups.indexOf(ag.id) < 0) return excluded.push({ fighter: f, reason: 'Age group not in this tournament' });
      const events = cfg.events.filter(function (ev) { return ev === 'gi' ? f.gi : f.noGi; });
      if (!events.length) return excluded.push({ fighter: f, reason: 'Not entered in a selected event (gi / no-gi)' });
      included.push({ fighter: f, ageGroup: ag.id, events: events });
    });

    const levels = assignLevels(included.map(function (x) { return x.fighter; }), cfg.levels,
      function (f) { return ageGroupFor(f.age).id; });

    const groups = new Map();
    let registrations = 0;
    included.forEach(function (x) {
      const f = x.fighter;
      const classes = weightClassesFor(x.ageGroup, f.gender);
      x.events.forEach(function (ev) {
        const e = {
          fighter: f, event: ev, gender: f.gender, ageGroup: x.ageGroup,
          weightIdx: weightClassIndex(classes, f.weight), level: levels.levelOf.get(f), note: '', seed: 0,
        };
        e.home = { ageGroup: e.ageGroup, weightIdx: e.weightIdx, level: e.level }; // where they started
        const key = groupKey(e);
        if (!groups.has(key)) groups.set(key, { key: key, event: ev, gender: e.gender, ageGroup: e.ageGroup, weightIdx: e.weightIdx, level: e.level, entries: [] });
        groups.get(key).entries.push(e);
        registrations++;
      });
    });

    const t = {
      config: cfg,
      rule: SEEDING_RULES[cfg.seeding] || SEEDING_RULES.eloTeammatesApart,
      groups: groups,
      excluded: excluded,
      levelRanges: levels.ranges,
      registrations: registrations,
      fightersIn: included.length,
    };
    placeLoneFighters(groups, FIRST_PASS_STEPS);
    finalize(t);
    return t;
  }

  // (Re)builds the brackets from the current groups. Called after any fighter is moved.
  function finalize(t) {
    const agOrder = AGE_GROUPS.map(function (g) { return g.id; });
    const evOrder = EVENTS.map(function (e) { return e.id; });
    t.divisions = Array.from(t.groups.values()).sort(function (a, b) {
      return evOrder.indexOf(a.event) - evOrder.indexOf(b.event)
        || b.gender.localeCompare(a.gender) // Male first
        || agOrder.indexOf(a.ageGroup) - agOrder.indexOf(b.ageGroup)
        || a.weightIdx - b.weightIdx || a.level - b.level;
    }).map(function (g) {
      const classes = weightClassesFor(g.ageGroup, g.gender);
      const ranked = t.rule.rank(g.entries);
      ranked.forEach(function (e, k) { e.seed = k + 1; });
      const n = ranked.length;
      const range = (t.levelRanges[g.ageGroup + '|' + g.gender] || [])[g.level];
      const d = {
        key: g.key,
        event: g.event,
        eventName: EVENTS.find(function (e) { return e.id === g.event; }).name,
        gender: g.gender,
        genderName: g.gender === 'M' ? 'Male' : 'Female',
        ageGroup: g.ageGroup,
        ageGroupName: ageGroupName(g.ageGroup),
        weightClass: classes[g.weightIdx],
        level: g.level,
        levelName: levelName(g.level),
        levelRange: range ? { min: range.min, max: range.max } : null,
        entries: ranked,
        format: n === 1 ? 'noOpponent' : n === 2 ? 'bestOf3' : n === 3 ? 'roundRobin' : 'elimination',
      };
      if (d.format === 'bestOf3') d.matches = [1, 2, 3].map(function (k) { return { no: k, top: ranked[0], bottom: ranked[1], ifNeeded: k === 3 }; });
      // Round robin: top two seeds meet last.
      if (d.format === 'roundRobin') d.matches = [[1, 2], [0, 2], [0, 1]].map(function (p, k) { return { no: k + 1, top: ranked[p[0]], bottom: ranked[p[1]] }; });
      if (d.format === 'elimination') d.bracket = buildElimination(ranked, t.rule);
      return d;
    });
    t.byKey = {};
    t.divisions.forEach(function (d) { t.byKey[d.key] = d; });

    const count = function (fmt) { return t.divisions.filter(function (d) { return d.format === fmt; }).length; };
    t.stats = {
      fightersLoaded: t.fightersIn + t.excluded.length,
      fightersIn: t.fightersIn,
      registrations: t.registrations,
      brackets: t.divisions.length - count('noOpponent'),
      bestOf3: count('bestOf3'),
      roundRobin: count('roundRobin'),
      elimination: count('elimination'),
      noOpponent: count('noOpponent'),
      moved: t.divisions.reduce(function (s, d) { return s + d.entries.filter(function (e) { return e.note; }).length; }, 0),
    };
    return t;
  }

  // "Auto-assign all": tries the looser rules for everyone still alone.
  function autoAssignAll(t) {
    const placed = placeLoneFighters(t.groups, AUTO_ASSIGN_STEPS);
    finalize(t);
    return { placed: placed, left: t.stats.noOpponent };
  }

  // The closest brackets a lone fighter could join (safety limits always apply; Elo gap is shown, not enforced).
  function suggestionsFor(t, key, limit) {
    const g = t.groups.get(key);
    if (!g || g.entries.length !== 1) return [];
    const entry = g.entries[0];
    return candidatesFor(entry, t.groups).slice(0, limit || 3).map(function (c) {
      return {
        division: t.byKey[c.group.key],
        move: moveParts(entry, c.group).join(', '),
        eloDiff: Math.round(average(c.group.entries, function (e) { return e.fighter.elo; }) - entry.fighter.elo),
      };
    });
  }

  // Staff picked a bracket for a lone fighter.
  function assignTo(t, fromKey, toKey) {
    const from = t.groups.get(fromKey), to = t.groups.get(toKey);
    if (!from || !to || from === to || from.entries.length !== 1) return false;
    if (!evaluate(from.entries[0], to)) return false;
    moveEntry(t.groups, from, to, true);
    finalize(t);
    return true;
  }

  // Plain-words reason why a fighter could not be placed.
  function whyAlone(t, key) {
    const g = t.groups.get(key);
    if (!g) return '';
    const e = g.entries[0], f = e.fighter;
    const pool = [];
    t.groups.forEach(function (o) {
      if (o === g || o.event !== e.event || o.gender !== e.gender) return;
      if (ageStep(e, o.ageGroup) >= 0 || o.entries.some(function (x) { return ageStep(x, e.ageGroup) >= 0; })) {
        o.entries.forEach(function (x) { pool.push(x); });
      }
    });
    const who = (f.gender === 'M' ? 'male' : 'female') + ' ' + ageGroupName(e.ageGroup) + ' ' + (e.event === 'gi' ? 'Gi' : 'No-Gi');
    if (!pool.length) return 'No other ' + who + ' fighters entered.';
    const closeWeight = pool.filter(function (x) {
      return Math.max(f.weight, x.fighter.weight) / Math.min(f.weight, x.fighter.weight) <= 1 + MAX_WEIGHT_GAP;
    });
    if (!closeWeight.length) return 'No ' + who + ' fighter is within 15% of their weight (' + f.weight + ' lbs).';
    return 'No bracket is close enough in both weight and skill.';
  }

  const NagaLogic = {
    AGE_GROUPS: AGE_GROUPS, GENDERS: GENDERS, EVENTS: EVENTS, BELTS: BELTS,
    WEIGHT_CLASSES: WEIGHT_CLASSES, DEFAULT_CONFIG: DEFAULT_CONFIG,
    MIN_LEVELS: MIN_LEVELS, MAX_LEVELS: MAX_LEVELS, DEFAULT_LEVELS: DEFAULT_LEVELS,
    MAX_WEIGHT_GAP: MAX_WEIGHT_GAP, MAX_ELO_GAP: MAX_ELO_GAP,
    SEEDING_RULES: SEEDING_RULES,
    weightClassesFor: weightClassesFor, weightClassIndex: weightClassIndex, ageGroupFor: ageGroupFor,
    levelName: levelName, assignLevels: assignLevels, provisionalElo: provisionalElo, ageFromDob: ageFromDob,
    normalizeFighter: normalizeFighter, parseCSV: parseCSV, fightersFromCSV: fightersFromCSV, fightersToCSV: fightersToCSV,
    generateFighters: generateFighters, seedOrder: seedOrder, buildElimination: buildElimination,
    buildTournament: buildTournament, autoAssignAll: autoAssignAll, suggestionsFor: suggestionsFor,
    assignTo: assignTo, whyAlone: whyAlone,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = NagaLogic;
  else global.NagaLogic = NagaLogic;
})(typeof window !== 'undefined' ? window : this);
