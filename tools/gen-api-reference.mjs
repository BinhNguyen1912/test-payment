// Generates API_REFERENCE.md from the backend SOURCE (controllers, DTOs, response types) with the TypeScript compiler API.
// Read-only on the backend: nothing under the backend repo is modified. Output goes into this project.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const BACKEND = process.env.BACKEND_REPO ?? '/Users/backendtrustwow5/trustwow-backend';
const OUT = process.env.OUT ?? path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'API_REFERENCE.md');
const ts = createRequire(path.join(BACKEND, 'package.json'))('typescript');
const MODULES = (process.env.MODULES ?? 'auth,otp,ekyc,sub-account,bank-account,pin,smart-otp,access-control,marketplace,commitment,payment,payout,finance,double-entry,membership,voucher,cart,referral,tax-report,health').split(',');

const cfgPath = path.join(BACKEND, 'tsconfig.json');
const cfg = ts.parseJsonConfigFileContent(ts.readConfigFile(cfgPath, ts.sys.readFile).config, ts.sys, BACKEND);
const files = [];
for (const m of MODULES) {
  const dir = path.join(BACKEND, 'src/modules', m);
  if (!fs.existsSync(dir)) continue;
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/controller(\.base)?\.ts$/.test(e.name) && !e.name.endsWith('.spec.ts')) files.push(p);
  });
  walk(dir);
}
const program = ts.createProgram(files, { ...cfg.options, noEmit: true, skipLibCheck: true });
const checker = program.getTypeChecker();

const decos = (node) => (ts.canHaveDecorators(node) ? ts.getDecorators(node) ?? [] : []);
const decoName = (d) => { const e = d.expression; return ts.isCallExpression(e) ? e.expression.getText() : e.getText(); };
const decoArgs = (d) => (ts.isCallExpression(d.expression) ? d.expression.arguments : []);
const strLit = (a) => (a && (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) ? a.text : a ? a.getText() : '');
const find = (node, n) => decos(node).find((d) => decoName(d) === n);
const HTTP = ['Get', 'Post', 'Put', 'Patch', 'Delete'];

const seen = new Set();
function typeDoc(type, depth, indent = '') {
  if (!type) return [];
  const checkerType = type;
  // unwrap Promise / arrays / unions with null|undefined
  let t = checkerType;
  const sym0 = t.getSymbol?.();
  if (sym0?.getName() === 'Promise') t = checker.getTypeArguments(t)[0] ?? t;
  if (t.isUnion?.()) t = t.types.find((x) => !(x.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined))) ?? t;
  let isArray = false;
  if (checker.isArrayType?.(t)) { t = checker.getTypeArguments(t)[0]; isArray = true; }
  const sym = t.getSymbol?.();
  const decl = sym?.declarations?.[0];
  const head = checker.typeToString(checkerType, undefined, ts.TypeFormatFlags.NoTruncation);
  if (!decl || !(ts.isClassDeclaration(decl) || ts.isInterfaceDeclaration(decl)) || !/src\//.test(decl.getSourceFile().fileName)) return [`${indent}- type: \`${head}\``];
  const name = sym.getName();
  if (depth > 3 || seen.has(name + depth)) return [`${indent}- \`${name}${isArray ? '[]' : ''}\` (xem ở trên)`];
  seen.add(name + depth);
  const lines = [`${indent}- **${name}${isArray ? '[]' : ''}**`];
  for (const p of t.getProperties()) {
    const pd = p.declarations?.[0];
    if (!pd) continue;
    const ptype = checker.getTypeOfSymbolAtLocation(p, pd);
    const optional = (p.flags & ts.SymbolFlags.Optional) !== 0;
    const ds = ts.canHaveDecorators(pd) ? decos(pd) : [];
    const validators = ds.map(decoName).filter((n) => !/^(ApiProperty|ApiPropertyOptional|Expose|Transform|Type|ValidateNested)$/.test(n));
    const api = ds.find((d) => /^ApiProperty(Optional)?$/.test(decoName(d)));
    const apiText = api ? decoArgs(api)[0]?.getText().replace(/\s+/g, ' ').slice(0, 140) : '';
    const tstr = checker.typeToString(ptype, undefined, ts.TypeFormatFlags.NoTruncation).slice(0, 90);
    lines.push(`${indent}  - \`${p.getName()}${optional ? '?' : ''}\`: \`${tstr}\`${validators.length ? ` — ${validators.join(', ')}` : ''}${apiText ? ` — ${apiText}` : ''}`);
    // nested DTO
    const inner = ptype.getSymbol?.()?.declarations?.[0] ?? (checker.isArrayType?.(ptype) ? checker.getTypeArguments(ptype)[0]?.getSymbol?.()?.declarations?.[0] : null);
    if (inner && ts.isClassDeclaration(inner) && /src\/.*dto|src\/.*\.(res|req)/.test(inner.getSourceFile().fileName) && depth < 2) {
      lines.push(...typeDoc(ptype, depth + 1, indent + '    '));
    }
  }
  return lines;
}

