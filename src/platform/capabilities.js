// UA is a presentation/capability hint only; IPC authorization is enforced by Rust.
export function detectPlatform(isNative,userAgent=''){
 const android=/Android/i.test(userAgent),ios=/iPhone|iPad|iPod/i.test(userAgent);
 const kind=!isNative?'web':android?'android':ios?'ios':'desktop';
 return Object.freeze({kind,native:!!isNative,desktop:kind==='desktop',mobile:kind==='android'||kind==='ios',independentCapture:kind==='desktop',systemTray:kind==='desktop',globalShortcut:kind==='desktop',backgroundSync:false,scheduledMobileReminder:false});
}
