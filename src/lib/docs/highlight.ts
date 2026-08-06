/**
 * Lightweight syntax highlighter for docs samples (no external deps).
 * Returns safe HTML with span.tok-* tokens.
 */

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type Rule = { type: string; re: RegExp };

function tokenize(code: string, rules: Rule[]): string {
  let i = 0;
  let out = "";
  while (i < code.length) {
    let matched = false;
    for (const rule of rules) {
      rule.re.lastIndex = i;
      const m = rule.re.exec(code);
      if (!m || m.index !== i) continue;
      out += `<span class="tok-${rule.type}">${escapeHtml(m[0])}</span>`;
      i += m[0].length;
      matched = true;
      break;
    }
    if (!matched) {
      // consume plain run until next possible match
      let j = i + 1;
      let found = false;
      while (j < code.length) {
        for (const rule of rules) {
          rule.re.lastIndex = j;
          const m = rule.re.exec(code);
          if (m && m.index === j) {
            found = true;
            break;
          }
        }
        if (found) break;
        j++;
      }
      out += escapeHtml(code.slice(i, j));
      i = j;
    }
  }
  return out;
}

const bashRules: Rule[] = [
  { type: "comment", re: /#[^\n]*/g },
  { type: "string", re: /'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g },
  { type: "flag", re: /(?<=\s|^)-[A-Za-z][\w-]*/g },
  { type: "keyword", re: /\b(?:curl|wget|export|echo|cd|ls)\b/g },
  { type: "method", re: /\b(?:GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\b/g },
  { type: "url", re: /https?:\/\/[^\s"'\\]+/g },
  { type: "punct", re: /\\$/gm },
];

const jsRules: Rule[] = [
  { type: "comment", re: /\/\/[^\n]*|\/\*[\s\S]*?\*\//g },
  { type: "string", re: /`(?:\\.|[^`\\])*`|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g },
  {
    type: "keyword",
    re: /\b(?:const|let|var|await|async|return|import|from|export|function|new|if|else|try|catch|typeof|process)\b/g,
  },
  { type: "builtin", re: /\b(?:fetch|console|JSON|Promise|process)\b/g },
  { type: "number", re: /\b\d+(?:\.\d+)?\b/g },
  { type: "bool", re: /\b(?:true|false|null|undefined)\b/g },
];

const pyRules: Rule[] = [
  { type: "comment", re: /#[^\n]*/g },
  { type: "string", re: /'''[\s\S]*?'''|"""[\s\S]*?"""|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g },
  {
    type: "keyword",
    re: /\b(?:import|from|as|def|return|if|else|elif|for|in|with|try|except|class|None|True|False|print|async|await)\b/g,
  },
  { type: "builtin", re: /\b(?:requests|os|json|dict|list|str|int)\b/g },
  { type: "number", re: /\b\d+(?:\.\d+)?\b/g },
];

const goRules: Rule[] = [
  { type: "comment", re: /\/\/[^\n]*|\/\*[\s\S]*?\*\//g },
  { type: "string", re: /`[^`]*`|"(?:\\.|[^"\\])*"/g },
  {
    type: "keyword",
    re: /\b(?:package|import|func|return|if|else|for|range|var|const|type|struct|defer|go|err|nil|true|false)\b/g,
  },
  { type: "builtin", re: /\b(?:fmt|http|io|os|strings|make|append|len)\b/g },
  { type: "number", re: /\b\d+(?:\.\d+)?\b/g },
];

const jsonRules: Rule[] = [
  { type: "key", re: /"(?:\\.|[^"\\])*"\s*(?=:)/g },
  { type: "string", re: /"(?:\\.|[^"\\])*"/g },
  { type: "number", re: /-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g },
  { type: "bool", re: /\b(?:true|false|null)\b/g },
];

const rulesByLang: Record<string, Rule[]> = {
  bash: bashRules,
  shell: bashRules,
  curl: bashRules,
  javascript: jsRules,
  js: jsRules,
  typescript: jsRules,
  ts: jsRules,
  python: pyRules,
  py: pyRules,
  go: goRules,
  golang: goRules,
  json: jsonRules,
  text: [],
};

export function highlightCode(code: string, language = "text"): string {
  const rules = rulesByLang[language.toLowerCase()] ?? [];
  if (!rules.length) return escapeHtml(code);
  // Fresh regex instances per call (lastIndex safety)
  const fresh = rules.map((r) => ({ type: r.type, re: new RegExp(r.re.source, r.re.flags) }));
  return tokenize(code, fresh);
}