const out = [];
let total = 0;
const byModule = {};
for (const sf of program.getSourceFiles()) {
  if (!files.includes(sf.fileName)) continue;
  ts.forEachChild(sf, (node) => {
    if (!ts.isClassDeclaration(node)) return;
    const c = find(node, 'Controller');
    if (!c) return;
    const prefix = strLit(decoArgs(c)[0]);
    const clsName = node.name?.getText() ?? '(anon)';
    const classPerms = find(node, 'RequirePermissions');
    const entries = [];
    for (const m of node.members) {
      if (!ts.isMethodDeclaration(m)) continue;
      const http = decos(m).find((d) => HTTP.includes(decoName(d)));
      if (!http) continue;
      seen.clear();
      const verb = decoName(http).toUpperCase();
      const sub = strLit(decoArgs(http)[0]);
      const url = `/api/v1/${[prefix, sub].filter(Boolean).join('/')}`.replace(/\/+/g, '/');
      const flags = [];
      for (const d of decos(m)) {
        const n = decoName(d);
        if (/^(Public|RequireEkyc|RequireMembership|RequirePermissions|RateLimit|Authenticated|HttpCode|CsrfExempt|RequireSmartOtp|RequirePin|RequirePinToken|Idempotent|Audiences?)$/.test(n) || /^Require/.test(n)) {
          flags.push(`${n}${ts.isCallExpression(d.expression) && decoArgs(d).length ? `(${decoArgs(d).map((a) => a.getText().replace(/\s+/g, ' ').slice(0, 60)).join(', ')})` : ''}`);
        }
      }
      const op = find(m, 'ApiOperation');
      let summary = '';
      if (op) { const o = decoArgs(op)[0]; if (o && ts.isObjectLiteralExpression(o)) { const s = o.properties.find((p) => p.name?.getText() === 'summary'); summary = s ? (ts.isPropertyAssignment(s) ? strLit(s.initializer).replace(/\s+/g, ' ').slice(0, 200) : '') : ''; } }
      const errs = decos(m).filter((d) => decoName(d) === 'ApiResponse').map((d) => {
        const o = decoArgs(d)[0]; if (!o || !ts.isObjectLiteralExpression(o)) return null;
        const g = (k) => o.properties.find((p) => p.name?.getText() === k)?.initializer;
        return `${g('status')?.getText() ?? ''}: ${g('description') ? strLit(g('description')).replace(/\s+/g, ' ').slice(0, 220) : ''}`;
      }).filter(Boolean);
      const params = [];
      for (const p of m.parameters) {
        const d = decos(p).find((x) => /^(Body|Query|Param|Headers|Ip)$/.test(decoName(x)));
        if (!d) continue;
        const kind = decoName(d);
        const arg = strLit(decoArgs(d)[0]);
        const ptype = checker.getTypeAtLocation(p);
        params.push({ kind, arg, optional: !!p.questionToken, ptype, text: p.type?.getText() ?? '' });
      }
      const sig = checker.getSignatureFromDeclaration(m);
      const ret = sig ? checker.getReturnTypeOfSignature(sig) : null;
      const env = find(m, 'ApiEnvelopeResponse') ?? find(m, 'ApiEnvelopeCursorResponse') ?? find(m, 'ApiOkResponse');
      entries.push({ verb, url, flags, summary, errs, params, ret, env: env ? `${decoName(env)}(${decoArgs(env).map((a) => a.getText().slice(0, 60)).join(', ')})` : '', classPerms: classPerms ? `RequirePermissions(${decoArgs(classPerms).map((a) => a.getText()).join(', ')})` : '' });
    }
    if (entries.length) (byModule[path.relative(path.join(BACKEND, 'src/modules'), sf.fileName).split('/')[0]] ??= []).push({ clsName, prefix, file: path.relative(BACKEND, sf.fileName), entries });
  });
}

