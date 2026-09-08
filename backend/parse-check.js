const fs = require('fs');
const parser = require('@babel/parser');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function lineOf(text, idx) { return text.slice(0, idx).split('\n').length; }

// Every <script> block that has inline content
const re = /<script([^>]*)>([\s\S]*?)<\/script>/g;
let m, n = 0, bad = 0;
while ((m = re.exec(src)) !== null) {
  const attrs = m[1], body = m[2];
  if (!body.trim()) continue;                    // src-only tag
  n++;
  const isJsx = /text\/babel/.test(attrs);
  const startLine = lineOf(src, m.index);
  try {
    parser.parse(body, {
      sourceType: 'script',
      plugins: isJsx ? ['jsx'] : [],
      errorRecovery: false,
    });
    console.log(`  OK   block #${n} (html line ${startLine}) ${isJsx ? 'JSX' : 'plain JS'} — ${body.split('\n').length} lines`);
  } catch (e) {
    bad++;
    const rel = e.loc ? e.loc.line : 0;
    console.log(`  FAIL block #${n} (html line ${startLine}) ${isJsx ? 'JSX' : 'plain JS'}`);
    console.log(`       ${e.message}`);
    console.log(`       -> index.html line ${startLine + rel}`);
    const lines = body.split('\n');
    for (let i = Math.max(0, rel - 3); i < Math.min(lines.length, rel + 2); i++) {
      console.log(`       ${String(startLine + i + 1).padStart(5)} | ${lines[i]}`);
    }
  }
}
console.log(bad ? `\n${bad} block(s) failed to parse.` : `\nAll ${n} inline script blocks parse cleanly.`);
process.exit(bad ? 1 : 0);
