(() => {
  const bank = window.QUESTION_BANK || [];
  const sectionOrder = ['core', 'type1', 'type2', 'type3'];
  const sectionMeta = { core: ['Core', 'Fundamentals & regulations'], type1: ['Type I', 'Small appliances'], type2: ['Type II', 'High-pressure systems'], type3: ['Type III', 'Low-pressure systems'] };
  const storageKey = 'epa608-practice-exam-v1';
  const $ = id => document.getElementById(id);
  let state = null;
  let timerHandle = null;
  let reviewAll = false;

  function shuffle(items) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
    return result;
  }

  function prepareChoices(question, shouldShuffle) {
    const choices = question.choices.map((text, originalIndex) => ({ text, originalIndex }));
    if (!shouldShuffle) return choices;

    const sourceText = [question.question, question.correctAnswer, ...question.choices].join(' | ');
    const letterReference = /(?:both|either|neither)\s*\(?[A-H]\)?\s*(?:and|or|&)\s*\(?[A-H]\)?/i;
    const letterList = /(?:^|\|)\s*\(?[A-H]\)?(?:\s*(?:,|and|or|&)\s*\(?[A-H]\)?)+\s*(?:\||$)/i;
    const positionReference = /(?:all|none|both|neither)\s+of\s*(?:the\s*)?(?:above|below)|(?:first|second|third|fourth|last|previous|preceding|following)\s+(?:answer|choice|option|two|three)/i;

    // If wording depends on the original letters or positions, preserve every
    // choice exactly as authored so references such as "Both A and C" remain true.
    if (letterReference.test(sourceText) || letterList.test(sourceText) || positionReference.test(sourceText)) return choices;

    // Position-independent aggregate choices remain meaningful after a shuffle,
    // but conventionally belong at the bottom of the list.
    const aggregate = /^(?:all|none|both|neither)\s+of\s+(?:these|the following)\b/i;
    const regularChoices = choices.filter(choice => !aggregate.test(choice.text));
    const aggregateChoices = choices.filter(choice => aggregate.test(choice.text));
    return [...shuffle(regularChoices), ...aggregateChoices];
  }

  function save() { if (state) localStorage.setItem(storageKey, JSON.stringify(state)); }
  function savedState() { try { return JSON.parse(localStorage.getItem(storageKey)); } catch { return null; } }
  function show(view) { ['setup-view', 'exam-view', 'results-view'].forEach(id => $(id).hidden = id !== view); $('header-actions').hidden = view !== 'exam-view'; window.scrollTo(0, 0); }

  function renderSetup() {
    const counts = Object.fromEntries(sectionOrder.map(key => [key, bank.filter(q => q.section === key).length]));
    $('section-options').innerHTML = sectionOrder.map((key, index) => {
      const [label, subtitle] = sectionMeta[key];
      return `<label class="section-option"><input type="checkbox" name="section" value="${key}" ${index === 0 ? 'checked' : ''}><span class="section-check">✓</span><span class="section-number">${String(index).padStart(2, '0')}</span><span class="section-copy"><strong>${label}</strong><small>${subtitle}</small></span><span class="question-total">${counts[key]}<small>questions</small></span></label>`;
    }).join('');
    const saved = savedState();
    $('resume-btn').hidden = !(saved && saved.status === 'active' && saved.questions?.length);
  }

  function startExam(event) {
    event.preventDefault();
    const sections = [...document.querySelectorAll('input[name="section"]:checked')].map(input => input.value);
    if (!sections.length) { $('setup-error').textContent = 'Choose at least one section to begin.'; return; }
    const count = $('question-count').value;
    const shouldShuffle = $('shuffle-questions').checked;
    const questions = sections.flatMap(section => {
      let pool = bank.filter(q => q.section === section);
      if (shouldShuffle) pool = shuffle(pool);
      if (count !== 'all') pool = pool.slice(0, Number(count));
      return pool.map(question => ({ ...question, choices: prepareChoices(question, shouldShuffle) }));
    });
    state = { status: 'active', questions, answers: {}, current: 0, elapsed: 0, runningSince: Date.now(), paused: false };
    save(); enterExam();
  }

  function enterExam() {
    state.paused = false; state.runningSince = Date.now(); save(); show('exam-view'); renderQuestion(); startTimer();
  }

  function startTimer() { clearInterval(timerHandle); updateTimer(); timerHandle = setInterval(updateTimer, 1000); }
  function updateTimer() {
    if (!state || state.paused) return;
    const seconds = state.elapsed + Math.floor((Date.now() - state.runningSince) / 1000);
    $('timer').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }
  function commitTime() { if (!state.paused) state.elapsed += Math.floor((Date.now() - state.runningSince) / 1000); state.runningSince = Date.now(); }

  function answerFor(question) { return state.answers[question.id] || []; }
  function renderQuestion() {
    const question = state.questions[state.current];
    const selected = answerFor(question);
    const multi = question.correct.length > 1 || /select all/i.test(question.question);
    $('section-badge').textContent = question.sectionLabel;
    $('question-number').textContent = `Question ${state.current + 1}`;
    $('question-text').textContent = question.question;
    $('select-hint').hidden = !multi;
    $('answer-options').innerHTML = question.choices.map((choice, index) => `<label class="answer-option ${selected.includes(choice.originalIndex) ? 'selected' : ''}"><input type="${multi ? 'checkbox' : 'radio'}" name="answer" value="${choice.originalIndex}" ${selected.includes(choice.originalIndex) ? 'checked' : ''}><span class="choice-letter">${String.fromCharCode(65 + index)}</span><span>${escapeHtml(choice.text)}</span><span class="choice-indicator"></span></label>`).join('');
    document.querySelectorAll('input[name="answer"]').forEach(input => input.addEventListener('change', handleAnswer));
    $('previous-btn').disabled = state.current === 0;
    const last = state.current === state.questions.length - 1;
    $('next-btn').hidden = last; $('submit-btn').hidden = !last;
    updateProgress(); renderSectionNav();
  }

  function handleAnswer(event) {
    const question = state.questions[state.current];
    if (event.target.type === 'radio') state.answers[question.id] = [Number(event.target.value)];
    else state.answers[question.id] = [...document.querySelectorAll('input[name="answer"]:checked')].map(input => Number(input.value));
    save(); renderQuestion();
  }

  function updateProgress() {
    const answered = Object.values(state.answers).filter(a => a.length).length;
    const percent = Math.round(((state.current + 1) / state.questions.length) * 100);
    $('progress-label').textContent = `Question ${state.current + 1} of ${state.questions.length}`;
    $('progress-percent').textContent = `${percent}%`; $('progress-bar').style.width = `${percent}%`;
    $('submit-btn').textContent = answered === state.questions.length ? 'Submit exam' : `Submit exam (${state.questions.length - answered} blank)`;
  }

  function renderSectionNav() {
    const groups = sectionOrder.map(key => [key, state.questions.map((q, i) => q.section === key ? i : -1).filter(i => i >= 0)]).filter(([, indexes]) => indexes.length);
    $('section-nav').innerHTML = groups.map(([key, indexes]) => `<div class="nav-group"><button type="button" class="nav-title" data-index="${indexes[0]}"><span>${sectionMeta[key][0]}</span><small>${indexes.filter(i => answerFor(state.questions[i]).length).length}/${indexes.length}</small></button><div class="question-grid">${indexes.map(i => `<button type="button" data-index="${i}" class="${i === state.current ? 'current' : ''} ${answerFor(state.questions[i]).length ? 'answered' : ''}" aria-label="Go to question ${i + 1}">${i + 1}</button>`).join('')}</div></div>`).join('');
    document.querySelectorAll('[data-index]').forEach(button => button.addEventListener('click', () => { state.current = Number(button.dataset.index); save(); renderQuestion(); window.scrollTo(0, 0); }));
  }

  function move(amount) { state.current += amount; save(); renderQuestion(); window.scrollTo(0, 0); }
  function pause() { commitTime(); state.paused = true; save(); clearInterval(timerHandle); $('pause-overlay').hidden = false; }
  function resume() { state.paused = false; state.runningSince = Date.now(); save(); $('pause-overlay').hidden = true; startTimer(); }

  function promptSubmit() {
    const unanswered = state.questions.filter(q => !answerFor(q).length).length;
    $('submit-message').textContent = unanswered ? `${unanswered} question${unanswered === 1 ? ' is' : 's are'} unanswered. Blank answers will be marked incorrect.` : 'Every question has an answer. Once submitted, your score and explanations will be revealed.';
    $('submit-overlay').hidden = false;
  }

  function isCorrect(question) {
    const answer = [...answerFor(question)].sort((a, b) => a - b);
    const correct = [...question.correct].sort((a, b) => a - b);
    return answer.length === correct.length && answer.every((value, index) => value === correct[index]);
  }

  function submitExam() {
    commitTime(); clearInterval(timerHandle); state.status = 'complete'; state.paused = true; save(); $('submit-overlay').hidden = true; renderResults();
  }

  function renderResults() {
    show('results-view');
    const correct = state.questions.filter(isCorrect).length;
    const percent = Math.round(correct / state.questions.length * 100);
    $('score-percent').textContent = `${percent}%`; $('score-ring').style.setProperty('--score', `${percent * 3.6}deg`);
    $('result-title').textContent = percent >= 70 ? 'Strong work.' : 'Keep building your knowledge.';
    $('result-summary').textContent = `You answered ${correct} of ${state.questions.length} questions correctly in ${Math.floor(state.elapsed / 60)}m ${state.elapsed % 60}s.`;
    $('section-results').innerHTML = sectionOrder.map(key => {
      const questions = state.questions.filter(q => q.section === key); if (!questions.length) return '';
      const right = questions.filter(isCorrect).length; const score = Math.round(right / questions.length * 100);
      return `<div><span>${sectionMeta[key][0]}</span><strong>${score}%</strong><small>${right} / ${questions.length} correct</small></div>`;
    }).join('');
    renderReview();
  }

  function renderReview() {
    const wrong = state.questions.filter(q => !isCorrect(q));
    const questions = reviewAll ? state.questions : wrong;
    $('review-title').textContent = reviewAll ? 'All questions and answers' : 'Questions to revisit';
    $('wrong-count').textContent = `${wrong.length} incorrect`;
    $('review-all-btn').textContent = reviewAll ? 'Show incorrect only' : 'Show all answers';
    $('review-list').innerHTML = questions.length ? questions.map((q, i) => {
      const answer = answerFor(q); const correct = isCorrect(q);
      return `<article class="review-card ${correct ? 'correct' : 'incorrect'}"><div class="review-meta"><span>${q.sectionLabel}</span><span>${correct ? '✓ Correct' : '× Incorrect'}</span></div><h3>${escapeHtml(q.question)}</h3><div class="review-answer"><small>Your answer</small><p>${answer.length ? q.choices.filter(c => answer.includes(c.originalIndex)).map(c => escapeHtml(c.text)).join('; ') : 'No answer selected'}</p></div>${!correct ? `<div class="review-answer correct-answer"><small>Correct answer</small><p>${q.choices.filter(c => q.correct.includes(c.originalIndex)).map(c => escapeHtml(c.text)).join('; ') || escapeHtml(q.correctAnswer)}</p></div>` : ''}<div class="explanation"><strong>Why this is correct</strong><p>${escapeHtml(q.explanation)}</p></div></article>`;
    }).join('') : '<div class="perfect-score"><span>✓</span><h3>Perfect score!</h3><p>You answered every question correctly.</p></div>';
  }

  function escapeHtml(value = '') { const div = document.createElement('div'); div.textContent = value; return div.innerHTML; }

  $('setup-form').addEventListener('submit', startExam);
  $('toggle-all').addEventListener('click', () => { const boxes = [...document.querySelectorAll('input[name="section"]')]; const all = boxes.every(b => b.checked); boxes.forEach(b => b.checked = !all); $('toggle-all').textContent = all ? 'Select all' : 'Clear all'; });
  $('resume-btn').addEventListener('click', () => { state = savedState(); enterExam(); });
  $('previous-btn').addEventListener('click', () => move(-1)); $('next-btn').addEventListener('click', () => move(1));
  $('pause-btn').addEventListener('click', pause); $('resume-overlay-btn').addEventListener('click', resume);
  $('exit-test-btn').addEventListener('click', () => { $('pause-overlay').hidden = true; show('setup-view'); renderSetup(); });
  $('submit-btn').addEventListener('click', promptSubmit); $('cancel-submit-btn').addEventListener('click', () => $('submit-overlay').hidden = true); $('confirm-submit-btn').addEventListener('click', submitExam);
  $('retry-btn').addEventListener('click', () => { localStorage.removeItem(storageKey); state = null; reviewAll = false; renderSetup(); show('setup-view'); });
  $('review-all-btn').addEventListener('click', () => { reviewAll = !reviewAll; renderReview(); });
  renderSetup();
})();
