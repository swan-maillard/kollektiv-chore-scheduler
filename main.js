// ═══════════════════════════════════════════════════════════
// DATA DEFINITION — Edit chores, people, likes/dislikes here
// ═══════════════════════════════════════════════════════════

const CHORES = [
  { id: 'entrance',   name: 'Entrance',       icon: '🚪' },
  { id: 'kitchen',    name: 'Kitchen',        icon: '🍳' },
  { id: 'living',     name: 'Living Room',    icon: '🛋️' },
  { id: 'major_bath', name: 'Major Bathroom', icon: '🚿' },
  { id: 'minor_bath', name: 'Minor Bathroom', icon: '🪥' },
  { id: 'trash',      name: 'Trash',          icon: '🗑️' },
];

const PEOPLE = [
  { name: 'Ingeborg', color: '#60a5fa', likes: ['minor_bath', 'major_bath', 'trash', 'kitchen', 'entrance', 'living'], dislikes: [] },
  { name: 'Katrin',   color: '#34d399', likes: ['minor_bath', 'kitchen'],                          dislikes: ['trash'] },
  { name: 'Klara',    color: '#c084fc', likes: ['minor_bath'],                                     dislikes: [] },
  { name: 'Marie',    color: '#f472b6', likes: ['kitchen', 'major_bath', 'living'],                dislikes: ['entrance'] },
  { name: 'Moritz',   color: '#fb923c', likes: ['trash', 'major_bath'],                            dislikes: ['kitchen'] },
  { name: 'Swan',     color: '#fbbf24', likes: ['major_bath', 'trash', 'entrance'],               dislikes: [] },
  { name: 'Viviane',  color: '#f87171', likes: ['trash'],                                          dislikes: [] },
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

  // Determine rest schedule: 7 people, 4 weeks → 4 rest slots
  // We want each person to rest roughly equally over time.
  // 4 weeks, 1 resting per week. With carry-over, track total rests.
  // Pick 4 people who have rested least (with tie-breaking by unhappiness)

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
    const activePeople = PEOPLE.filter(p => p.name !== restPerson);

    // Assign 6 chores to 6 active people
    // Use Hungarian-like greedy optimization with carry-over bonus
    const assignment = optimizeAssignment(activePeople, week, schedule);

    schedule.push({
      resting: restPerson,
      assignments: assignment // { personName: choreId }
    });
  }

  return schedule;
}

function optimizeAssignment(activePeople, weekIndex, previousWeeks) {
  const choreIds = CHORES.map(c => c.id);
  let bestAssignment = null;
  let bestScore = -Infinity;

  // Compute average cumulative happiness to know who's behind
  const avgCumulative = PEOPLE.reduce((s, p) => s + cumulativeHappiness[p.name], 0) / PEOPLE.length;

  const ITERATIONS = 3000;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    let shuffled = [...choreIds];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    let assignment = {};
    let personScores = [];
    let totalScore = 0;

    for (let i = 0; i < activePeople.length; i++) {
      const person = activePeople[i];
      const chore = shuffled[i];
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

      // Variation penalty: if person had same chore in previous weeks this month, penalize
      for (let pw = 0; pw < previousWeeks.length; pw++) {
        if (previousWeeks[pw].assignments[person.name] === chore) {
          s -= 2;
        }
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
        <div class="pref-row pref-loves">
          <span class="pref-icon">♥</span>
          ${p.likes.map(l => CHORES.find(c => c.id === l).name).join(', ')}
        </div>
        <div class="pref-row pref-hates">
          <span class="pref-icon">✗</span>
          ${p.dislikes.map(d => CHORES.find(c => c.id === d).name).join(', ')}
        </div>
      </div>
    </div>
  `).join('');
}

function renderSchedule(schedule, monthIndex) {
  const section = document.getElementById('schedule-section');
  section.style.display = '';
  document.getElementById('schedule-title').textContent = `Month ${monthIndex + 1} Schedule`;

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
        cells += `<td><span class="rest-badge">💤 Rest</span></td>`;
      } else {
        const choreId = week.assignments[p.name];
        const chore = CHORES.find(c => c.id === choreId);
        const score = choreScore(p, choreId);
        const color = happinessColor(score);
        cells += `<td>
          <div class="chore-cell" style="color: ${color}">
            ${chore.icon} ${chore.name}
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

    let detail = activeWeeks.map(w => {
      const ch = CHORES.find(c => c.id === w.chore);
      return `${ch.icon} ${w.score > 0 ? '+' : ''}${w.score}`;
    }).join('  ');

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
        <div class="happiness-detail">
          ${detail}
          <br>📊 Cumulative: ${cumulativeHappiness[p.name] > 0 ? '+' : ''}${cumulativeHappiness[p.name]}
          ${deficit > 0.5 ? ` · ⚡ Priority next month` : ''}
        </div>
      </div>
    `;
  }).join('');
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
        ✅ <strong>Happiness is well balanced</strong> — everyone is within range of the average cumulative score (${avgCum.toFixed(1)}).
      </div>
    `;
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
}

// Init
renderPeopleGrid();