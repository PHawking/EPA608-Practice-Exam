const fs = require('fs');
const path = require('path');

const sources = [
  ['core', 'Core', 'EPA608_Core_Questions.md'],
  ['type1', 'Type I', 'EPA608_Type1_Questions.md'],
  ['type2', 'Type II', 'EPA608_Type2_Questions.md'],
  ['type3', 'Type III', 'EPA608_TYPE3_Questions.md'],
  ['newset', 'New Question Set', 'EPA608_New_Questions_For_Validation.md']
];

function clean(value = '') {
  return value.replace(/\r/g, '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
}

function field(block, name, nextNames) {
  const start = new RegExp(`\\*\\*${name}\\*\\*`, 'i').exec(block);
  if (!start) return '';
  const rest = block.slice(start.index + start[0].length);
  let end = rest.length;
  for (const next of nextNames) {
    const match = new RegExp(`\\*\\*${next}\\*\\*`, 'i').exec(rest);
    if (match && match.index < end) end = match.index;
  }
  return rest.slice(0, end).trim();
}

function parseChoices(raw) {
  const lines = raw.replace(/\r/g, '').split('\n');
  const choices = [];
  let current = '';
  for (const line of lines) {
    const match = line.trim().match(/^([A-H])[.)]\s*(.+)$/i);
    if (match) {
      if (current) choices.push(clean(current));
      current = match[2];
    } else if (current && line.trim()) current += ` ${line.trim()}`;
  }
  if (current) choices.push(clean(current));
  return choices;
}

function normalized(value) {
  return clean(value).toLowerCase().replace(/^[a-h][.)]\s*/, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function correctIndexes(answer, choices, question = '') {
  const answerNorm = normalized(answer);
  const letterOnly = clean(answer).match(/^([A-H](?:\s*(?:,|and|&)\s*[A-H])*)$/i);
  if (letterOnly) return [...clean(answer).matchAll(/[A-H]/gi)].map(m => m[0].toUpperCase().charCodeAt(0) - 65).filter(i => i < choices.length);
  const exactIndex = choices.findIndex(choice => normalized(choice) === answerNorm);
  if (exactIndex >= 0) return [exactIndex];

  // Match a sequence of complete choices against the complete answer. This
  // supports choices that contain their own commas while preventing partial
  // matches such as "3,000" inside "300,000" or "A2" inside "A2L".
  const choiceValues = choices.map(normalized);
  function matchChoiceSequence(remaining, used = []) {
    if (!remaining) return used;
    for (let index = 0; index < choiceValues.length; index++) {
      if (used.includes(index)) continue;
      const value = choiceValues[index];
      if (remaining === value) return [...used, index];
      if (remaining.startsWith(`${value} `)) {
        const matched = matchChoiceSequence(remaining.slice(value.length + 1), [...used, index]);
        if (matched) return matched;
      }
    }
    return null;
  }
  const sequence = matchChoiceSequence(answerNorm);
  if (sequence?.length > 1) return sequence;

  if (/all of these (?:are )?true/i.test(answer) && /not true/i.test(question)) {
    const noneIndex = choices.findIndex(choice => /none of these/i.test(choice));
    if (noneIndex >= 0) return [noneIndex];
  }
  const answerWords = new Set(answerNorm.split(' ').filter(word => word.length > 1));
  const scores = choices.map(choice => {
    const choiceWords = new Set(normalized(choice).split(' ').filter(word => word.length > 1));
    const shared = [...answerWords].filter(word => choiceWords.has(word)).length;
    return shared / Math.min(answerWords.size || 1, choiceWords.size || 1);
  });
  const best = Math.max(...scores);
  return best >= .7 ? [scores.indexOf(best)] : [];
}

function parseFile(key, label, filename) {
  const markdown = fs.readFileSync(path.join(__dirname, filename), 'utf8');
  return markdown.split(/^##\s+Question[^\n]*$/gmi).slice(1).map((block, index) => {
    const question = clean(field(block, 'Question', ['Answer choices', 'Correct Answer', 'Explanation']))
      .replace(/\s+PT Chart(?:\s+Temperature.*)?$/i, '')
      .trim();
    const choices = parseChoices(field(block, 'Answer choices', ['Correct Answer', 'Explanation']));
    const correctAnswer = clean(field(block, 'Correct Answer', ['Explanation']));
    const explanation = clean(field(block, 'Explanation', [])) || 'No explanation was provided in the source material.';
    return { id: `${key}-${index + 1}`, section: key, sectionLabel: label, question, choices, correctAnswer, correct: correctIndexes(correctAnswer, choices, question), explanation };
  }).filter(q => q.question && q.choices.length >= 2 && q.correctAnswer);
}

const parsedData = sources.flatMap(source => parseFile(...source));
const uniqueQuestions = [];
const duplicates = [];

function correctChoiceSignature(question) {
  return question.correct.map(index => normalized(question.choices[index] || '')).sort().join('|');
}

function choiceSignature(question) {
  return question.choices.map(normalized).sort().join('|');
}

function questionSimilarity(first, second) {
  const firstWords = new Set(normalized(first).split(' ').filter(Boolean));
  const secondWords = new Set(normalized(second).split(' ').filter(Boolean));
  const shared = [...firstWords].filter(word => secondWords.has(word)).length;
  return shared / (firstWords.size + secondWords.size - shared || 1);
}

for (const question of parsedData) {
  const exactKey = normalized(question.question);
  const duplicateIndex = uniqueQuestions.findIndex(existing => {
    if (normalized(existing.question) === exactKey) return true;
    return choiceSignature(existing) === choiceSignature(question)
      && correctChoiceSignature(existing) === correctChoiceSignature(question)
      && questionSimilarity(existing.question, question.question) >= .9;
  });
  if (duplicateIndex < 0) {
    uniqueQuestions.push(question);
    continue;
  }
  const existing = uniqueQuestions[duplicateIndex];
  if (normalized(existing.question) === exactKey
      && normalized(existing.correctAnswer) !== normalized(question.correctAnswer)
      && correctChoiceSignature(existing) !== correctChoiceSignature(question)) {
    throw new Error(`Conflicting duplicate answer keys: ${existing.id} and ${question.id}`);
  }
  const preferNew = normalized(question.question).length > normalized(existing.question).length;
  if (preferNew) uniqueQuestions[duplicateIndex] = question;
  duplicates.push({ kept: preferNew ? question.id : existing.id, removed: preferNew ? existing.id : question.id });
}
const data = uniqueQuestions;
const unresolved = data.filter(q => !q.correct.length);
if (unresolved.length) {
  console.warn(`Warning: ${unresolved.length} answers could not be matched to choices:`);
  unresolved.forEach(q => console.warn(`- ${q.id}: answer="${q.correctAnswer}" choices=${JSON.stringify(q.choices)}`));
}
fs.writeFileSync(path.join(__dirname, 'questions.js'), `window.QUESTION_BANK = ${JSON.stringify(data)};\n`);
console.log(`Built ${data.length} questions (${sources.map(([key, label]) => `${label}: ${data.filter(q => q.section === key).length}`).join(', ')}).`);
if (duplicates.length) console.log(`Removed ${duplicates.length} duplicate question entries.`);
