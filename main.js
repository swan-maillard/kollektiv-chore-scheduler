// ═══════════════════════════════════════════════════════════
// DATA DEFINITION — Edit chores, people, likes/dislikes here
// ═══════════════════════════════════════════════════════════

const CHORES = [
  { id: 'entrance',   name: 'Entrance',       icon: 'door-open' },
  { id: 'kitchen',    name: 'Kitchen',        icon: 'cooking-pot' },
  { id: 'living',     name: 'Living Room',    icon: 'sofa' },
  { id: 'major_bath', name: 'Major Bathroom', icon: 'toilet' },
  { id: 'minor_bath', name: 'Minor Bathroom', icon: 'shower-head' },
  { id: 'trash',      name: 'Trash',          icon: 'trash-2' },
];

const PEOPLE = [
  { name: 'Ingeborg', color: '#60a5fa', likes: ['minor_bath', 'major_bath', 'trash', 'kitchen', 'entrance', 'living'], dislikes: [] },
  { name: 'Katrin',   color: '#34d399', likes: ['minor_bath', 'kitchen'],                          dislikes: ['trash'] },
  { name: 'Klara',    color: '#c084fc', likes: ['minor_bath', 'living'],                                     dislikes: [] },
  { name: 'Marie',    color: '#f472b6', likes: ['kitchen', 'major_bath', 'living'],                dislikes: ['entrance'] },
  { name: 'Moritz',   color: '#fb923c', likes: ['trash', 'major_bath'],                            dislikes: ['kitchen'] },
  { name: 'Swan',     color: '#fbbf24', likes: ['major_bath', 'trash', 'entrance'],               dislikes: [] },
  { name: 'Viviane',  color: '#f87171', likes: ['trash', 'minor_bath'],                                          dislikes: [] },
];

const WEEKS_PER_MONTH = 5;

// ═══════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════

let monthHistory = [];
// Carry-over: tracks cumulative happiness per person across months (can be negative or positive)
let cumulativeHappiness = {};
PEOPLE.forEach(p => cumulativeHappiness[p.name] = 0);

// ═══════════════════════════════════════════════════════════
// SCORING
// ═══════════════════════════════════════════════════════════

function choreScore(person, choreId) {
  if (person.likes.includes(choreId)) return 2;
  if (person.dislikes.includes(choreId)) return -2;
  return 0;
}

function happinessColor(score) {
  if (score >= 1.5) return 'var(--happy)';
  if (score >= 0) return 'var(--neutral)';
  return 'var(--sad)';
}

// ═══════════════════════════════════════════════════════════
// SCHEDULER — Constraint-satisfaction with happiness optimization
// ═══════════════════════════════════════════════════════════

function generateSchedule() {
  const n = PEOPLE.length;
  const w = WEEKS_PER_MONTH;
  const c = CHORES.length;

  // Determine rest schedule: 7 people, 5 weeks → 3 rest slots
  // We want each person to rest roughly equally over time.
  // 5 weeks, 1 resting per week. With carry-over, track total rests.
  // Pick 3 people who have rested least (with tie-breaking by unhappiness)

  let totalRests = {};
  PEOPLE.forEach(p => totalRests[p.name] = 0);
  monthHistory.forEach(month => {
    month.forEach(week => {
      if (week.resting) totalRests[week.resting]++;
    });
  });

  // Sort people by rest count (ascending), then by cumulative happiness (ascending = least happy rests first as a treat)
  let restCandidates = [...PEOPLE].sort((a, b) => {
    let diff = totalRests[a.name] - totalRests[b.name];
    if (diff !== 0) return diff;
    return cumulativeHappiness[a.name] - cumulativeHappiness[b.name];
  });

  let restingPerWeek = restCandidates.slice(0, w).map(p => p.name);
  // Shuffle to vary which week they rest
  for (let i = restingPerWeek.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [restingPerWeek[i], restingPerWeek[j]] = [restingPerWeek[j], restingPerWeek[i]];
  }

  let schedule = [];

  for (let week = 0; week < w; week++) {
    const restPerson = restingPerWeek[week];
    const activePeople = [...PEOPLE.filter(p => p.name !== restPerson)].sort(() => Math.random() - 0.5);

    // Assign the chores to the active people
    const assignment = optimizeAssignment(activePeople, week, schedule);

    schedule.push({
      resting: restPerson,
      assignments: assignment // { personName: choreId }
    });
  }

  return schedule;
}

