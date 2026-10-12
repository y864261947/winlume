// Run with the Codex workspace Node runtime and its artifact-tool dependency.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { documents, sheets, decks, photos, photoTitles, sampleNote } from './showcase-content.mjs';

const root = process.cwd();
const build = path.join(root, 'output/showcase-artifacts-20261012/build');
const out = path.join(root, 'public/reizo/deliverables');
const runtime = process.env.SHOWCASE_RUNTIME || 'C:/Users/PC-20251213/.cache/codex-runtimes/codex-primary-runtime/dependencies';
const require = createRequire(path.join(build, 'runtime.mjs'));
const {Workbook, SpreadsheetFile, Presentation, PresentationFile} = await import(pathToFileURL(require.resolve('@oai/artifact-tool')).href);
const manifest = {};
await fs.mkdir(out, {recursive:true});
await fs.mkdir(path.join(build,'final'), {recursive:true});
const url = name => `/reizo/deliverables/${name}`;
const register = async (id, name, extra={}) => {
  manifest[id] = {href:url(name),bytes:(await fs.stat(path.join(out,name))).size,...extra};
};

for(const [id,doc] of Object.entries(documents)) {
  const body = `# ${doc.title}\n\n${sampleNote}\n\n`+doc.sections.map(([h,p])=>`## ${h}\n\n${p}`).join('\n\n')+'\n';
  const name=id+'.'+doc.name.split('.').pop();
  if(!name.endsWith('docx')) await fs.writeFile(path.join(out,name),body.replace(name.endsWith('txt')?/^#+ /gm:/$^/g,''));
  manifest[id]={href:url(name),bytes:0,body,sections:doc.sections};
  if(!name.endsWith('docx')) manifest[id].bytes=(await fs.stat(path.join(out,name))).size;
}
await fs.writeFile(path.join(build,'documents.json'),JSON.stringify(Object.entries(documents).filter(([,v])=>v.name.endsWith('docx')),null,2));

for(const [id,data] of Object.entries(sheets)) {
  const wb=Workbook.create();const ws=wb.worksheets.add('工作表');ws.showGridLines=false;
  const cols=data.columns.length;const end=String.fromCharCode(64+cols);const last=6+data.rows.length;
  ws.getRange(`A1:${end}${last+1}`).format.font={name:'Microsoft YaHei',size:11,color:'#243B42'};
  ws.getRange(`A1:${end}${last+1}`).format.rowHeight=30;
  ws.getRange(`A1:${end}${last+1}`).format.columnWidth=23;
  ws.getRange(`A1:${end}${last+1}`).format.verticalAlignment='center';
  ws.getRange('A2').values=[[data.title]];ws.getRange('A2').format.font={bold:true,size:17};
  ws.getRange('A3').values=[['虚构项目样例，用于演示交付形式']];ws.getRange('A3').format.font={color:'#73828B',size:10};
  ws.getRange(`A6:${end}6`).values=[data.columns];
  ws.getRange(`A6:${end}6`).format={fill:'#244D5A',font:{name:'Microsoft YaHei',bold:true,color:'#FFFFFF',size:11},rowHeight:36};
  ws.getRange(`A6:${end}6`).format.horizontalAlignment='center';
  const typed=data.rows.map(row=>row.map(x=>typeof x==='string'&&/^2026-\d\d-\d\d$/.test(x)?new Date(x+'T00:00:00Z'):x));
  ws.getRange(`A7:${end}${last}`).values=typed;
  data.rows.forEach((_,i)=>{if(i%2===0)ws.getRange(`A${i+7}:${end}${i+7}`).format.fill='#F0F5F6';});
  if(id==='legal-1') {
    ws.getRange('A4:B4').values=[['合同总额（元）',480000]];
    ws.getRange('B4').format.font={color:'#246CC3'};ws.getRange('B4').setNumberFormat('#,##0');
    for(let r=7;r<=9;r++)ws.getRange(`C${r}`).formulas=[[`=$B$4*B${r}`]];
    ws.getRange('B10:C10').formulas=[['=SUM(B7:B9)','=SUM(C7:C9)']];
    ws.getRange('B7:B10').setNumberFormat('0%');ws.getRange('C7:C10').setNumberFormat('#,##0"   "');
    ws.getRange('D7:D10').format.columnWidth=35;
  }
  if(id==='research-1') {
    for(let r=7;r<=12;r++)ws.getRange(`E${r}`).formulas=[[`=SUM(B${r}:D${r})`]];
    for(let r=8;r<=12;r++)ws.getRange(`F${r}`).formulas=[[`=E${r}/E${r-1}-1`]];
    for(const c of ['B','C','D','E'])ws.getRange(`${c}13`).formulas=[[`=SUM(${c}7:${c}12)`]];
    ws.getRange('F8:F12').setNumberFormat('0.0%');
    ws.getRange('B7:E13').setNumberFormat('#,##0');
    ws.getRange('A4:B4').values=[['6月有效线索（条）',null]];ws.getRange('B4').formulas=[['=E12']];
  }
  if(id==='marketing-0'){ws.getRange('A7:A13').setNumberFormat('yyyy-mm-dd');ws.getRange('A7:A13').format.horizontalAlignment='center';}
  if(id==='office-1'){ws.getRange('C7:C10').setNumberFormat('yyyy-mm-dd');ws.getRange('C7:C10').format.horizontalAlignment='center';}
  if(id==='product-2'||id==='design-1'||id==='office-1')ws.getRange(`A7:A${last}`).format.columnWidth=28;
  ws.freezePanes.freezeRows(6);
  await wb.recalculate();
  const errors=await wb.inspect({kind:'match',searchTerm:'#REF!|#DIV/0!|#VALUE!|#NAME\\?|#NUM!',options:{useRegex:true,maxResults:10},maxChars:1000});
  await fs.writeFile(path.join(build,id+'-checks.json'),JSON.stringify({inspection:errors,values:ws.getRange(`A7:${end}${last}`).values},null,2));
  const dataValues=ws.getRange(`A7:${end}${last}`).values;
  if(id==='legal-1'&&dataValues[3][2]!==480000)throw new Error('Payment total mismatch');
  if(id==='research-1'&&(dataValues[5][4]!==690||dataValues[6][4]!==2700))throw new Error('Leads total mismatch');
  await (await SpreadsheetFile.exportXlsx(wb)).save(path.join(build,id+'.xlsx'));
  await fs.copyFile(path.join(build,id+'.xlsx'),path.join(out,id+'.xlsx'));
  // Same calculated cells feed the website preview, avoiding duplicate sample data.
  const rows=dataValues.map(row=>row.map((v,c)=>{
    if(v==null)return '—';
    if((id==='legal-1'&&c===1)||(id==='research-1'&&c===5))return (Number(v)*100).toFixed(id==='legal-1'?0:1)+'%';
    if((id==='marketing-0'&&c===0)||(id==='office-1'&&c===2))return data.rows[dataValues.indexOf(row)][c];
    return typeof v==='number'?v.toLocaleString('en-US'):String(v);
  }));
  await register(id,id+'.xlsx',{headings:data.columns,rows,detail:`${data.rows.length} 行 · 可编辑工作簿`,formula:id==='legal-1'?'=$B$4*B7':id==='research-1'?'=SUM(B7:D7)':''});
}

const skill='C:/Users/PC-20251213/.codex/plugins/cache/openai-primary-runtime/presentations/26.1007.11041/skills/presentations';
const {finalizePresentation}=await import(pathToFileURL(path.join(skill,'container_tools/artifact_tool_utils.mjs')).href);
for(const [id,deck] of Object.entries(decks)) {
  const p=Presentation.create({slideSize:{width:1280,height:720}});
  const texts=[];
  for(const [index,content] of deck.slides.entries()) {
    const s=p.slides.add();s.background.fill=index===0?'#E8EEEA':'#FAFBF8';
    const text=(value,x,y,w,h,size,color='#203D35',bold=false)=>{const box=s.shapes.add({geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});box.text=value;box.text.style={typeface:'Microsoft YaHei',fontSize:size,color,bold};};
    const hasPhoto=index===0&&id==='product-0';
    if(hasPhoto)s.images.add({blob:new Uint8Array(await fs.readFile(path.join(root,content.image))),contentType:'image/png',fit:'cover',position:{left:590,top:0,width:690,height:720}});
    text(hasPhoto?'MORI\n轻盈修护系列':content.title,70,95,hasPhoto?490:1100,150,index===0?52:44,'#203D35',true);
    text(content.body,74,index===0?295:275,hasPhoto?470:1080,300,index===0?25:29,'#466158');
    text('虚构项目样例   /   REIZO',74,650,780,30,15,'#75867E');text(`${index+1} / ${deck.slides.length}`,1150,650,80,30,15,'#75867E');
    texts.push(content.title);
  }
  const draft=path.join(build,id+'.pptx');await(await PresentationFile.exportPptx(p)).save(draft);
  const revision=Date.now();
  const final=path.join(build,'final',id+'-'+revision+'.pptx');
  await finalizePresentation({workspaceDir:root,candidatePath:draft,finalPath:final,pythonExecutable:path.join(runtime,'python/python.exe'),integrityValidatorPath:path.join(skill,'container_tools/inspect_presentation_package_integrity.py'),layoutValidatorPath:path.join(skill,'container_tools/inspect_presentation_layout_geometry.py'),layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-heading-fit'],fontPolicy:{basis:'design',families:['Microsoft YaHei']},verifyArtifactToolImport:true,receiptPath:path.join(build,id+'-'+revision+'-validation.json')});
  await fs.copyFile(final,path.join(out,id+'.pptx'));
  await register(id,id+'.pptx',{pages:deck.slides.map((_,i)=>url(`${id}-${i+1}.png`)),pageTitles:texts,detail:`${deck.slides.length} 页 · 可编辑演示稿`});
}

await register('video-2','../showcase/everyday-film.mp4',{href:'/reizo/showcase/everyday-film.mp4',detail:'MP4 · 可播放成片'}).catch(async()=>{manifest['video-2']={href:'/reizo/showcase/everyday-film.mp4',bytes:(await fs.stat(path.join(root,'public/reizo/showcase/everyday-film.mp4'))).size,detail:'MP4 · 可播放成片'};});
await register('video-0','../showcase/film-poster.jpg',{href:'/reizo/showcase/film-poster.jpg',detail:'JPG · 产品起始素材'});
manifest['design-0']={href:url('spring-visuals.zip'),bytes:0,detail:'6 张原始 JPG',images:photos.map((p,i)=>({src:`/reizo/assets/nynor/${p}.jpg`,title:photoTitles[i]}))};
await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2));
await fs.writeFile(path.join(build,'content.json'),JSON.stringify({documents,sheets,decks,sampleNote},null,2));
console.log('Editable deliverables and manifest created. Render documents/slides and complete asset metadata next.');