out.push('# TrustWow — API reference (sinh tự động từ source)');
out.push(`\n> Nguồn: \`${BACKEND}/src\` (git ${process.env.GIT_REV ?? 'working tree'}). Sinh bằng \`tools/gen-api-reference.mjs\` qua TypeScript compiler API, không viết tay, không sửa backend.`);
out.push('> Response thành công bọc `{success, statusCode, data, meta?}`; lỗi `{success:false, statusCode, error:{code, message, fieldErrors?}}`. IPN VNPay là body trần `{RspCode, Message}`.');
out.push('> **Quy tắc test: KHÔNG seed data; mọi dữ liệu do API tạo; danh sách lấy bằng API GET, không hardcode id/email/số tiền.**');
out.push('> Tiền tố mọi đường dẫn: `/api/v1`. Auth mobile = Bearer; web = cookie + `X-CSRF-Token`. Header `Device-Id` bắt buộc khi đăng nhập.\n');
for (const [mod, ctrls] of Object.entries(byModule)) {
  out.push(`\n## Module \`${mod}\``);
  for (const c of ctrls) {
    out.push(`\n### ${c.clsName}  \`/${c.prefix}\`  — \`${c.file}\``);
    for (const e of c.entries) {
      total += 1;
      out.push(`\n#### \`${e.verb} ${e.url}\``);
      if (e.summary) out.push(e.summary);
      const f = [...(e.classPerms ? [e.classPerms] : []), ...e.flags];
      if (f.length) out.push(`- Điều kiện: ${f.map((x) => `\`${x}\``).join(' · ')}`);
      for (const p of e.params) {
        seen.clear();
        const label = p.kind === 'Body' ? 'Body' : p.kind === 'Query' ? 'Query' : p.kind === 'Param' ? `Path \`${p.arg}\`` : p.kind === 'Headers' ? `Header \`${p.arg}\`` : p.kind;
        const doc = typeDoc(p.ptype, 0);
        out.push(`- ${label}${p.optional ? ' (optional)' : ''}: \`${p.text}\``);
        if (['Body', 'Query'].includes(p.kind)) out.push(...doc.slice(1).map((l) => '  ' + l));
      }
      if (e.ret) {
        seen.clear();
        out.push(`- Response: ${e.env ? `\`${e.env}\` · ` : ''}\`${checker.typeToString(e.ret, undefined, ts.TypeFormatFlags.NoTruncation).slice(0, 120)}\``);
        out.push(...typeDoc(e.ret, 0).slice(1).map((l) => '  ' + l));
      }
      if (e.errs.length) out.push(`- Lỗi/Status: ${e.errs.map((x) => `\`${x}\``).join(' | ')}`);
    }
  }
}
out.splice(5, 0, `> Tổng: **${total} endpoint** thuộc ${Object.keys(byModule).length} module (${Object.keys(byModule).join(', ')}).`);
fs.writeFileSync(OUT, out.join('\n') + '\n');
console.log(`wrote ${OUT}: ${total} endpoints, ${Object.keys(byModule).length} modules, ${out.length} lines`);