function permute(arr) {
  if (arr.length <= 1) return [arr];
  const result = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permute(rest)) {
      result.push([arr[i], ...p]);
    }
  }
  return result;
}

function optimizeAssignment(activePeople, weekIndex, previousWeeks) {
  const choreIds = CHORES.map(c => c.id);
  let bestAssignment = null;
  let bestScore = -Infinity;

  // Only consider the last 5 weeks for variation penalties
  const recentWeeks = previousWeeks.slice(-5);

  // Compute average cumulative happiness to know who's behind
  const avgCumulative = PEOPLE.reduce((s, p) => s + cumulativeHappiness[p.name], 0) / PEOPLE.length;

  // Enumerate all 6! = 720 permutations to find the optimal assignment
  const permutations = permute(choreIds);

  for (const perm of permutations) {
    let assignment = {};
    let personScores = [];
    let totalScore = 0;

    for (let i = 0; i < activePeople.length; i++) {
      const person = activePeople[i];
      const chore = perm[i];
      assignment[person.name] = chore;

      // Base happiness score
      let s = choreScore(person, chore);

      // Harmonization bonus: people below average cumulative happiness get a boost for liked chores
      const deficit = avgCumulative - cumulativeHappiness[person.name];
      if (deficit > 0) {
        s += deficit * 0.8 * (person.likes.includes(chore) ? 1 : 0);
        // Also penalize disliked chores harder for unhappy people
        s += deficit * 0.4 * (person.dislikes.includes(chore) ? -1 : 0);
      }

      // Variation penalty: if person had the same chore twice in a row, penalize
      if (recentWeeks.length > 1) {
        const previousToLastWeek = recentWeeks[recentWeeks.length - 2];
        const lastWeek = recentWeeks[recentWeeks.length - 1];
        if (previousToLastWeek.assignments[person.name] === chore &&
            lastWeek.assignments[person.name] === chore) {
          s -= 2;
        }
      }

      // Variation penalty: if person had the same chore at least 2 times this month, penalize
      const sameChoreCount = recentWeeks.filter(pw => pw.assignments[person.name] === chore).length;
      if (sameChoreCount >= 2) {
        s -= 2;
      }

      // Variation penalty: if person had the same chore at least 3 times this month, penalize even more
      if (sameChoreCount >= 3) {
        s -= 2;
      }

      personScores.push(s);
      totalScore += s;
    }

    // Fairness penalty: penalize variance in per-person scores within this week
    // This encourages equal happiness across people in any given week
    const meanScore = totalScore / personScores.length;
    const variance = personScores.reduce((sum, ps) => sum + (ps - meanScore) ** 2, 0) / personScores.length;
    const fairnessAdjustedScore = totalScore - variance * 1.5;

    if (fairnessAdjustedScore > bestScore) {
      bestScore = fairnessAdjustedScore;
      bestAssignment = { ...assignment };
    }
  }

  return bestAssignment;
}

// ═══════════════════════════════════════════════════════════
// COMPUTE HAPPINESS
// ═══════════════════════════════════════════════════════════

function computeHappiness(schedule) {
  let results = {};
  PEOPLE.forEach(p => {
    results[p.name] = { totalScore: 0, weeks: [], restWeek: null };
  });

  schedule.forEach((week, wi) => {
    results[week.resting].restWeek = wi;
    results[week.resting].weeks.push({ week: wi, chore: null, score: 0, rest: true });

    for (let [personName, choreId] of Object.entries(week.assignments)) {
      const person = PEOPLE.find(p => p.name === personName);
      const score = choreScore(person, choreId);
      results[personName].totalScore += score;
      results[personName].weeks.push({ week: wi, chore: choreId, score, rest: false });
    }
  });

  return results;
}

