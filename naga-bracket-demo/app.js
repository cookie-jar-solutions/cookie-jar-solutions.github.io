/* Bracket Generator - screen code. All bracket rules live in logic.js. */
(function () {
  'use strict';
  const L = window.NagaLogic;
  const $ = function (id) { return document.getElementById(id); };

  let fighters = [];
  let tournament = null;   // result of L.buildTournament
  let levels = L.DEFAULT_LEVELS;
  let step = 1;
  const openKeys = new Set();     // brackets the user has opened
  const openChoices = new Set();  // lone fighters whose "Choose bracket" list is open
  let assignMessage = '';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // ------------------------------------------------------------ Steps

  function canGo(n) {
    if (n === 1) return true;
    if (n === 2) return fighters.length > 0;
    return !!tournament;
  }

  function goTo(n) {
    if (!canGo(n)) return;
    step = n;
    [1, 2, 3].forEach(function (i) { $('step' + i).hidden = i !== n; });
    updateStepper();
    window.scrollTo(0, 0);
  }

  function updateStepper() {
    document.querySelectorAll('.stepper').forEach(function (b) {
      const n = +b.dataset.go;
      b.classList.toggle('current', n === step);
      b.classList.toggle('done', n < step);
      b.disabled = !canGo(n);
    });
    $('next1').disabled = !fighters.length;
  }

  document.addEventListener('click', function (ev) {
    const b = ev.target.closest('[data-go]');
    if (b && !b.disabled) goTo(+b.dataset.go);
  });

  // Short "working" screen so staff can see something happened (building itself is instant).
  function withLoading(text, work) {
    $('loadingText').textContent = text;
    $('loading').hidden = false;
    setTimeout(function () {
      try { work(); } finally { $('loading').hidden = true; }
    }, 700);
  }

  // ------------------------------------------------------------ Step 1: fighters

  function setFighters(list, message) {
    fighters = list;
    tournament = null;
    const men = list.filter(function (f) { return f.gender === 'M'; }).length;
    const gi = list.filter(function (f) { return f.gi; }).length;
    const nogi = list.filter(function (f) { return f.noGi; }).length;
    const st = $('fighterStatus');
    st.hidden = false;
    st.className = 'status ok';
    st.innerHTML = '<strong>' + list.length + ' fighters ready.</strong><br>' +
      men + ' male, ' + (list.length - men) + ' female · ' + gi + ' gi, ' + nogi + ' no-gi' +
      (message ? '<div class="small">' + message + '</div>' : '');
    updateStepper();
  }

  $('btnFake').addEventListener('click', function () {
    const n = Math.max(2, Math.min(5000, parseInt($('fakeCount').value, 10) || 1000));
    $('fakeCount').value = n;
    setFighters(L.generateFighters(n));
  });

  $('csvFile').addEventListener('change', function (ev) {
    const file = ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      const res = L.fightersFromCSV(reader.result);
      ev.target.value = '';
      if (res.error || !res.fighters.length) {
        const st = $('fighterStatus');
        st.hidden = false;
        st.className = 'status bad';
        st.textContent = 'Could not read "' + file.name + '": ' + (res.error || 'no usable fighter rows.');
        return;
      }
      let msg = 'From ' + esc(file.name) + '.';
      if (res.skipped.length) {
        msg += ' ' + res.skipped.length + ' row(s) skipped: ' + res.skipped.slice(0, 5).map(function (s) {
          return 'row ' + s.row + ' (' + esc(s.reason) + ')';
        }).join(', ') + (res.skipped.length > 5 ? '…' : '');
      }
      setFighters(res.fighters, msg);
    };
    reader.readAsText(file);
  });

  // ------------------------------------------------------------ Step 2: setup

  function checkboxes(container, items, name) {
    $(container).innerHTML = items.map(function (it) {
      return '<label class="check"><input type="checkbox" name="' + name + '" value="' + it.id + '" checked>' +
        '<span>' + esc(it.name) + (it.label ? ' <small>' + esc(it.label) + '</small>' : '') + '</span></label>';
    }).join('');
  }
  checkboxes('cfgGenders', L.GENDERS, 'gender');
  checkboxes('cfgEvents', L.EVENTS, 'event');
  checkboxes('cfgAges', L.AGE_GROUPS, 'age');

  function renderLevelPills() {
    let html = '';
    for (let n = L.MIN_LEVELS; n <= L.MAX_LEVELS; n++) {
      html += '<button type="button" class="pill' + (n === levels ? ' on' : '') + '" role="radio" aria-checked="' + (n === levels) + '" data-levels="' + n + '">' + n + '</button>';
    }
    $('cfgLevels').innerHTML = html;
  }
  renderLevelPills();
  $('cfgLevels').addEventListener('click', function (ev) {
    const b = ev.target.closest('[data-levels]');
    if (!b) return;
    levels = +b.dataset.levels;
    renderLevelPills();
    setupChanged();
  });
  $('step2').addEventListener('change', setupChanged);

  // Changing the setup means the old brackets are out of date.
  function setupChanged() { tournament = null; updateStepper(); }

  function checked(name) {
    return Array.from(document.querySelectorAll('input[name="' + name + '"]:checked')).map(function (i) { return i.value; });
  }

  $('btnBuild').addEventListener('click', function () {
    const cfg = { genders: checked('gender'), events: checked('event'), ageGroups: checked('age'), levels: levels };
    const error = !cfg.genders.length ? 'Pick at least one gender.'
      : !cfg.events.length ? 'Pick Gi, No-Gi, or both.'
        : !cfg.ageGroups.length ? 'Pick at least one age group.' : '';
    $('configError').hidden = !error;
    $('configError').textContent = error;
    if (error) return;
    withLoading('Building brackets…', function () {
      tournament = L.buildTournament(fighters, cfg);
      openKeys.clear();
      openChoices.clear();
      assignMessage = '';
      fillFilters();
      renderAll();
      goTo(3);
    });
  });

  // ------------------------------------------------------------ Step 3: brackets

  function fillFilters() {
    const opt = function (all, items) {
      return '<option value="">' + all + '</option>' + items.map(function (i) { return '<option value="' + i.id + '">' + esc(i.name) + '</option>'; }).join('');
    };
    const c = tournament.config;
    $('fEvent').innerHTML = opt('Gi & No-Gi', L.EVENTS.filter(function (e) { return c.events.indexOf(e.id) >= 0; }));
    $('fGender').innerHTML = opt('All genders', L.GENDERS.filter(function (g) { return c.genders.indexOf(g.id) >= 0; }));
    $('fAge').innerHTML = opt('All ages', L.AGE_GROUPS.filter(function (a) { return c.ageGroups.indexOf(a.id) >= 0; }));
    $('fSearch').value = '';
  }
  ['fSearch', 'fEvent', 'fGender', 'fAge'].forEach(function (id) { $(id).addEventListener('input', renderList); });

  function renderAll() { renderList(); renderUnmatched(); }

  function weightLabel(d) {
    const w = d.weightClass;
    return w.name === w.range ? w.range : w.name + ' <small>' + esc(w.range) + '</small>';
  }
  function plainTitle(d) {
    const w = d.weightClass;
    return d.eventName + ' · ' + d.genderName + ' · ' + d.ageGroupName + ' · ' + (w.name === w.range ? w.range : w.name) + ' · ' + d.levelName;
  }

  const FORMAT_LABEL = { bestOf3: 'Best of 3', roundRobin: 'Round robin', elimination: 'Bracket' };

  function matchesQuery(f, q) {
    return !!q && (f.name.toLowerCase().indexOf(q) >= 0 || f.gym.toLowerCase().indexOf(q) >= 0);
  }

  // Collapsed list: one row per bracket, grouped under "Gi · Male · Adult" headings.
  function renderList() {
    if (!tournament) return;
    const q = $('fSearch').value.trim().toLowerCase();
    const ev = $('fEvent').value, g = $('fGender').value, a = $('fAge').value;
    const shown = tournament.divisions.filter(function (d) {
      if (d.format === 'noOpponent') return false;
      if (ev && d.event !== ev) return false;
      if (g && d.gender !== g) return false;
      if (a && d.ageGroup !== a) return false;
      if (q && !d.entries.some(function (e) { return matchesQuery(e.fighter, q); })) return false;
      return true;
    });
    $('shownCount').textContent = shown.length === tournament.stats.brackets
      ? tournament.stats.brackets + ' brackets. Tap one to open it.'
      : 'Showing ' + shown.length + ' of ' + tournament.stats.brackets + ' brackets.';

    let html = '', lastHead = '';
    shown.forEach(function (d) {
      const head = d.eventName + ' · ' + d.genderName + ' · ' + d.ageGroupName;
      if (head !== lastHead) {
        html += '<h3 class="list-head">' + esc(head) + '</h3>';
        lastHead = head;
      }
      const found = q ? d.entries.filter(function (e) { return matchesQuery(e.fighter, q); }).map(function (e) { return esc(e.fighter.name); }) : [];
      const open = openKeys.has(d.key);
      html += '<details class="row" data-key="' + esc(d.key) + '"' + (open ? ' open' : '') + '>' +
        '<summary>' +
        '<span class="row-main"><span class="row-title">' + weightLabel(d) + '</span>' +
        '<span class="row-sub">' + d.levelName + ' · ' + d.entries.length + ' fighters · ' + FORMAT_LABEL[d.format] + '</span>' +
        (found.length ? '<span class="row-found">Found: ' + found.join(', ') + '</span>' : '') + '</span>' +
        '<span class="chev" aria-hidden="true"></span>' +
        '</summary>' +
        '<div class="row-body">' + (open ? renderDivision(d, q) : '') + '</div>' +
        '</details>';
    });
    $('list').innerHTML = html || '<p class="hint empty">No brackets match this search.</p>';
  }

  // Opening a row draws its bracket (only open brackets are drawn, which keeps phones fast).
  $('list').addEventListener('toggle', function (ev) {
    const row = ev.target;
    if (!row.classList || !row.classList.contains('row')) return;
    const key = row.dataset.key;
    if (row.open) {
      openKeys.add(key);
      const d = tournament.byKey[key];
      if (d) row.querySelector('.row-body').innerHTML = renderDivision(d, $('fSearch').value.trim().toLowerCase());
    } else {
      openKeys.delete(key);
    }
  }, true);

  // Phone round tabs.
  $('list').addEventListener('click', function (ev) {
    const tab = ev.target.closest('.tab');
    if (!tab) return;
    const box = tab.closest('.tabs-view');
    box.querySelectorAll('.tab').forEach(function (t) { t.classList.toggle('on', t === tab); t.setAttribute('aria-selected', t === tab); });
    box.querySelectorAll('.panel').forEach(function (p) { p.hidden = p.dataset.panel !== tab.dataset.tab; });
  });

  function renderDivision(d, q) {
    const range = d.levelRange ? ' (Elo ' + d.levelRange.min + '–' + d.levelRange.max + ')' : '';
    let body = '<p class="div-info">' + esc(plainTitle(d)) + range + '</p>';
    if (d.format === 'bestOf3') body += renderBestOf3(d, q);
    else if (d.format === 'roundRobin') body += renderRoundRobin(d, q);
    else body += renderTree(d, q) + renderTabs(d, q);
    return body;
  }

  function chip(e, q) {
    const f = e.fighter;
    let tags = '';
    if (f.provisional) tags += '<span class="tag" title="No fight record yet - starting score from belt and experience">New</span>';
    if (e.note) tags += '<span class="tag moved">' + esc(e.note) + '</span>';
    return '<div class="fighter' + (matchesQuery(f, q) ? ' hl' : '') + '">' +
      '<span class="seed" title="Seed">' + e.seed + '</span>' +
      '<span class="who"><span class="name">' + esc(f.name) + '</span>' +
      '<span class="meta">' + esc(f.gym || 'No gym') + ' · ' + cap(f.belt) + ' · Elo ' + f.elo + '</span>' +
      (tags ? '<span class="tags">' + tags + '</span>' : '') + '</span></div>';
  }

  function renderBestOf3(d, q) {
    return '<div class="pair">' + chip(d.entries[0], q) + '<div class="vs">vs</div>' + chip(d.entries[1], q) + '</div>' +
      '<p class="hint small">They fight up to 3 times. First to win 2 takes 1st place.</p>';
  }

  function renderRoundRobin(d, q) {
    const name = function (e) { return '<strong>' + esc(e.fighter.name) + '</strong>'; };
    return '<div class="rr"><div class="stack">' + d.entries.map(function (e) { return chip(e, q); }).join('') + '</div>' +
      '<ol class="rr-bouts">' + d.matches.map(function (m) { return '<li>' + name(m.top) + ' vs ' + name(m.bottom) + '</li>'; }).join('') + '</ol></div>' +
      '<p class="hint small">Everyone fights everyone. Most wins takes 1st place.</p>';
  }

  function slot(s, q) {
    if (s.kind === 'fighter') return chip(s.entry, q);
    if (s.kind === 'bye') return '';
    if (s.kind === 'winner') return '<div class="placeholder">Winner of M' + s.of + '</div>';
    return '<div class="placeholder">Loser of M' + s.of + '</div>';
  }

  function matchBox(m, q) {
    return '<div class="match' + (m.bye ? ' bye' : '') + '">' +
      '<div class="mno">' + (m.bye ? 'Skips round 1' : 'M' + m.no) + '</div>' +
      slot(m.top, q) + slot(m.bottom, q) + '</div>';
  }

  // Desktop: two halves that meet in the middle. The left half flows right, the
  // right half flows left, and the final + 3rd place match sit in the center.
  // Each first-round match gets one equal-height grid row; a match in round r
  // spans 2^r rows, so it sits exactly between the two matches that feed it.
  // The lines are drawn in style.css (.cell.up / .down / .in / .to-final).
  function renderTree(d, q) {
    const b = d.bracket, R = b.rounds.length;           // R >= 2 (4+ fighters)
    const rows = b.rounds[0].matches.length / 2;        // rows per half
    const cols = 2 * R - 1;
    const center = R;
    const place = function (col, row, span) { return 'grid-column:' + col + ';grid-row:' + row + ' / span ' + span; };
    let html = '';
    for (let r = 0; r < R - 1; r++) {
      html += '<div class="round-title" style="grid-column:' + (r + 1) + ';grid-row:1">' + b.rounds[r].name + '</div>';
      html += '<div class="round-title" style="grid-column:' + (cols - r) + ';grid-row:1">' + b.rounds[r].name + '</div>';
      const ms = b.rounds[r].matches, half = ms.length / 2, span = Math.pow(2, r);
      ms.forEach(function (m, i) {
        const left = i < half, k = left ? i : i - half;
        const cls = ['cell', left ? 'L' : 'R'];
        cls.push(r < R - 2 ? (k % 2 === 0 ? 'up' : 'down') : 'to-final');
        if (r > 0) cls.push('in');
        html += '<div class="' + cls.join(' ') + '" style="' + place(left ? r + 1 : cols - r, 2 + k * span, span) + '">' + matchBox(m, q) + '</div>';
      });
    }
    html += '<div class="round-title center" style="grid-column:' + center + ';grid-row:1">Final</div>';
    html += '<div class="cell final" style="' + place(center, 2, rows) + '">' + matchBox(b.rounds[R - 1].matches[0], q) + '</div>';
    html += '<div class="cell third" style="grid-column:' + center + ';grid-row:' + (rows + 2) + '"><div class="round-title center">3rd place</div>' + matchBox(b.thirdPlace, q) + '</div>';
    return '<div class="tree-view"><div class="tree-scroll"><div class="tree" style="--cols:' + cols + ';--rows:' + rows + '">' + html + '</div></div>' +
      (b.byes ? '<p class="hint small">' + b.byes + ' top-ranked fighter(s) skip round 1.</p>' : '') + '</div>';
  }

  // Phone: one round at a time, with tabs.
  function renderTabs(d, q) {
    const b = d.bracket;
    const tabs = b.rounds.map(function (r, i) {
      const last = i === b.rounds.length - 1;
      return {
        name: last ? 'Final' : r.name,
        html: r.matches.map(function (m) { return matchBox(m, q); }).join('') +
          (last ? '<div class="round-title">3rd place</div>' + matchBox(b.thirdPlace, q) : ''),
      };
    });
    return '<div class="tabs-view"><div class="tabs" role="tablist">' +
      tabs.map(function (t, i) { return '<button type="button" class="tab' + (i === 0 ? ' on' : '') + '" role="tab" aria-selected="' + (i === 0) + '" data-tab="' + i + '">' + t.name + '</button>'; }).join('') +
      '</div>' +
      tabs.map(function (t, i) { return '<div class="panel stack" data-panel="' + i + '"' + (i === 0 ? '' : ' hidden') + '>' + t.html + '</div>'; }).join('') +
      '</div>';
  }

  // ------------------------------------------------------------ Fighters without an opponent

  function renderUnmatched() {
    const lone = tournament.divisions.filter(function (d) { return d.format === 'noOpponent'; });
    let html = '<h3>Fighters without an opponent' + (lone.length ? ' (' + lone.length + ')' : '') + '</h3>';
    if (assignMessage) html += '<p class="status ok">' + assignMessage + '</p>';
    if (!lone.length) {
      $('unmatched').innerHTML = html + '<p class="hint">Everyone has an opponent.</p>';
      return;
    }
    html += '<p class="hint">These fighters had nobody close enough in weight and level. ' +
      '<strong>Auto-assign</strong> tries looser rules. You can also choose a bracket for each fighter yourself.</p>' +
      '<button class="btn primary" id="btnAuto">Auto-assign all</button>' +
      '<ul class="lone-list">';
    lone.forEach(function (d) {
      const e = d.entries[0], f = e.fighter;
      const sugg = L.suggestionsFor(tournament, d.key, 3);
      const isOpen = openChoices.has(d.key);
      html += '<li class="lone" data-key="' + esc(d.key) + '">' +
        '<div class="lone-top"><div class="who"><span class="name">' + esc(f.name) + '</span>' +
        '<span class="meta">' + esc(f.gym || 'No gym') + ' · ' + f.weight + ' lbs · Elo ' + f.elo + '</span>' +
        '<span class="meta">' + esc(plainTitle(d)) + '</span></div>' +
        (sugg.length ? '<button class="btn small" data-act="choose">' + (isOpen ? 'Close' : 'Choose bracket') + '</button>' : '') + '</div>';
      if (!sugg.length) {
        html += '<p class="cant">Could not place: ' + esc(L.whyAlone(tournament, d.key)) + '</p>';
      } else if (isOpen) {
        html += '<div class="choices">' + sugg.map(function (s) {
          const diff = s.eloDiff === 0 ? 'same Elo' : 'Elo ' + (s.eloDiff > 0 ? s.eloDiff + ' higher' : -s.eloDiff + ' lower') + ' on average';
          const bigGap = Math.abs(s.eloDiff) > L.MAX_ELO_GAP;
          return '<button class="choice" data-act="assign" data-to="' + esc(s.division.key) + '">' +
            '<strong>' + esc(plainTitle(s.division)) + '</strong>' +
            '<span>' + s.division.entries.length + ' fighter' + (s.division.entries.length > 1 ? 's' : '') + ' · ' + esc(s.move) + ' · ' + diff + '</span>' +
            (bigGap ? '<span class="warn">Big skill difference - check before using</span>' : '') +
            '</button>';
        }).join('') + '</div>';
      }
      html += '</li>';
    });
    $('unmatched').innerHTML = html + '</ul>';
  }

  $('unmatched').addEventListener('click', function (ev) {
    if (ev.target.closest('#btnAuto')) {
      withLoading('Finding opponents…', function () {
        const before = tournament.stats.noOpponent;
        const res = L.autoAssignAll(tournament);
        openChoices.clear();
        // Pairing two lone fighters fixes both, so count fighters, not moves.
        const helped = before - res.left;
        assignMessage = helped
          ? helped + ' of ' + before + ' fighters now have an opponent. Look for the "Moved" tag in their brackets.' + (res.left ? ' ' + res.left + ' still need a decision.' : '')
          : 'No more fighters could be placed automatically.';
        renderAll();
      });
      return;
    }
    const li = ev.target.closest('.lone');
    if (!li) return;
    const key = li.dataset.key;
    if (ev.target.closest('[data-act="choose"]')) {
      if (openChoices.has(key)) openChoices.delete(key); else openChoices.add(key);
      renderUnmatched();
      return;
    }
    const pick = ev.target.closest('[data-act="assign"]');
    if (pick) {
      const name = tournament.byKey[key].entries[0].fighter.name;
      const target = tournament.byKey[pick.dataset.to];
      if (L.assignTo(tournament, key, pick.dataset.to)) {
        openChoices.delete(key);
        assignMessage = esc(name) + ' was placed in ' + esc(plainTitle(target)) + '.';
        renderAll();
      }
    }
  });

  updateStepper();
})();
