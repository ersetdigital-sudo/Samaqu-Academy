import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { buildSnapshot, normalizeContent } from '../lib/data/legacy-normalize';

const root = process.cwd();
const html = fs.readFileSync(path.join(root, 'legacy/index.html'), 'utf8');
const inline = html.match(/<script>\n([\s\S]*?)<\/script>/)?.[1];
if (!inline) throw new Error('Inline script not found in legacy/index.html');

function sliceBetween(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  if (from < 0 || to < 0) throw new Error(`Cannot slice block: ${start}`);
  return source.slice(from, to);
}

const stateMarker = inline.indexOf('   STATE & UTIL');
if (stateMarker < 0) throw new Error('STATE & UTIL marker not found');

const base = inline.slice(0, inline.lastIndexOf('/* =========================================================', stateMarker));
const seedBlock = sliceBetween(
  inline,
  '/* --- Seed data (contoh, bisa diedit/dihapus) --- */',
  '/* --- Load / save --- */',
);
const productBlock = sliceBetween(inline, '/* --- Data dummy awal', 'const PKEY=');
const flowBlock = sliceBetween(inline, "const FLOW_SEED=[", "dbReg('flow'");
const guideBlock = sliceBetween(inline, "const GUIDE_SEED=[", "dbReg('guide'");
const problemBlock = sliceBetween(inline, 'const PGROUPS=', "dbReg('problem'");
const scenarioExtraBlock = sliceBetween(inline, 'const SCN_EXTRA=', "dbReg('scenario'");
const materialMetaBlock = inline.match(/const MCAT=[\s\S]*?const MAT_OBJ=\{[^\n]*\};/)?.[0];
const quizCategoryBlock = inline.match(/const QCAT_SEED=\[[^\n]*\];/)?.[0];
if (!materialMetaBlock || !quizCategoryBlock) throw new Error('Cannot extract material/quiz metadata');

const code = `
const window = {
  localStorage: {
    _v: {},
    getItem(k) { return this._v[k] ?? null; },
    setItem(k, v) { this._v[k] = String(v); },
    removeItem(k) { delete this._v[k]; }
  }
};
${base}
${seedBlock}
${productBlock}
${flowBlock}
${guideBlock}
${problemBlock}
${scenarioExtraBlock}
${materialMetaBlock}
${quizCategoryBlock}
globalThis.__data = {
  MATERIALS, SCRIPTS, BEFORE_AFTER, SCENARIOS, QUIZ, HISTORY,
  seedScripts, SEED_CASES, SEED_BA, SEED, FLOW_SEED, GUIDE_SEED, PROBLEM_SEED,
  SCN_EXTRA, MAT_OBJ, QCAT_SEED
};
`;

const sandbox: Record<string, unknown> = { console };
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'legacy-index.js' });
const data = sandbox.__data as any;

const now = Date.now();
const materials = data.MATERIALS.map((material: any) => ({
  ...material,
  id: `mat_${material.id}`,
  objectives: data.MAT_OBJ[material.id] || [],
  sample: true,
  updated: now,
}));

const scripts = data.seedScripts();
const cases = data.SEED_CASES;
const beforeAfter = data.SEED_BA;
const flow = data.FLOW_SEED.map((stage: any) => ({
  ...stage,
  id: `flow_${stage.no}`,
  sample: true,
  updated: now,
}));
const guides = data.GUIDE_SEED.map((guide: any) => ({
  ...guide,
  id: `gd_${guide.no}`,
  sample: true,
  updated: now,
}));
const problems = data.PROBLEM_SEED;
const scenarios = data.SCENARIOS.map((scenario: any) => {
  const extra = data.SCN_EXTRA[scenario.id] || ['Greeting & Opening', '', '', ''];
  return {
    id: `scn_${scenario.id}`,
    title: scenario.t,
    cat: extra[0],
    lvl: scenario.lvl,
    situation: extra[1],
    objective: extra[2],
    msgs: scenario.msgs,
    material: extra[3],
    sample: true,
    updated: now,
  };
});
const quiz = data.QUIZ.map((question: any, index: number) => ({
  id: `q_seed${index}`,
  type: question.type,
  cat: data.QCAT_SEED[index] || 'Customer Service Fundamentals',
  q: question.q,
  options: question.o,
  correct: question.c + 1,
  ex: question.ex,
  sample: true,
  updated: now,
}));

const progress: Record<string, any> = { mat: {}, guide: {}, prob: {}, flow: {} };
data.MATERIALS.forEach((material: any) => {
  if (material.status !== 'todo') {
    progress.mat[`mat_${material.id}`] = {
      status: material.status,
      progress: material.progress,
      at: now,
    };
  }
});

const activity = data.HISTORY.map((item: any, index: number) => ({
  id: `h_seed${index}`,
  type: /Reviewer/.test(item.s) ? 'review' : 'scenario',
  title: item.s,
  score: item.score,
  at: now - (index + 2) * 864e5,
  sample: true,
}));

const content = normalizeContent({
  materials,
  scripts,
  cases,
  beforeAfter,
  flow,
  guides,
  problems,
  scenarios,
  quiz,
  products: data.SEED,
});

const snapshot = buildSnapshot(content, {
  activity,
  attempts: [],
  settings: { pass: 75 },
  progress,
});

const outputPath = path.join(root, 'lib/data/seed/legacy-seed.json');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(snapshot, null, 2));

console.log('Seed written:', outputPath);
console.log(
  Object.fromEntries(
    Object.entries(content).map(([key, items]) => [key, items.length]),
  ),
  'activity:',
  snapshot.activity.length,
);
