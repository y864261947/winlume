/* Public catalogue snapshot, 2026-09-26. Not a live availability feed.
 * Migrated from the previously reviewed catalogue; public navigation now stays local.
 * Amounts retain the source's group-adjusted USD prices; do not multiply again.
 * preview = not open in source; review = inconsistent source unit/classification.
 * External API compatibility has NOT been verified for individual models.
 */
(() => {
  const models = [];
  const add = (id, provider, category, price, group, extra = {}) => models.push({id, provider, category, price, group, status:'reference', ...extra});
  const token = (input, output, from = true) => ({input, output, unit:'token', from});
  const call = (amount, from = false) => ({amount, unit:'call', from});
  add('gpt-6-astra','OpenAI','text',token('0.900','4.50'),'福利分组 · ×0.09');
  add('claude-sonnet-5','Anthropic','text',token('0.500','2.50'),'kiro对接 · ×0.25');
  add('gemini-3.8-flash','Google Gemini','text',token('0.300','1.50'),'Gemini · ×0.4');
  add('deepseek-v4-flash','DeepSeek','text',token('0.300','1.20',false),'国模 · ×0.3');
  ['gpt-image-2','gpt-image-2.5','gpt-image-2.5-flare','gpt-image-2.5-sunburst'].forEach(id => add(id,'OpenAI','image',call('0.040',true),'生图分组 · ×0.4'));
  add('gpt-5.5','OpenAI','text',token('0.450','2.70',false),'福利分组 · ×0.09');
  add('gpt-5.6-sol','OpenAI','text',token('0.450','2.70'),'福利分组 · ×0.09');
  add('claude-fable-5','Anthropic','text',token('10.0','50.0'),'福利claude · ×1');
  ['claude-opus-5','claude-opus-4-8','claude-opus-4-7','claude-opus-4-6'].forEach(id => add(id,'Anthropic','text',token('1.25','6.25'),'kiro对接 · ×0.25'));
  add('claude-sonnet-4-6','Anthropic','text',token('0.750','3.75'),'kiro对接 · ×0.25');
  ['gemini-3.7-flash','gemini-3.6-flash'].forEach(id => add(id,'Google Gemini','text',token('0.300','1.50'),'Gemini · ×0.4'));
  ['gemini-3.1-flash-image','gemini-3.1-flash-image-preview'].forEach(id => add(id,'Google Gemini','image',call('0.450'),'生图分组-4k · ×1'));
  ['gemini-3-pro-image','gemini-3-pro-image-preview'].forEach(id => add(id,'Google Gemini','image',call('0.600'),'生图分组-4k · ×1'));
  ['grok-imagine-video','grok-imagine-video-1.5'].forEach(id => add(id,'xAI','video',call('2.50'),'视频分组 · ×1'));
  const unitNote = '原目录显示输入、输出均为 $75.0 / 1M tokens，与视频任务的计费维度需要进一步核对。暂不作为已确认的调用价格。';
  ['wan3.0-video','wan3.0-video-prime'].forEach(id => add(id,'通义万相','video',token('75.0','75.0',false),'视频分组 · ×1',{status:'review', note:unitNote}));
  [['2k','1.50'],['2k-pro','2.00'],['480p','1.30'],['720p','1.40']].forEach(([version, amount]) => {
    add('MiniMaxH3-'+version,'MiniMax','video',call(amount),'视频分组 · ×1',{note:'根据原目录的视频计费分组归入视频。原目录能力标签为语言大模型，具体能力与接口请向平台确认。'});
    ['-sec','-sec-nf'].forEach(suffix => add('MiniMaxH3-'+version+suffix,'MiniMax','video',token('75.0','75.0',false),'视频分组 · ×1',{status:'review',note:unitNote}));
  });
  [['gpt-5.3-codex-spark','OpenAI','text'],['gpt-5.4','OpenAI','text'],['gpt-5.6-terra','OpenAI','text'],['eleven_multilingual_v2','ElevenLabs','audio'],['whisper-large-v3-turbo','Groq','audio'],['Tavily Search','Tavily','search'],['Jina Reader','Jina Reader','search'],['jina-embeddings-v3','Jina','rag'],['jina-reranker-v2-base-multilingual','Jina','rag'],['openai/text-embedding-3-small','OpenRouter','rag']].forEach(([id,provider,category]) => add(id,provider,category,null,null,{status:'preview'}));
  window.REIZO_API_CATALOG = Object.freeze({updated:'2026-09-26',source:'api.html#catalog', models});
})();