function updateCarryOver(happiness) {
  PEOPLE.forEach(p => {
    const h = happiness[p.name];
    const activeWeeks = h.weeks.filter(w => !w.rest);
    const monthScore = activeWeeks.reduce((s, w) => s + w.score, 0);
    // Accumulate total happiness across all months
    cumulativeHappiness[p.name] += monthScore;
  });
}

// ═══════════════════════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════════════════════

function renderPeopleGrid() {
  const grid = document.getElementById('people-grid');
  grid.innerHTML = PEOPLE.map((p, i) => `
    <div class="person-card" style="animation-delay: ${i * 0.05}s">
      <div class="person-name">
        <div class="person-avatar" style="background: ${p.color}">${p.name[0]} ${p.name[1]}</div>
        ${p.name}
      </div>
      <div class="prefs">
        <div class="pref-section pref-loves">
          <span class="pref-label"><i data-lucide="heart"></i> Likes</span>
          <div class="pref-chips">
            ${p.likes.map(l => { const ch = CHORES.find(c => c.id === l); return `<span class="pref-chip pref-chip--like"><i data-lucide="${ch.icon}"></i> ${ch.name}</span>`; }).join('')}
          </div>
        </div>
        ${p.dislikes.length ? `
        <div class="pref-section pref-hates">
          <span class="pref-label"><i data-lucide="x"></i> Dislikes</span>
          <div class="pref-chips">
            ${p.dislikes.map(d => { const ch = CHORES.find(c => c.id === d); return `<span class="pref-chip pref-chip--dislike"><i data-lucide="${ch.icon}"></i> ${ch.name}</span>`; }).join('')}
          </div>
        </div>` : ''}
      </div>
    </div>
  `).join('');
  lucide.createIcons();
}

