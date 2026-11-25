import {isTauri} from '@tauri-apps/api/core';
import {detectPlatform} from './capabilities.js';
export const platform=detectPlatform(isTauri(),typeof navigator==='undefined'?'':navigator.userAgent);
export const native=platform.native,desktopNative=platform.desktop,mobileNative=platform.mobile;
