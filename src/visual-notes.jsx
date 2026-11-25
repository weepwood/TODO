import React,{useState,useRef} from 'react';
import {useEditor,EditorContent,useEditorState} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {Markdown} from '@tiptap/markdown';
const normalized=s=>s.replace(/\r\n/g,'\n').replace(/\n+$/,'');
export function visualSourceAllowed(text){
 // Avoid parsing arbitrary HTML into the rich editor. Complex/unsupported Markdown
 // stays in the original source editor; conversion must also round-trip losslessly.
 return text.length<=100000&&!/[<>]/.test(text)&&!/(?:!\[|\]\(|^\s*\[[^\]]+\]:|^\s*[-*+] \[[ xX]\]|^\s*\|)/m.test(text)
}
function Inner({initial,onChange,locked}){
 const [compatible,setCompatible]=useState(null),ready=useRef(false);
 const editor=useEditor({
  extensions:[StarterKit.configure({link:false,underline:false,trailingNode:false}),Markdown],
  content:initial,contentType:'markdown',editable:false,
  editorProps:{attributes:{'aria-label':'可视化备注编辑器',role:'textbox','aria-multiline':'true',class:'visual-note-content'},handlePaste(view,event){const text=event.clipboardData?.getData('text/plain');if(text===undefined)return true;event.preventDefault();if(text)view.dispatch(view.state.tr.insertText(text));return true}},
  onCreate({editor}){try{const same=normalized(editor.getMarkdown())===normalized(initial);ready.current=same;setCompatible(same);editor.setEditable(same&&!locked)}catch{setCompatible(false)}},
  onUpdate({editor}){if(ready.current)onChange(editor.getMarkdown())}
 });
 const flags=useEditorState({editor,selector:({editor:e})=>e?{bold:e.isActive('bold'),italic:e.isActive('italic'),heading:e.isActive('heading',{level:2}),bullet:e.isActive('bulletList'),ordered:e.isActive('orderedList'),quote:e.isActive('blockquote'),code:e.isActive('codeBlock'),strike:e.isActive('strike')}:{}});
 if(compatible===false)return <p role="alert" className="sync-error">此备注不能无损转换为可视化编辑内容。请切回源码模式；原文没有改变。</p>;
 if(!editor||compatible===null)return <p className="muted">检查 Markdown 兼容性…</p>;
 const items=[['bold','B','粗体',()=>editor.chain().focus().toggleBold().run()],['italic','I','斜体',()=>editor.chain().focus().toggleItalic().run()],['heading','H2','二级标题',()=>editor.chain().focus().toggleHeading({level:2}).run()],['bullet','• 列表','无序列表',()=>editor.chain().focus().toggleBulletList().run()],['ordered','1. 列表','有序列表',()=>editor.chain().focus().toggleOrderedList().run()],['quote','❝','引用',()=>editor.chain().focus().toggleBlockquote().run()],['code','代码块','代码块',()=>editor.chain().focus().toggleCodeBlock().run()],['strike','S','删除线',()=>editor.chain().focus().toggleStrike().run()]];
 return <div className="visual-note"><div className="visual-note-toolbar" role="toolbar" aria-label="可视化格式">{items.map(([key,label,name,run])=><button key={key} type="button" aria-label={name} aria-pressed={!!flags?.[key]} className={flags?.[key]?'chosen':''} disabled={locked} onMouseDown={e=>e.preventDefault()} onClick={run}>{label}</button>)}<button type="button" disabled={locked} onClick={()=>editor.chain().focus().undo().run()}>撤销</button><button type="button" disabled={locked} onClick={()=>editor.chain().focus().redo().run()}>重做</button></div><EditorContent editor={editor}/></div>
}
export default function VisualNotes({initial,onChange,locked}){
 if(!visualSourceAllowed(initial))return <p role="alert" className="sync-error">此备注包含复杂 Markdown、HTML、链接、图片或超长文本。为保护原始内容，请使用源码编辑模式。</p>;
 return <Inner initial={initial} onChange={onChange} locked={locked}/>
}
