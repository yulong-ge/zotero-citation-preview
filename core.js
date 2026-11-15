/* Shared pure reference validation; network data is never treated as a match by rank alone. */
(function (root) {
  const words = text => String(text).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
  function referenceText(ref) {
    return (ref.chars || []).filter(c => !c.ignorable).map(c => c.c + (c.spaceAfter || c.lineBreakAfter ? ' ' : '')).join('').replace(/\s+/g, ' ').trim();
  }
  function validateCarrier(raw, work) {
    const publishers=[
      {pattern:/\bMIT\s+press\b/i,tokens:['mit','press']},
      {pattern:/\bCambridge\s+University\s+Press\b/i,tokens:['cambridge','university','press']},
      {pattern:/\bOxford\s+University\s+Press\b/i,tokens:['oxford','university','press']}
    ];
    const publisher=publishers.find(p=>p.pattern.test(raw));
    const isbn=/\bISBN(?:-1[03])?\s*[:\d]/i.test(raw);
    const venue=/\b(?:journal|transactions|proceedings|conference|symposium|workshop|neurips|nips|iclr|icml|cvpr|eccv|iccv)\b|\bin\s+advances\s+in\b/i.test(raw);
    // A named publisher without an article venue identifies a book; the word "Press" alone does not.
    if(!isbn && (!publisher || venue)) return true;
    if(!['book','monograph','edited-book','reference-book'].includes(work.type) || !work.publisher?.trim()) return false;
    const candidate=new Set(words(work.publisher));
    return !publisher || publisher.tokens.every(token=>candidate.has(token));
  }
  function validate(raw, work) {
    const title = work.title?.[0];
    const tokens = words(title).filter(x => x.length > 2);
    const input = new Set(words(raw));
    const titleMatch = tokens.length >= 3 && tokens.filter(x => input.has(x)).length / tokens.length >= .9;
    const authorMatch = (work.author || []).some(a => words(a.family).filter(x => x.length > 2).every(x => input.has(x)) && words(a.family).some(x => x.length > 2));
    const year = work.published?.['date-parts']?.[0]?.[0];
    const years = (raw.match(/\b(?:19|20)\d{2}\b/g) || []).map(Number);
    return !!(validateCarrier(raw,work) && titleMatch && authorMatch && years.length && year && years.some(y => Math.abs(y - year) <= 1));
  }
  function invertedAbstract(index) {
    if (!index) return '';
    const result = [];
    for (const [word, positions] of Object.entries(index)) for (const position of positions) result[position] = word;
    return result.join(' ');
  }
  function markerNumber(chars, rect) {
    const value = chars.filter(c => c.rect && !c.ignorable && (c.rect[0]+c.rect[2])/2 >= rect[0] && (c.rect[0]+c.rect[2])/2 <= rect[2] && (c.rect[1]+c.rect[3])/2 >= rect[1] && (c.rect[1]+c.rect[3])/2 <= rect[3]).map(c => c.u || c.c).join('');
    const match = value.match(/^\s*\[?\s*(\d{1,3})\s*[\],]?\s*$/);
    if (!match) throw new Error('引用链接的可见标记不是单一编号，未猜测引用。');
    return Number(match[1]);
  }
  function extractNumberedReference(chars, point, expected) {
    if (!Array.isArray(chars) || chars.length > 30000) throw new Error('参考文献目标页字符数据无效或超过单页解析上限。');
    const lines = []; let line = [];
    for (let i=0;i<chars.length;i++) {
      const c=chars[i]; line.push(c);
      if (c.lineBreakAfter || c.paragraphBreakAfter || i===chars.length-1) {
        const usable=line.filter(x=>!x.ignorable && x.rect);
        if (usable.length) lines.push({ text: usable.map(x=>(x.u||x.c)+(x.spaceAfter?' ':'')).join('').trim(), chars: usable, y0:Math.min(...usable.map(x=>x.rect[1])),y1:Math.max(...usable.map(x=>x.rect[3])) });
        line=[];
      }
    }
    const starts=lines.map((line,index)=>{
      const match=line.text.match(/^(?:\[(\d{1,3})\]|(\d{1,3})\.)\s*\S/);
      return {line,index,number:match?Number(match[1]||match[2]):null};
    }).filter(x=>x.number);
    const matches=starts.filter(x=>x.number===expected && point[1]>=x.line.y0-18 && point[1]<=x.line.y1+18);
    if(matches.length!==1) throw new Error('目的地附近没有唯一且与正文编号一致的参考文献起点。');
    const start=matches[0]; const next=starts.find(x=>x.index>start.index);
    if(!next || next.number!==expected+1) throw new Error('未找到下一条连续编号，无法确认完整参考文献边界。');
    const raw=lines.slice(start.index,next.index).map(x=>x.text).join(' ').replace(/\s+/g,' ').trim();
    if(raw.length<30 || raw.length>3000 || !/\b(?:19|20)\d{2}\b/.test(raw)) throw new Error('目标条目缺失可核对年份或长度不符合完整参考文献。');
    return raw;
  }
  const api = { words, referenceText, validate, validateCarrier, invertedAbstract, markerNumber, extractNumberedReference };
  if (typeof module !== 'undefined') module.exports = api;
  else root.CitationCore = api;
})(this);
