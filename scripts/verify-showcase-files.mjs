import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(path.resolve('output/showcase-artifacts-20261012/build/runtime.mjs'));
const {FileBlob,SpreadsheetFile}=await import(pathToFileURL(require.resolve('@oai/artifact-tool')).href);
const out=path.resolve('public/reizo/deliverables');
const manifest=JSON.parse(await fs.readFile(path.join(out,'manifest.json'),'utf8'));
assert.equal(Object.keys(manifest).length,24);
for(const item of Object.values(manifest)){
  const stat=await fs.stat(path.resolve('public',item.href.slice(1)));
  assert.equal(item.bytes,stat.size);assert.ok(stat.size>0);
  for(const page of item.pages??[])await fs.access(path.resolve('public',page.slice(1)));
}
const payment=await SpreadsheetFile.importXlsx(await FileBlob.load(path.join(out,'legal-1.xlsx')));
const p=payment.worksheets.getItemAt(0);
p.getRange('B4').values=[[600000]];await payment.recalculate();
assert.equal(p.getRange('C7').values[0][0],180000);
assert.equal(p.getRange('C10').values[0][0],600000);
const leads=await SpreadsheetFile.importXlsx(await FileBlob.load(path.join(out,'research-1.xlsx')));
const l=leads.worksheets.getItemAt(0);
l.getRange('B12').values=[[330]];await leads.recalculate();
assert.equal(l.getRange('E12').values[0][0],700);
assert.equal(l.getRange('E13').values[0][0],2710);
console.log('24 assets and preview references verified; imported Excel formulas respond to input changes.');