function renderSchedule(schedule, monthIndex) {
  const section = document.getElementById('schedule-section');
  section.style.display = '';
  document.getElementById('schedule-title').innerHTML = `<i data-lucide="calendar-days"></i> Month ${monthIndex + 1} Schedule`;

  const happiness = computeHappiness(schedule);
  const container = document.getElementById('schedule-container');

  let rows = PEOPLE.map(p => {
    let cells = `<td class="person-col">
      <div style="display: flex;gap: .5rem;align-items: center; ">
      <div class="person-avatar" style="background: ${p.color}">${p.name[0]} ${p.name[1]}</div>
      ${p.name}
      </div>
    </td>`;

    for (let w = 0; w < WEEKS_PER_MONTH; w++) {
      const week = schedule[w];
      if (week.resting === p.name) {
        cells += `<td><span class="rest-badge"><i data-lucide="moon"></i> Rest</span></td>`;
      } else {
        const choreId = week.assignments[p.name];
        const chore = CHORES.find(c => c.id === choreId);
        const score = choreScore(p, choreId);
        const color = happinessColor(score);
        cells += `<td>
          <div class="chore-cell" style="color: ${color}">
            <i data-lucide="${chore.icon}"></i> ${chore.name}
          </div>
        </td>`;
      }
    }
    return `<tr>${cells}</tr>`;
  }).join('');

  container.innerHTML = `
    <table class="schedule-table">
      <thead>
        <tr>
          <th>Person</th>
          ${Array.from({length: WEEKS_PER_MONTH}, (_, i) => `<th>Week ${i + 1}</th>`).join('')}
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  lucide.createIcons();
  renderHappiness(happiness, monthIndex);
}

function renderHappiness(happiness, monthIndex) {
  const section = document.getElementById('happiness-section');
  section.style.display = '';
  const grid = document.getElementById('happiness-grid');

  grid.innerHTML = PEOPLE.map((p, i) => {
    const h = happiness[p.name];
    const activeWeeks = h.weeks.filter(w => !w.rest);
    const maxPossible = activeWeeks.length * 2;
    const pct = maxPossible > 0 ? Math.max(0, ((h.totalScore + maxPossible) / (maxPossible * 2)) * 100) : 50;
    const avgCum = PEOPLE.reduce((s, pp) => s + cumulativeHappiness[pp.name], 0) / PEOPLE.length;
    const deficit = avgCum - cumulativeHappiness[p.name];

    const taskItems = activeWeeks.map(w => {
      const ch = CHORES.find(c => c.id === w.chore);
      const color = happinessColor(w.score);
      const scoreLabel = w.score > 0 ? `+${w.score}` : `${w.score}`;
      return `
        <div class="happiness-task" style="color: ${color}">
          <i data-lucide="${ch.icon}"></i>
          <span class="happiness-task-name">${ch.name}</span>
          <span class="happiness-task-score">${scoreLabel}</span>
        </div>`;
    }).join('');

    const showCumulative = monthHistory.length > 1;

    return `
      <div class="happiness-card" style="animation-delay: ${i * 0.05}s">
        <div class="happiness-header">
          <span class="happiness-name">
            <div class="person-avatar" style="background: ${p.color}">${p.name[0]} ${p.name[1]}</div>
            ${p.name}
          </span>
          <span class="happiness-score" style="color:${happinessColor(h.totalScore / Math.max(1, activeWeeks.length))}">${h.totalScore > 0 ? '+' : ''}${h.totalScore}</span>
        </div>
        <div class="happiness-bar-bg">
          <div class="happiness-bar" style="width:${pct}%; background:${happinessColor(h.totalScore / Math.max(1, activeWeeks.length))}"></div>
        </div>
        <div class="happiness-tasks">${taskItems}</div>
       <div style="flex-grow:1"></div> 
        <div class="happiness-cumulative">
         ${showCumulative ? `
            <i data-lucide="bar-chart-3"></i> Cumulative: ${cumulativeHappiness[p.name] > 0 ? '+' : ''}${cumulativeHappiness[p.name]}`
          : ''}
          ${deficit > 0.5 ? `<span class="happiness-priority"><i data-lucide="zap"></i> Priority next month</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
  lucide.createIcons();
}

function renderCarryOverInfo() {
  const el = document.getElementById('carry-over');
  if (monthHistory.length === 0) {
    el.innerHTML = '';
    return;
  }

  const avgCum = PEOPLE.reduce((s, p) => s + cumulativeHappiness[p.name], 0) / PEOPLE.length;
  const behind = PEOPLE
    .filter(p => cumulativeHappiness[p.name] < avgCum - 0.5)
    .sort((a, b) => cumulativeHappiness[a.name] - cumulativeHappiness[b.name]);

  if (behind.length === 0) {
    el.innerHTML = `
      <div class="carry-over-info">
        <i data-lucide="circle-check"></i> <strong>Happiness is well balanced</strong> — everyone is within range of the average cumulative score (${avgCum.toFixed(1)}).
      </div>
    `;
    lucide.createIcons();
    return;
  }

  const items = behind
    .map(p => `<strong style="color:${p.color}">${p.name}</strong> (${cumulativeHappiness[p.name]})`)
    .join(', ');

  el.innerHTML = `
    <div class="carry-over-info">
        <strong>Priority for next month:</strong> ${items} — below average happiness (${avgCum.toFixed(1)}), will be prioritized for their favorite chores.
    </div>
  `;
  lucide.createIcons();
}

function renderMonthTabs() {
  if (monthHistory.length === 0) {
    document.getElementById('history-section').style.display = 'none';
    return;
  }
  document.getElementById('history-section').style.display = '';
  const tabs = document.getElementById('month-tabs');
  tabs.innerHTML = monthHistory.map((_, i) => `
    <button class="month-tab ${i === monthHistory.length - 1 ? 'active' : ''}"
            onclick="viewMonth(${i})">
      Month ${i + 1}
    </button>
  `).join('');
}

function viewMonth(index) {
  document.querySelectorAll('.month-tab').forEach((t, i) => {
    t.classList.toggle('active', i === index);
  });
  renderSchedule(monthHistory[index], index);
}

// ═══════════════════════════════════════════════════════════
// ACTIONS
// ═══════════════════════════════════════════════════════════

function generateNextMonth() {
  const schedule = generateSchedule();
  monthHistory.push(schedule);
  const happiness = computeHappiness(schedule);
  updateCarryOver(happiness);

  renderSchedule(schedule, monthHistory.length - 1);
  renderMonthTabs();
  renderCarryOverInfo();
  updateExportButton();

  document.getElementById('schedule-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetAll() {
  monthHistory = [];
  PEOPLE.forEach(p => cumulativeHappiness[p.name] = 0);
  document.getElementById('schedule-section').style.display = 'none';
  document.getElementById('happiness-section').style.display = 'none';
  document.getElementById('history-section').style.display = 'none';
  document.getElementById('carry-over').innerHTML = '';
  renderMonthTabs();
  updateExportButton();
}

function updateExportButton() {
  document.getElementById('btn-export').style.display = monthHistory.length > 0 ? '' : 'none';
}

// ═══════════════════════════════════════════════════════════
// CSV EXPORT / IMPORT
// ═══════════════════════════════════════════════════════════

function exportCSV() {
  if (monthHistory.length === 0) return;
  const names = PEOPLE.map(p => p.name);
  const header = ['Month', 'Week', ...names].join(',');
  const rows = [];
  monthHistory.forEach((schedule, mi) => {
    schedule.forEach((week, wi) => {
      const cells = names.map(name => {
        if (week.resting === name) return 'REST';
        return week.assignments[name] || '';
      });
      rows.push([mi + 1, wi + 1, ...cells].join(','));
    });
  });
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `kollektiv-chores-schedules.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function importCSV(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    const lines = e.target.result.trim().split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length < 2) return alert('CSV must have a header row and at least one data row.');

    const headerCols = lines[0].split(',').map(s => s.trim());
    const names = headerCols.slice(2); // skip Month and Week columns

    // Validate person names
    const knownNames = PEOPLE.map(p => p.name);
    const unknown = names.filter(n => !knownNames.includes(n));
    if (unknown.length) return alert('Unknown people in CSV: ' + unknown.join(', '));

    // Group rows by month
    const monthsMap = {};
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(s => s.trim());
      const monthNum = cols[0];
      let resting = null;
      const assignments = {};
      for (let j = 0; j < names.length; j++) {
        const val = cols[j + 2]; // offset by 2 (Month, Week)
        if (!val) continue;
        if (val.toUpperCase() === 'REST') {
          resting = names[j];
        } else {
          if (!CHORES.find(c => c.id === val)) return alert(`Unknown chore "${val}" on row ${i + 1}.`);
          assignments[names[j]] = val;
        }
      }
      if (!monthsMap[monthNum]) monthsMap[monthNum] = [];
      monthsMap[monthNum].push({ resting, assignments });
    }

    // Reset state and replay all months
    monthHistory = [];
    PEOPLE.forEach(p => cumulativeHappiness[p.name] = 0);

    const monthKeys = Object.keys(monthsMap).sort((a, b) => Number(a) - Number(b));
    monthKeys.forEach(key => {
      const schedule = monthsMap[key];
      monthHistory.push(schedule);
      const happiness = computeHappiness(schedule);
      updateCarryOver(happiness);
    });

    // Render the last month
    renderSchedule(monthHistory[monthHistory.length - 1], monthHistory.length - 1);
    renderMonthTabs();
    renderCarryOverInfo();
    updateExportButton();
    document.getElementById('schedule-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  reader.readAsText(file);
  event.target.value = '';
}

// Init
renderPeopleGrid();
lucide.createIcons();