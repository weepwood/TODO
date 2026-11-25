import React from 'react';
import {Switch} from '../design-system/Controls.jsx';
import {InfoTip} from '../design-system/InfoTip.jsx';

export function FocusRecordPreference({config,update}){
 return <div className="task-preference-row focus-record-preference"><div><strong>忽略不足 1 分钟的专注</strong> <InfoTip label="短时专注统计说明">开启后，结束正计时或番茄钟时，累计有效专注不足60秒不保存，不计入时长、次数或活动历史。达到60秒正常记录。关闭后，任何大于0秒的有效专注均可保存。已有记录不受影响。</InfoTip></div><Switch aria-label="忽略不足 1 分钟的专注" checked={config.ignoreShortSessions!==false} onCheckedChange={value=>update(d=>({...d,focusConfig:{...d.focusConfig,ignoreShortSessions:value}}))}/></div>
}
