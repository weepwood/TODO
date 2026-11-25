import React,{createContext,useContext,useId} from 'react';
import {AlertCircle,Info,CheckCircle2} from 'lucide-react';
const FieldContext=createContext(null);
export function useFieldControl(){
 const f=useContext(FieldContext);
 return f?{id:f.controlId,'aria-describedby':f.descriptionId,'aria-invalid':f.error||undefined}:{};
}
// Nested editors own their own input IDs, not the outer trigger label.
export function FieldControlBoundary({children}){return <FieldContext.Provider value={null}>{children}</FieldContext.Provider>}
export function FieldMessage({id,error,help,success,announce=true}){
 const Icon=error?AlertCircle:success?CheckCircle2:Info;
 return error||help||success?<small id={id} className="field-feedback" data-tone={error?'error':success?'success':'help'} role={error&&announce?'alert':undefined}><Icon size={13} aria-hidden="true"/><span>{error||success||help}</span></small>:null;
}
export function FeedbackField({label,children,error,help,success,required=false,announce=true}){
 const id=useId(),controlId=id+'-control',descriptionId=error||help||success?id+'-message':undefined;
 // Only the control receives the label ID; no wrapping label around multiple buttons.
 const child=React.isValidElement(children)&&typeof children.type==='string'?React.cloneElement(children,{id:controlId,'aria-describedby':descriptionId,'aria-invalid':!!error||undefined}):children;
 return <div className="field field-with-feedback" data-invalid={!!error||undefined}><span><label htmlFor={controlId}>{label}</label>{required&&<span aria-hidden="true" className="field-required"> *</span>}</span><div className="field-control"><FieldContext.Provider value={{controlId,descriptionId,error:!!error}}>{child}</FieldContext.Provider><FieldMessage id={descriptionId} error={error} help={help} success={success} announce={announce}/></div></div>
}
export function numberError(value,min,max){const raw=String(value??'').trim();if(!raw)return '请输入数值';if(!Number.isInteger(Number(raw)))return '请输入整数';if(Number(raw)<min||Number(raw)>max)return '请输入 '+min+' 至 '+max+' 之间的整数';return ''}
