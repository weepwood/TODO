import React from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {safeLink} from './productivity.js';
// Never render raw HTML or fetch embedded remote images (which can reveal viewing activity).
export default function MarkdownPreview({value}){
 return <Markdown remarkPlugins={[remarkGfm]} skipHtml urlTransform={url=>safeLink(url)||''} components={{
  a:({href,children})=>href?<a href={href} target="_blank" rel="noopener noreferrer">{children}</a>:<span>{children}</span>,
  img:({alt})=><span className="muted">[图片：{alt||'未命名'}]</span>,
  input:({checked,type})=>type==='checkbox'?<input type="checkbox" checked={!!checked} readOnly disabled/>:null,
  table:({children})=><div className="md-table"><table>{children}</table></div>
 }}>{value}</Markdown>
}
